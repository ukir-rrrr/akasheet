# 端末間同期（同期ファイル方式）設計

## 目的とスコープ

akasheet は端末内 SQLite とローカル画像で完結している。本ドキュメントは **第1段階: サーバー不要の「同期ファイル」方式**（`.akasheet` バンドルの書き出し／取り込み）の設計を定義する。第2段階の常設サーバー同期は同じマージ層の上にトランスポートだけ足す想定で、ここでは拡張点のみ記す。

### 制約（プロダクト）

| 要件                           | 設計への反映                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| 運用コストゼロ                 | 自前サーバー・BaaS の常設インスタンスを使わない                                       |
| 秘密情報をリポジトリに置かない | API キー不要。バンドルに DEK を平文で同梱しない                                       |
| Expo Go（SDK 58）で動く        | `expo-document-picker` / `expo-sharing`（または OS 共有シート）＋既存 `fflate` で zip |
| アカウント不要                 | 端末 `device_id`（`app_meta`）とバンドル内メタデータのみで識別                        |

### 既存データモデルとの関係

現行スキーマ（`src/data/db/migrations.ts`）は同期を塞がない形になっている。

- **ID**: UUIDv7（`src/shared/id.ts`）。マージ後も ID は安定。
- **論理削除**: `folders` / `cards` / `masks` / `media` に `deleted_at`。
- **行の更新時刻**: `updated_at`（LWW の主キー）。
- **カード**: `created_device_id`、`source` + `external_id`（取り込み系は live 行のみ一意、`idx_cards_external`）。
- **画像**: `media.sha256` 一意、パスは端末ローカル。実体は内容アドレス（ハッシュ）で突き合わせ。
- **復習履歴**: `review_logs` は追記専用（`device_id`、`time_zone`、`undone_at`）。`review_states` はキャッシュ。
- **暗号化（PR #9 相当）**: DEK は Secure Store。DB の機微フィールド（マスク geometry 等）と画像は DEK で暗号化。読み取り専用モード時はマージ不可。

---

## 1. 同期バンドル形式（`.akasheet`）

### 概要

- **拡張子**: `.akasheet`（実体は ZIP。`fflate` で生成／解析）。
- **用途**: **全量（full）** スナップショットを1ファイルにまとめ、iCloud Drive・AirDrop・「ファイルに保存」等で他端末へ渡す。第1段階では差分（delta）は出さない。

### ファイルレイアウト

```
bundle.akasheet (zip)
├── manifest.json          # 必須・最初に読む
├── rows/
│   ├── folders.jsonl
│   ├── cards.jsonl
│   ├── masks.jsonl
│   ├── media.jsonl        # メタのみ（path はエクスポート側の参照用、取り込みは sha256 で突合）
│   ├── review_logs.jsonl
│   └── tombstones.jsonl   # 任意: 物理削除予定のメタ（GC 用、後述）
└── media/
    └── <sha256>.bin       # 欠けている画像・サムネの平文 JPEG バイト（復号後）
```

### `manifest.json`

| フィールド           | 型                | 説明                                                                             |
| -------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `format`             | `"akasheet-sync"` | 固定                                                                             |
| `bundle_version`     | `number`          | バンドル仕様の版（初期値 `1`）                                                   |
| `app_version`        | `string`          | 書き出し時のアプリ版（`package.json` / `expo-constants`）                        |
| `exported_at`        | `number`          | Unix ms（`Clock.now()`）                                                         |
| `exporter_device_id` | `string`          | `app_meta.device_id`                                                             |
| `exporter_time_zone` | `string`          | `deviceTimeZone()`                                                               |
| `mode`               | `"full"`          | 第1段階は **常に `"full"`**（`"delta"` は第2段階以降の拡張）                     |
| `cursor`             | `object`          | 下記「同期カーソル」（メタデータ・peer 比較用。第1段階は差分書き出しに使わない） |
| `content_encryption` | `"none"`          | 第1段階は **暗号化しない**（理由は後述）                                         |
| `row_counts`         | `object`          | 各 JSONL の行数（プレビュー用）                                                  |
| `media_hashes`       | `string[]`        | 同梱した `media/<sha256>.bin` の一覧                                             |

### 同期カーソル（バンドル内）

エクスポート時点のスナップショット境界を記録する（取り込み側の **同一 peer 再取り込み警告** や、第2段階の delta 拡張の土台）。

