import type { Shape } from '@/domain/mask/types';

import {
  editorReducer,
  initialEditorState,
  UNDO_LIMIT,
  type EditorAction,
  type EditorState,
} from './editorReducer';

const rect = (x: number): Shape => ({ t: 'rect', x, y: 0.1, w: 0.1, h: 0.1 });
const run = (actions: EditorAction[], s: EditorState = initialEditorState) =>
  actions.reduce(editorReducer, s);

describe('editorReducer', () => {
  it('adds one mask per shape and supports undo/redo', () => {
    let s = run([
      { type: 'addShape', shape: rect(0.1), id: 'a' },
      { type: 'addShape', shape: rect(0.3), id: 'b' },
    ]);
    expect(s.masks.map((m) => m.id)).toEqual(['a', 'b']);
    expect(s.dirty).toBe(true);
    s = editorReducer(s, { type: 'undo' });
    expect(s.masks.map((m) => m.id)).toEqual(['a']);
    s = editorReducer(s, { type: 'redo' });
    expect(s.masks.map((m) => m.id)).toEqual(['a', 'b']);
    expect(editorReducer(s, { type: 'redo' })).toBe(s);
    expect(editorReducer(initialEditorState, { type: 'undo' })).toBe(initialEditorState);
  });

  it('a new shape clears the redo stack and history is capped', () => {
    let s = run([
      { type: 'addShape', shape: rect(0.1), id: 'a' },
      { type: 'undo' },
      { type: 'addShape', shape: rect(0.2), id: 'b' },
    ]);
    expect(s.future).toEqual([]);
    for (let i = 0; i < UNDO_LIMIT + 10; i++)
      s = editorReducer(s, { type: 'addShape', shape: rect(0.5), id: `x${i}` });
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });

  it('join mode appends shapes to the selected mask', () => {
    const s = run([
      { type: 'addShape', shape: rect(0.1), id: 'a' },
      { type: 'select', id: 'a' },
      { type: 'toggleJoin' },
      { type: 'addShape', shape: rect(0.3), id: 'ignored' },
    ]);
    expect(s.masks).toHaveLength(1);
    expect(s.masks[0].geometry.shapes).toHaveLength(2);
    expect(s.tool).toBe('marker');
    expect(editorReducer(initialEditorState, { type: 'toggleJoin' })).toBe(initialEditorState);
  });

  it('deletes the selected mask and drops stale selection on undo', () => {
    let s = run([
      { type: 'addShape', shape: rect(0.1), id: 'a' },
      { type: 'select', id: 'a' },
      { type: 'deleteSelected' },
    ]);
    expect(s.masks).toEqual([]);
    expect(s.selectedId).toBeNull();
    expect(editorReducer(s, { type: 'deleteSelected' })).toBe(s);
    s = run([{ type: 'select', id: 'a' }, { type: 'undo' }, { type: 'undo' }], s);
    expect(s.masks).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it('preview mode toggles reveal per mask and resets on exit', () => {
    let s = run([
      { type: 'addShape', shape: rect(0.1), id: 'a' },
      { type: 'togglePreview' },
      { type: 'togglePreviewMask', id: 'a' },
    ]);
    expect(s.preview).toBe(true);
    expect(s.previewRevealed).toEqual(['a']);
    s = run([{ type: 'togglePreviewMask', id: 'a' }], s);
    expect(s.previewRevealed).toEqual([]);
    s = run([{ type: 'setTool', tool: 'rect' }, { type: 'setSize', size: 'l' }, { type: 'markSaved' }], s);
    expect(s).toMatchObject({ preview: false, tool: 'rect', size: 'l', dirty: false });
  });
});
