import { unzipSync } from 'fflate';

import { parseCsvMasksColumn } from '../masks';
import type { ImportCardDraft, ImportPreview } from '../types';
import { csvExternalId, folderPathKey } from '../types';

const HEADER = ['folder_name', 'image_file', 'masks', 'title'] as const;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function folderPathFromName(name: string): string[] {
  const parts = name
    .split(/[/\\]|::/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ['Imported'];
}

function findImage(
  zip: Record<string, Uint8Array>,
  fileName: string,
): { bytes: Uint8Array; mime: string } | null {
  const norm = fileName.replace(/^\.?\//, '');
  const direct = zip[norm] ?? zip[fileName];
  if (direct) {
    const lower = norm.toLowerCase();
    const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return { bytes: direct, mime };
  }
  const match = Object.entries(zip).find(([k]) => k.endsWith(`/${norm}`) || k === norm);
  if (!match) return null;
  const lower = norm.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return { bytes: match[1], mime };
}

export function parseCsvZip(bytes: Uint8Array, fileName: string): ImportPreview {
  const zip: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    zip[name] = data;
  }

  const csvEntry = Object.entries(zip).find(([name]) => name.toLowerCase().endsWith('.csv'));
  if (!csvEntry) {
    throw new Error('ZIP 内に CSV ファイルが見つかりません');
  }

  const csvText = new TextDecoder().decode(csvEntry[1]);
  const { header, rows } = parseCsv(csvText);
  const idx = (col: string) => header.indexOf(col);
  for (const h of HEADER) {
    if (idx(h) < 0) throw new Error(`CSV に ${h} 列がありません`);
  }

  const drafts: ImportCardDraft[] = [];
  rows.forEach((row, rowIndex) => {
    const folderName = row[idx('folder_name')]?.trim() ?? 'Imported';
    const imageFile = row[idx('image_file')]?.trim() ?? '';
    const masksRaw = row[idx('masks')] ?? '';
    const titleRaw = row[idx('title')]?.trim();
    if (!imageFile) return;

    const masks = parseCsvMasksColumn(masksRaw);
    if (masks.length === 0) return;

    const img = findImage(zip, imageFile);
    if (!img) return;

    drafts.push({
      externalId: csvExternalId(rowIndex + 1),
      title: titleRaw && titleRaw.length > 0 ? titleRaw : null,
      folderPath: folderPathFromName(folderName),
      imageBytes: img.bytes,
      imageMime: img.mime,
      masks,
    });
  });

  const folderCounts = new Map<string, number>();
  for (const d of drafts) {
    const k = folderPathKey(d.folderPath);
    folderCounts.set(k, (folderCounts.get(k) ?? 0) + 1);
  }

  return {
    source: 'import:csv',
    fileName,
    folders: [...folderCounts.entries()].map(([k, n]) => ({ path: k.split('\u0000'), cardCount: n })),
    cards: drafts,
  };
}

export function parseCsvOnly(
  text: string,
  fileName: string,
  imageResolver: (file: string) => Uint8Array | null,
): ImportPreview {
  const { header, rows } = parseCsv(text);
  const idx = (col: string) => header.indexOf(col);
  for (const h of HEADER) {
    if (idx(h) < 0) throw new Error(`CSV に ${h} 列がありません`);
  }

  const drafts: ImportCardDraft[] = [];
  rows.forEach((row, rowIndex) => {
    const folderName = row[idx('folder_name')]?.trim() ?? 'Imported';
    const imageFile = row[idx('image_file')]?.trim() ?? '';
    const masks = parseCsvMasksColumn(row[idx('masks')] ?? '');
    const titleRaw = row[idx('title')]?.trim();
    if (!imageFile || masks.length === 0) return;
    const bytes = imageResolver(imageFile);
    if (!bytes) return;
    const lower = imageFile.toLowerCase();
    const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    drafts.push({
      externalId: csvExternalId(rowIndex + 1),
      title: titleRaw && titleRaw.length > 0 ? titleRaw : null,
      folderPath: folderPathFromName(folderName),
      imageBytes: bytes,
      imageMime: mime,
      masks,
    });
  });

  const folderCounts = new Map<string, number>();
  for (const d of drafts) {
    const k = folderPathKey(d.folderPath);
    folderCounts.set(k, (folderCounts.get(k) ?? 0) + 1);
  }

  return {
    source: 'import:csv',
    fileName,
    folders: [...folderCounts.entries()].map(([k, n]) => ({ path: k.split('\u0000'), cardCount: n })),
    cards: drafts,
  };
}