```json
{
  "schema_user_version": 2,
  "folders_max_updated_at": 123,
  "cards_max_updated_at": 456,
  "masks_max_updated_at": 789,
  "media_max_updated_at": 101,
  "review_logs_max": { "reviewed_at": 999, "id": "01933..." }
}
```

**第1段階（full のみ）**: 論理削除行も含め、マージに必要な全行＋参照される全 `review_logs`＋ live カードが参照する全 `media` ハッシュのファイルを同梱する。`manifest.mode` は常に `"full"`。

**第2段階以降（未実装）**: `mode: "delta"` とローカル `export_cursor` により、`updated_at` または `review_logs` の `(reviewed_at, id)` 以降の行だけ JSONL に載せる差分書き出しを検討する。`included_log_ids` 等の重複検知フィールドも delta 向け。

### 行 JSONL の1行

DB 行を JSON オブジェクト1行に直列化する。機微フィールドは **エクスポート時に平文へ復号**して載せる（取り込み側で再 seal）。列名は DB に合わせる（例: `folder_id`, `deleted_at`）。

`review_logs` は DB 列をそのまま export（`device_id` / `time_zone` 含む）。

### 画像の同梱

- キー: `media/<sha256>.bin`（拡張子は中身が JPEG でも `.bin` で統一し、MIME は `media.jsonl` の `mime`）。
- エクスポート側: ローカルストアから DEK で復号した **平文 JPEG** を書き込む。
- 取り込み側: バイトの SHA-256 を検証し、既存 `media` 行があれば `upsertMedia` と同様に再利用。なければ暗号化してストアへ保存し新規 `media.id` を発行（カード行の `media_id` はマージ規則で解決）。

### バンドルを暗号化するか

**第1段階: 暗号化しない（`content_encryption: "none"`）。**

| 案                               | 採否        | 理由                                                                               |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| バンドル全体をパスフレーズで AES | 将来可      | UX（パスフレーズ共有・忘れ）と実装コスト。第1段階のゴールは「2台を一致させる」こと |
| DEK をバンドルに同梱             | **禁止**    | iCloud 上に鍵が平文で残り、端末暗号化の意味が薄れる                                |
| 端末間で鍵交換                   | 第2段階以降 | アカウントなしでの安全な鍵配送が別問題                                             |

ユーザーは共有先（iCloud 等）のアクセス制御に依存する。README の「教材写真をコミットしない」と同様、**同期ファイルも他人と共有しない前提**を UI で明示する。

---

## 2. マージ規則

マージは **純関数**（`src/sync/merge/`）で行い、出力は「適用プラン」（挿入／更新／スキップ）とプレビュー統計。DB 書き込みはリポジトリ層のトランザクション1本で適用する。

### 2.1 行単位 LWW（folders / cards / masks / media メタ）

対象: 同じ `id` の2行。

1. `deleted_at` が非 null の行と null の行を比較する場合も **updated_at LWW** を先に適用する（削除も `updated_at` を更新している）。
2. `updated_at` が大きい方が勝ち。
3. 同点のとき **`id`（UUIDv7）の辞書順比較のみ**でタイブレーク（`folders` / `cards` / `masks` / `media` 共通）。`created_device_id` は作成端末固定のためタイブレークに使わない。RFC 9562 の時刻成分により、実質「後に採番された ID」が勝つ。

`updated_device_id` 列は **第1段階では追加しない**。同点 LWW が問題になった場合のみ、後続 migration で検討する。

**削除勝ち**: 勝った行の `deleted_at != null` なら論理削除を採用。

**復活**: 相手がより新しい `updated_at` で `deleted_at = null` に戻していれば復活。古い削除行だけでは復活しない。

### 2.2 `review_logs` の和集合

- キー: `id`（UUIDv7）。**同一 ID は1行のみ**（完全一致ならスキップ）。
- 新規 ID はすべて挿入（`device_id` はログに記録された値を保持。取り込み側の device_id で上書きしない）。
- `undone_at` が設定されたログも行として同期し、マージ後に再生へ含める（未 undo のみ有効という扱いは DB と同じ）。

### 2.3 `review_states` の再生

マージでは **`review_states` 行を LWW しない**（ログと競合するため）。

