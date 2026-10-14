import { zipSync } from 'fflate';

import { parseCsvZip } from './parseBundle';

describe('parseCsvZip', () => {
  it('reads folder_name, image_file, masks, title from zip', () => {
    const masks = JSON.stringify([{ v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] }]);
    const csv = `folder_name,image_file,masks,title\n"生物::細胞",img1.jpg,"${masks.replaceAll('"', '""')}",核\n`;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const zip = zipSync({
      'deck.csv': new TextEncoder().encode(csv),
      'img1.jpg': jpeg,
    });
    const preview = parseCsvZip(zip, 'bundle.zip');
    expect(preview.source).toBe('import:csv');
    expect(preview.cards).toHaveLength(1);
    expect(preview.cards[0].folderPath).toEqual(['生物', '細胞']);
    expect(preview.cards[0].title).toBe('核');
    expect(preview.folders[0].cardCount).toBe(1);
  });
});
