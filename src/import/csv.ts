import { z } from 'zod';

import type { MaskGeometry } from '@/domain/mask/types';

import { maskGeometriesFromIo, parseImageOcclusionField } from './ankiIo';
import type { ImportCardDraft, ParsedImportBundle } from './types';

const rowSchema = z.object({
  folder_name: z.string().min(1),
  image_file: z.string().min(1),
  masks: z.string().min(1),
  title: z.string().optional(),
});

function parseMasksColumn(raw: string): MaskGeometry[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error('masks は JSON 配列である必要があります');
    return parsed as MaskGeometry[];
  }
  const clozes = parseImageOcclusionField(trimmed);
  const geoms = maskGeometriesFromIo(clozes);
  if (geoms.length === 0) throw new Error('masks に有効なマスクがありません');
  return geoms.map((g) => g.geometry);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV にヘッダーと1行以上のデータが必要です');
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

export type ZipEntryMap = ReadonlyMap<string, Uint8Array>;

function lookupImage(map: ZipEntryMap, fileName: string): Uint8Array {
  const direct = map.get(fileName);
  if (direct) return direct;
  const base = fileName.split('/').pop() ?? fileName;
  for (const [k, v] of map) {
    if (k === base || k.endsWith(`/${base}`)) return v;
  }
  throw new Error(`画像が見つかりません: ${fileName}`);
}

export function parseCsvImport(csvText: string, zipEntries: ZipEntryMap, label: string): ParsedImportBundle {
  const rows = parseCsvRows(csvText);
  const cards: ImportCardDraft[] = [];
  rows.forEach((row, i) => {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      throw new Error(`CSV ${i + 2} 行目: ${parsed.error.issues[0]?.message ?? '形式が不正です'}`);
    }
    const { folder_name, image_file, masks, title } = parsed.data;
    const imageBytes = lookupImage(zipEntries, image_file);
    const maskList = parseMasksColumn(masks);
    if (maskList.length === 0) throw new Error(`CSV ${i + 2} 行目: マスクが空です`);
    cards.push({
      externalId: `csv:${i + 1}:${folder_name}:${image_file}`,
      folderPath: folder_name.trim(),
      title: title?.trim() || null,
      imageBytes,
      imageMime: 'image/jpeg',
      masks: maskList,
    });
  });
  return { source: 'import:csv', label, cards };
}