1. `review_logs` の和集合をカードごとにマージ。
2. 各 `card_id` で `reviewRepo.replay` と同等の純関数 `replayReviewState(cardId, logs, scheduler, cardCreatedAt)` を実行（`src/domain/scheduler`、各ログの `time_zone` と `reviewRng(cardId, reviewed_at)` を使用）。
3. 得られた状態で `review_states` を **UPSERT**（`algorithm` は live スケジューラ ID。import 由来ログは既存の `IMPORTED_ALGORITHM` 行を含めた上で replay）。

取り込み専用の「最終 state だけ送る」フィールドは第1段階では載せない（ログが真実の源）。

### 2.4 衝突例

| シナリオ             | 端末A                                    | 端末B                                                       | マージ結果               |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| フォルダ名変更       | `name=数学`, `updated_at=100`            | `name=算数`, `updated_at=200`                               | B の名前                 |
| カード移動           | `folder_id=F1`, `updated_at=100`         | `folder_id=F2`, `updated_at=150`                            | F2 所属                  |
| マスク編集           | マスク M1 geometry 更新 `updated_at=100` | 同 M1 を削除 `deleted_at` 付き `updated_at=120`             | 削除（新しい方）         |
| 片方だけ復習         | ログ L1                                  | ログ L2（別 ID）                                            | 両方挿入 → replay で合成 |
| 同一カードに同時復習 | 同じ `reviewed_at`、異なる `id`          | 両方挿入。replay 順は `reviewed_at`, `id` 昇順（DB と同じ） |

### 2.5 `(source, external_id)` 一意制約

- インデックス: live 行のみ `UNIQUE(source, external_id)`（migration v2）。
- **マージ時**: 取り込む `cards` 行が既存 live カードと同じ `(source, external_id)` だが **id が異なる**場合:
  1. **LWW で勝った行の id** を正とする。
  2. 敗者 id は論理削除（`deleted_at = now`, `updated_at = now`）— または挿入をスキップし勝者の内容で更新（実装は1トランザクションで整合）。
- `external_id` が null の手撮りカードは衝突しない（別 id のまま共存）。

### 2.5.1 取り込みで新規フォルダを作るときの `sort_order`

バンドルに含まれるフォルダがローカルに存在しない場合、マージ適用時に作成する。`sort_order` は **既存 live フォルダの `max(sort_order) + 1`** を起点とし、同一取り込みで複数フォルダを新規作成する場合は **バンドル内の出現順** に +1 ずつ割り当てる（`folderRepo` の並びと整合）。

### 2.6 マージの代数性（テストで保証）

任意の端末ローカル状態 `A`, `B` とバンドル経由のマージ `⊕` について:

- **冪等**: `A ⊕ export(A) = A`（同一内容の full バンドルの再取り込みは no-op）
- **可換**: `A ⊕ B` と `B ⊕ A` は往復後に一致（ログ和集合＋決定的 LWW）
- **結合**: 3台チェーンでも最終的に同じ集合（実機はペアwise 同期で十分）

---

## 3. スキーマ追加・マイグレーション・物理削除 GC

### 3.1 新テーブル `sync_state`（単一端末のエクスポート／取り込み状態）

```sql
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON
);
```

第1段階で使うキー（JSON の中身例）:

| key                   | 内容                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `import_peers`        | `{ "<exporter_device_id>": { "last_cursor": {...}, "last_imported_at": ms, "last_exported_at": ms } }` 等 |
| `last_full_export_at` | 直近の full 書き出し完了時刻（GC・UX 用）                                                                 |

`export_cursor`（差分書き出し用のローカルカーソル）は **第1段階では持たない**。第2段階で delta を実装する際に `sync_state` へ追加する。

**peer 管理**: 取り込み時に `import_peers[exporter_device_id]` を更新する。同じ相手から **同一 `exported_at`（または同一バンドルハッシュ）** の full を再取り込みする場合はプレビューで警告（第1段階は full のみのため、delta の「包含範囲」判定は第2段階）。

### 3.2 `server_version`（第1段階は任意）

第2段階のサーバー同期向けに、各行に `server_version INTEGER` を足す案:

- 第1段階: **列は追加しない**（常に 0 扱いの純関数マージのみ）。
- 第2段階: サーバーが単調増加 `server_version` を付与し、LWW の前に「サーバー版が新しい方」を優先。

