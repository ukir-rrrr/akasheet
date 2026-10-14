import { csvExternalId } from './stableId';

describe('csvExternalId', () => {
  const masksA = '[{"v":1,"shapes":[{"t":"rect","x":0.1,"y":0.1,"w":0.2,"h":0.1}]}]';
  const masksB = '[{"v":1,"shapes":[{"t":"rect","x":0.2,"y":0.1,"w":0.2,"h":0.1}]}]';

  it('differs when folder_name changes for the same image', () => {
    const a = csvExternalId('生物', 'img.jpg', null, masksA);
    const b = csvExternalId('化学', 'img.jpg', null, masksA);
    expect(a).not.toBe(b);
  });

  it('differs when masks change for the same image and folder', () => {
    const a = csvExternalId('Imported', 'img.jpg', null, masksA);
    const b = csvExternalId('Imported', 'img.jpg', null, masksB);
    expect(a).not.toBe(b);
  });
});
