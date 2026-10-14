# Maestro（Expo Go 58 / SDK 58）

端末上で akasheet を Expo Go 58 から起動し、Maestro で UI フローを回すための設定です。Sim Setup で手パッチしていた **appId の大文字小文字** と **Metro 深いリンク起動** をリポジトリに取り込んでいます。

## 前提

- iPhone に [Expo Go](https://apps.apple.com/app/expo-go/id982107779)（SDK 58）
- PC で `npx expo start`（実機のときは同一 Wi‑Fi、必要なら `--tunnel`）
- [Maestro CLI](https://docs.maestro.dev/maestro-cli/) が PATH にあること

## appId（大文字小文字）

| プラットフォーム | 値                  |
| ---------------- | ------------------- |
| iOS              | `host.exp.Exponent` |
| Android          | `host.exp.exponent` |

`subflows/open-expo-project.yaml` がプラットフォームごとに `launchApp` します。フロー先頭の `appId` は iOS 用の `${EXPO_GO_APP_ID_IOS}` です（Android 単体実行時は環境変数で上書き可能）。

## Metro URL

既定はシミュレータ向け `exp://127.0.0.1:8081` です。実機や tunnel では Metro が表示する URL に合わせてください。

```bash
export EXPO_DEV_SERVER_URL='exp://192.168.0.12:8081'
# tunnel の例: exp://u.expo.dev/...
maestro test .maestro/00-launch.yaml
```

## フロー一覧

| ファイル                                | 内容                               |
| --------------------------------------- | ---------------------------------- |
| `00-launch`                             | 深いリンク起動・空状態・ビルド ID  |
| `01-create-folder`                      | フォルダ作成                       |
| `02-sample-editor`                      | サンプル編集画面                   |
| `03-masks-save`                         | マスク描画と保存                   |
| `04-review-reveal` 〜 `06-summary-back` | 復習〜結果                         |
| `07-folder-rename`                      | フォルダ名変更（歯車非重複）       |
| `08-header-buttons`                     | ヘッダー／編集 UI スモーク         |
| `09-folder-list-import-menu`            | 一覧 ⋯ → `folder-list-menu-import` |
| `i-csv` / `i-anki`                      | 取り込みメニューまで（下記制限）   |

一括（推奨順序は `config.yaml` の `executionOrder`）:

```bash
maestro test .maestro
```

## 取り込み（i-csv / i-anki）の制限

`expo-document-picker` のシステム UI では、実機 Maestro から ZIP/APKG を自動選択できません。`i-csv.yaml` と `i-anki.yaml` は **取り込み項目の testID まで** を検証します。ZIP/APKG までの完全な取り込みは Playwright（`npm run e2e` の `e2e/import.spec.ts`）と `e2e/fixtures/generated/` の合成データでカバーしています。

## コールドスタート

初回バンドルは最大約 120 秒待ちます（`extendedWaitUntil`）。Metro を止めたあとは `npx expo start -c` でキャッシュクリア再起動を検討してください。