追加する場合は migration v3 で `DEFAULT 0`、既存行は 0。バンドル JSONL にも列を含める。

### 3.3 `updated_device_id`（第1段階では採用しない）

LWW 同点は **`id` の辞書順のみ**（§2.1）。`updated_device_id` 列は追加しない。運用で同点衝突が目立つ場合に限り、後続 migration で `(updated_at, updated_device_id)` タイブレークを検討する。

### 3.4 マイグレーション手順

1. `MIGRATIONS` に v3: `sync_state` テーブル作成のみ。
2. 初回起動で `import_peers` を `{}`、`last_full_export_at` を未設定（null 相当）で初期化。
3. 既存ユーザーの DB はそのまま。同期機能はオプトイン UI（**iOS/Android・Expo Go**。Web 本番 UI には出さない — §5.5）。

### 3.5 物理削除（GC）条件の変更

現状: `mediaRepo.purgeUnreferenced(cutoff)` は、参照カードがすべて `deleted_at < cutoff` のとき media を論理削除。

**同期対応後**:

- 論理削除された行は **full バンドルに含めてから** でないと他端末に削除が伝わらない（第1段階は常に full 書き出し）。
- **物理ファイル削除**は次をすべて満たすときのみ:
  1. ローカルで media が論理削除済み
  2. `sync_state.last_full_export_at` が、その media の `updated_at` 以降（＝削除を含む状態を少なくとも1回 full 書き出した）
  3. （第2段階・複数 peer 時）各 `import_peers` が当該削除を取り込み済み、など追加条件を検討

第1段階（2台・手動 full ファイル）では (1)(2) までで十分。

---

## 4. モジュール構成（純関数と境界）

```
src/sync/
  types.ts           # BundleManifest, Cursor, Row DTO, MergePlan, MergeStats
  cursor.ts          # カーソル比較・進める（純関数）
  serialize/
    exportBundle.ts  # DB スナップショット → .akasheet（IO は引数の port）
    parseBundle.ts   # zip → 検証済み構造体
  merge/
    lww.ts           # 単一行 LWW
    mergeLogs.ts     # review_logs 和集合
    replay.ts        # review_states 再生（domain scheduler 利用）
    mergeAll.ts      # 全体オーケストレーション
    preview.ts       # 追加・更新・削除件数
  apply/
    applyMergePlan.ts # RepoContext + repos 経由で1トランザクション（features 層から呼ぶ）
  ports.ts           # MediaStorePort, BundleIO（FileSystem / web Blob）
```

### 依存ルール

- `src/sync/**` は React / Expo Router を import しない。
- 時刻は引数の `Clock` のみ。`Date.now()` / `new Date()` 禁止（ESLint 既存ルール）。
- DB 読み取りは **スナップショット DTO** として渡す（テスト容易性）。書き込みは `cardRepo` / `folderRepo` / `reviewRepo` / `mediaRepo` の既存 API を拡張するか、`applyMergePlan` 専用の bulk メソッドを `data/repos` に追加。
- 暗号化: export で `fields.open`、import で `fields.seal`、画像は `mediaAtRest` 経由。`DataProtection.mode !== 'full'` のときはマージを拒否し UI で説明。

### 既存コードの再利用

- ID 生成: `createIdGenerator(clock, randomBytes)`（新規 media 行など）。
- 画像: `upsertMedia` のハッシュ dedup。
- カード作成: `NewCard` DTO パターン（import と同様）を **同期行の適用** にも流用しない（既存 id を保持するため UPDATE/INSERT 分岐）。
- 復習: `reviewRepo.replay` のロジックを domain 側に1本化し、repo と sync の両方から呼ぶ（リファクタ PR で先行可能）。

---

## 5. UI

### 5.1 入口

| 場所                                       | 操作                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| フォルダ一覧・右上 `⋯`（`folderListMenu`） | 「同期ファイルを書き出す」「同期ファイルを取り込む」を **Anki/CSV 取り込み** と並列 |

フォルダ詳細 `⋯` の「このフォルダだけ書き出す」は **将来候補**（第1段階スコープ外。常に全データ full）。

ヘッダー右余白は `useHeaderBarInsets` / `headerBarPaddingRight` で Expo Go 歯車と重ならないこと（既存）。

### 5.2 書き出しフロー

