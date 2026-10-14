import { zipSync } from 'fflate';

import { parseCsvBundle } from './parseCsvBundle';

describe('parseCsvBundle', () => {
  it('reads rows and zip images', () => {
    const csv = `folder_name,image_file,masks,title
英語::単語,img/a.jpg,"rect:0.1,0.1,0.2,0.1",hello`;
    const zip = zipSync({ 'img/a.jpg': new Uint8Array([1, 2, 3]) });
    const bundle = parseCsvBundle({ csvText: csv, zipBytes: zip });
    expect(bundle.cards).toHaveLength(1);
    expect(bundle.cards[0].deckPath).toEqual(['英語', '単語']);
    expect(bundle.cards[0].imageBytes?.byteLength).toBe(3);
    expect(bundle.cards[0].title).toBe('hello');
  });
});
