import { parseCsvMasksColumn, parseOcclusionMasks } from './masks';

describe('parseCsvMasksColumn', () => {
  it('parses a JSON array of geometries', () => {
    const raw = JSON.stringify([{ v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }]);
    const masks = parseCsvMasksColumn(raw);
    expect(masks).toHaveLength(1);
    expect(masks[0].shapes[0].t).toBe('rect');
  });
});

describe('parseOcclusionMasks', () => {
  it('maps each cloze to one mask from normalized SVG', () => {
    const html = `
      <img src="a.jpg"/>
      <svg viewBox="0 0 1 1">
        <rect data-cloze="c1" x="0.1" y="0.1" width="0.2" height="0.1"/>
        <rect data-cloze="c2" x="0.5" y="0.5" width="0.1" height="0.1"/>
      </svg>
    `;
    const masks = parseOcclusionMasks(html);
    expect(masks).toHaveLength(2);
    expect(masks[0].shapes[0]).toMatchObject({ t: 'rect', x: 0.1 });
    expect(masks[1].shapes[0]).toMatchObject({ t: 'rect', x: 0.5 });
  });
});