1. 「同期ファイルを書き出す」→ **全データの full** のみ（差分オプションは第2段階）
2. 見積もりサイズが **50 MB 超** のとき、書き出し前に確認ダイアログで警告（ハードブロックはしない。続行可）。画像枚数による別閾値は設けない
3. 生成中インジケータ（大きい画像は時間がかかる）
4. OS 共有シートまたは「ファイルに保存」（`expo-sharing` / DocumentDirectory → picker）
5. 完了トースト: 「同期ファイルを作成しました」。成功時に `last_full_export_at` を更新

### 5.3 取り込みフロー

1. `expo-document-picker` で `.akasheet` 選択
2. 解析 → **プレビュー画面**（import preview と同様のレイアウトを流用可）
   - 追加 / 更新 / 論理削除 の件数（フォルダ・カード・マスク・復習ログ）
   - 警告: 読み取り専用モード、古い `bundle_version`、同一 peer の再取り込み
3. 主ボタン「取り込む」（墨色 `Button`）。キャンセルは secondary
4. 適用後トースト＋クエリ invalidate（`queryInvalidation` パターン）

### 5.4 デザイン規則（既存準拠）

- 朱色（`c.mask`）: 隠した答え・期限バッジのみ。同期 UI では使わない。
- 主ボタン: 墨色（`Button` デフォルト）。
- タップ領域: 最小 44pt（`heights` / `IconButton`）。
- 破壊的操作: `destructive` シート項目は使わない（取り込みは上書きマージだが復元不可ではない旨をプレビューで説明）。

### 5.5 Web 版（第1段階は非対応）

同期の書き出し／取り込み UI は **iOS・Android（Expo Go 想定）のみ**。Web 本番画面には同期入口を出さない。Playwright 向けの fixture バンドル直接適用フック（§6.2）は PR-B/C のテスト用として残してよい。

---

## 6. テスト計画

### 6.1 ユニット（Jest）

| 対象                 | 内容                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `merge/lww.ts`       | 同点 `updated_at`、削除 vs 更新、復活                                                 |
| `merge/mergeLogs.ts` | ID 重複、undo 行、`device_id` 保持                                                    |
| `merge/replay.ts`    | 既存 `sm2b` ゴールデンと整合、import アルゴリズム混在                                 |
| `mergeAll`           | 冪等・可換・往復（fixture JSON を2台分合成）                                          |
| `parseBundle`        | 壊れた zip、必須フィールド欠落、`sha256` 不一致                                       |
| `cursor.ts`          | カーソル比較（第2段階 delta 用。第1段階は peer 再取り込み警告の単体テストのみでも可） |

`better-sqlite` ドライバ（`src/data/db/testing`）で2端末シナリオ:

1. DB_A 初期化 → カード作成・復習
2. export → parse → merge into DB_B
3. DB_B 側の変更 → export → merge into DB_A
4. 行集合・replay 後の `review_states`・live カード数が一致

### 6.2 Playwright（Web E2E）

- 本番 Web UI に同期入口は出さない（§5.5）。既存 `e2e/import.spec.ts` と同様、テスト用に **fixture バンドルを直接適用**するフック（dev / `testID` 限定）を PR-B/C で追加する。
- シナリオ案: 端末1でフォルダ＋カード作成 →（テスト用バンドル注入）→ 端末2表示で件数一致。

### 6.3 Maestro（モバイル・案）

```yaml
# .maestro/sync_roundtrip.yaml（将来）
- launchApp
- tapOn: { id: 'folder-list-menu' }
- tapOn: { id: 'menu-sync-export' }
# 共有シートは OS 依存のため、Maestro では Documents の固定パスにコピーする dev ビルドフラグを使う
```

Expo Go では共有シート自動化が難しいため、**開発用バンドルをアプリ内に同梱して取り込む**デバッグ入口を Maestro 専用に限定する案（本番 UI には出さない）。

---

## 7. 実装 PR の分割と完了条件

| 順序                  | PR 内容                                                                                  | 完了条件                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **PR-A** マージコア   | `src/sync/merge/*`, `replay` 共通化, Jest（2台 fixture）                                 | `npm run verify`、カバレッジ維持、DB スキーマ変更なし                                              |
| **PR-B** バンドル I/O | `exportBundle` / `parseBundle`, migration v3 `sync_state`, repo スナップショット読み取り | ラウンドトリップテスト（export→merge→DB 一致）、実ファイルはテスト fixture のみ（小さい JPEG）     |
| **PR-C** UI + 適用    | フォルダ一覧メニュー（モバイルのみ）、プレビュー、50 MB 警告、`applyMergePlan`, GC 更新  | Playwright 1 本（fixture 注入）、手動: iOS Expo Go で書き出し→別端末取り込み、読み取り専用時は拒否 |

