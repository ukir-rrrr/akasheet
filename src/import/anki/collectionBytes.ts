import { decompress } from 'fzstd';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function isZstd(data: Uint8Array): boolean {
  return data.length >= 4 && ZSTD_MAGIC.every((b, i) => data[i] === b);
}

function isSqlite(data: Uint8Array): boolean {
  return data.length >= 15 && data[0] === 0x53 && data[1] === 0x51 && data[2] === 0x4c;
}

/** Picks collection bytes from an .apkg zip map (anki21b → anki21 → anki2). */
export function readCollectionFromZip(zip: Record<string, Uint8Array>): Uint8Array {
  const anki21b = zip['collection.anki21b'];
  if (anki21b) {
    if (!isZstd(anki21b)) {
      throw new Error('collection.anki21b の形式が不正です（zstd 圧縮が必要です）');
    }
    try {
      const out = decompress(anki21b);
      if (!isSqlite(out)) {
        throw new Error('collection.anki21b を展開しましたが SQLite ではありません');
      }
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`collection.anki21b を展開できません: ${msg}`);
    }
  }

  const plain = zip['collection.anki21'] ?? zip['collection.anki2'];
  if (!plain) {
    throw new Error(
      'Anki コレクション (collection.anki21b / anki21 / anki2) が見つかりません。このアプリのバージョンで書き出された .apkg か確認してください。',
    );
  }
  if (!isSqlite(plain)) {
    throw new Error('Anki コレクションが SQLite 形式ではありません');
  }
  return plain;
}
