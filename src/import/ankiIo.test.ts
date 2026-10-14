import { extractImageFileName, maskGeometriesFromIo, parseImageOcclusionField } from './ankiIo';

describe('anki image occlusion', () => {
  it('parses rect clozes into normalized geometry per cN', () => {
    const flds =
      '{{c1::image-occlusion:rect:left=10:top=20:width=30:height=40}}' +
      '{{c2::image-occlusion:rect:left=0:top=0:width=50:height=25}}' +
      '<img src="pic.jpg" />';
    const clozes = parseImageOcclusionField(flds);
    expect(clozes).toHaveLength(2);
    const geoms = maskGeometriesFromIo(clozes);
    expect(geoms[0].geometry.shapes[0]).toEqual({
      t: 'rect',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.4,
    });
    expect(extractImageFileName(flds)).toBe('pic.jpg');
  });

  it('parses polygon points', () => {
    const flds = '{{c1::image-occlusion:poly:points=10,10,50,10,30,40}}';
    const geoms = maskGeometriesFromIo(parseImageOcclusionField(flds));
    expect(geoms[0].geometry.shapes[0]).toEqual({
      t: 'poly',
      p: [0.1, 0.1, 0.5, 0.1, 0.3, 0.4],
    });
  });
});