各 PR は独立にマージ可能だが、**ユーザー価値は PR-C** で出る。PR-A は品質の核なので先に入れる。

---

## 8. 第2段階（サーバー同期）の拡張点

### 8.1 足すもの

- **トランスポート**: HTTPS でバンドルと同型の JSONL チャンクを push/pull。差分（`mode: "delta"`）と `sync_state.export_cursor` による差分書き出しはここで足す。
- **ペアリング UX**: QR・短いコード・端末鍵などは **第2段階で別途設計**（本設計 PR では方式を固定しない）。
- **`server_version`**: 行ごとに単調増加。クライアント LWW は「サーバー版優先 → updated_at → `id` 辞書順」。
- **`sync_state`**: `import_peers` をサーバー上の `device_id` レジストリと同期。
- **画像**: 初回はハッシュで参照。未所持バイナリだけ GET `/media/<sha256>`（サーバーはオブジェクトストア、**ユーザー自身の S3 互換を想定しない**なら Cursor ホスティングは採用しない — 運用コスト制約）。

### 8.2 採用しなかった案

| 案                              | 不採用理由                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Firebase / Supabase 常設**    | 無料枠超過・プロジェクト秘密情報・運用監視が発生。アカウント必須に寄りやすい                    |
| **CloudKit 直叩き**             | Android / Web が除外される。Expo Go ではネイティブモジュール制約                                |
| **iCloud Drive だけで自動同期** | ファイル監視・競合解決を OS 任せにできず、結局自前マージが必要。手動 `.akasheet` の方が説明可能 |
| **AnkiWeb 同期プロトコル**      | ドメイン不一致、画像マスク構造が異なる                                                          |
| **git / Syncthing 直置き**      | SQLite 生ファイルはマージ不可。バンドル抽象が必須                                               |

---

## 第1段階の決定事項（確定）

| #   | 項目                      | 決定                                                                                                                                                                                                                                |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 書き出しモード            | **full のみ**。`manifest.mode` は常に `"full"`。delta / `export_cursor` 差分書き出しは第2段階で実装（本ドキュメントに拡張として記載するが **第1実装では実装しない**）。`sync_state` は `import_peers` と `last_full_export_at` 中心 |
| 2   | LWW 同点タイブレーク      | **`id`（UUIDv7）辞書順のみ**。`updated_device_id` 列は第1段階では追加しない                                                                                                                                                         |
| 3   | 部分エクスポート          | **なし**（全データ full のみ）。フォルダ詳細からの部分書き出しは将来候補                                                                                                                                                            |
| 4   | バンドルサイズ            | 合計 **50 MB** 超で書き出し前に警告ダイアログ（ブロックしない）。枚数閾値は設けない                                                                                                                                                 |
| 5   | 新規フォルダ `sort_order` | live の **`max(sort_order)+1`** 起点、複数は出現順に +1                                                                                                                                                                             |
| 6   | Web 版                    | 第1段階 **非対応**（モバイル／Expo Go）。Playwright 用 fixture 注入はテストのみ                                                                                                                                                     |
| 7   | 第2段階ペアリング         | 本 PR では未固定 → §8.1「別途設計」                                                                                                                                                                                                 |

---

## 参考（現行コード）

- スキーマ: `src/data/db/migrations.ts`
- 端末 ID: `src/data/repos/metaRepo.ts` (`ensureDeviceId`)
- 復習 replay: `src/data/repos/reviewRepo.ts` (`replay`)
- 外部 ID 一意: migration `0002_cards_external_live_only`
- 画像ハッシュ: `src/data/repos/mediaRepo.ts` (`upsertMedia`)
- 取り込み DTO: `src/import/types.ts`, `src/data/repos/cardRepo.ts` (`NewCard`)
- UI メニュー: `src/features/folders/useFolderActions.ts` (`folderListMenu`)
- Expo Go ヘッダー余白: `src/ui/headerInsets.ts`, `src/ui/expoGoDevMenuReserve.ts`
