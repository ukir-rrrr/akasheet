import { masksForCardOrd, parseMasksField } from './masks';

describe('parseMasksField', () => {
  it('parses rect DSL and JSON shapes', () => {
    const dsl = parseMasksField('rect:0.1,0.2,0.3,0.4');
    expect(dsl[0].shapes[0]).toEqual({ t: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    const json = parseMasksField('[{"t":"poly","p":[0,0,0.5,0,0.5,0.5]}]');
    expect(json[0].shapes[0].t).toBe('poly');
  });

  it('picks one mask per card ord', () => {
    const a = parseMasksField('rect:0,0,0.1,0.1;rect:0.2,0.2,0.1,0.1');
    const one = masksForCardOrd(a, 1);
    expect(one).toHaveLength(1);
    expect(one[0].shapes[0]).toMatchObject({ t: 'rect', x: 0.2 });
  });
});
