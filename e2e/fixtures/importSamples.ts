import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { zipSync } from 'fflate';

import { buildSampleApkg } from '../../src/import/anki/fixture';

const outDir = join(__dirname, 'generated');

mkdirSync(outDir, { recursive: true });

const masks = JSON.stringify([{ v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }] }]);
const csv = `folder_name,image_file,masks,title\nE2E,occlusion.jpg,"${masks.replaceAll('"', '""')}",合成テスト\n`;
const jpeg = readFileSync(join(__dirname, '../../assets/sample/textbook.jpg'));

export const csvZipPath = join(outDir, 'e2e-csv-import.zip');
writeFileSync(csvZipPath, zipSync({ 'import.csv': new TextEncoder().encode(csv), 'occlusion.jpg': jpeg }));

export const apkgPath = join(outDir, 'e2e-anki-import.apkg');
writeFileSync(apkgPath, buildSampleApkg());
