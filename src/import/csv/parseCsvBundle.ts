import { unzipSync } from 'fflate';

import { parseMasksField } from '../masks';
import type { ParsedImportBundle, ParsedImportCard } from '../types';

const REQUIRED = ['folder_name', 'image_file', 'masks', 'title'] as const;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function folderPath(name: string): string[] {
  return name
    .split('::')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type CsvZipInput = { csvText: string; zipBytes?: Uint8Array };

/** Parses `folder_name,image_file,masks,title` rows; optional zip supplies image bytes. */
export function parseCsvBundle(input: CsvZipInput): ParsedImportBundle {
  const rows = parseCsv(input.csvText);
  const warnings: string[] = [];
  if (rows.length === 0) throw new Error('CSV にデータ行がありません');

  const missing = REQUIRED.filter((h) => !(h in rows[0]));
  if (missing.length > 0) throw new Error(`CSV の列が不足しています: ${missing.join(', ')}`);

  const zipFiles = new Map<string, Uint8Array>();
  if (input.zipBytes) {
    for (const [name, data] of Object.entries(unzipSync(input.zipBytes))) {
      zipFiles.set(name.replace(/^\.?\//, ''), data);
    }
  }

  const cards: ParsedImportCard[] = [];
  rows.forEach((row, idx) => {
    const folder = row.folder_name?.trim();
    const imageFile = row.image_file?.trim();
    if (!folder || !imageFile) {
      warnings.push(`行 ${idx + 2}: folder_name と image_file は必須です`);
      return;
    }
    const masks = parseMasksField(row.masks ?? '');
    if (masks.length === 0) {
      warnings.push(`行 ${idx + 2}: マスクを解釈できません`);
      return;
    }
    const title = row.title?.trim() || null;
    let imageBytes: Uint8Array | undefined;
    const key = imageFile.replace(/^.*[/\\]/, '');
    for (const [path, data] of zipFiles) {
      if (path === imageFile || path.endsWith(`/${key}`) || path === key) {
        imageBytes = data;
        break;
      }
    }
    if (!imageBytes && input.zipBytes) warnings.push(`行 ${idx + 2}: zip 内に ${imageFile} がありません`);

    cards.push({
      externalId: `csv:${idx + 1}:${folder}::${imageFile}`,
      deckPath: folderPath(folder),
      title,
      imageFile,
      imageBytes,
      masks,
      review: null,
    });
  });

  const deckCounts = new Map<string, number>();
  for (const c of cards) {
    const key = c.deckPath.join('::');
    deckCounts.set(key, (deckCounts.get(key) ?? 0) + 1);
  }

  return {
    source: 'import:csv',
    decks: [...deckCounts.entries()].map(([key, count]) => ({ path: key.split('::'), cardCount: count })),
    cards,
    warnings,
  };
}
