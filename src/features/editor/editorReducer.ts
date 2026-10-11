import type { MarkerSize } from '@/domain/mask/geometry';
import type { MaskGeometry, Shape } from '@/domain/mask/types';

export const UNDO_LIMIT = 50;

export type EditorMask = { id: string; geometry: MaskGeometry };
export type Tool = 'marker' | 'rect' | 'select';

export type EditorState = {
  masks: EditorMask[];
  past: EditorMask[][];
  future: EditorMask[][];
  selectedId: string | null;
  tool: Tool;
  size: MarkerSize;
  /** When on, new shapes are appended to the selected mask (a phrase spanning two lines = one mask). */
  joinMode: boolean;
  preview: boolean;
  previewRevealed: string[];
  dirty: boolean;
};

export type EditorAction =
  | { type: 'addShape'; shape: Shape; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'deleteSelected' }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setSize'; size: MarkerSize }
  | { type: 'toggleJoin' }
  | { type: 'togglePreview' }
  | { type: 'togglePreviewMask'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'markSaved' };

export const initialEditorState: EditorState = {
  masks: [],
  past: [],
  future: [],
  selectedId: null,
  tool: 'marker',
  size: 'm',
  joinMode: false,
  preview: false,
  previewRevealed: [],
  dirty: false,
};

function commit(s: EditorState, masks: EditorMask[], patch: Partial<EditorState> = {}): EditorState {
  return { ...s, ...patch, masks, past: [...s.past, s.masks].slice(-UNDO_LIMIT), future: [], dirty: true };
}

function keepSelection(masks: EditorMask[], id: string | null): string | null {
  return id && masks.some((m) => m.id === id) ? id : null;
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'addShape': {
      const target = s.joinMode ? s.masks.find((m) => m.id === s.selectedId) : undefined;
      if (target) {
        const masks = s.masks.map((m) =>
          m.id === target.id
            ? { ...m, geometry: { ...m.geometry, shapes: [...m.geometry.shapes, a.shape] } }
            : m,
        );
        return commit(s, masks);
      }
      return commit(s, [...s.masks, { id: a.id, geometry: { v: 1, shapes: [a.shape] } }]);
    }
    case 'select':
      return { ...s, selectedId: a.id, joinMode: a.id ? s.joinMode : false };
    case 'deleteSelected':
      if (!s.selectedId) return s;
      return commit(
        s,
        s.masks.filter((m) => m.id !== s.selectedId),
        { selectedId: null, joinMode: false },
      );
    case 'setTool':
      return { ...s, tool: a.tool, preview: false, joinMode: a.tool === 'select' ? false : s.joinMode };
    case 'setSize':
      return { ...s, size: a.size };
    case 'toggleJoin':
      if (!s.selectedId) return s;
      return {
        ...s,
        joinMode: !s.joinMode,
        tool: s.joinMode ? s.tool : s.tool === 'select' ? 'marker' : s.tool,
      };
    case 'togglePreview':
      return { ...s, preview: !s.preview, previewRevealed: [], selectedId: null, joinMode: false };
    case 'togglePreviewMask':
      return {
        ...s,
        previewRevealed: s.previewRevealed.includes(a.id)
          ? s.previewRevealed.filter((id) => id !== a.id)
          : [...s.previewRevealed, a.id],
      };
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        ...s,
        masks: prev,
        past: s.past.slice(0, -1),
        future: [s.masks, ...s.future],
        selectedId: keepSelection(prev, s.selectedId),
        dirty: true,
      };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...s,
        masks: next,
        past: [...s.past, s.masks].slice(-UNDO_LIMIT),
        future: s.future.slice(1),
        selectedId: keepSelection(next, s.selectedId),
        dirty: true,
      };
    }
    case 'markSaved':
      return { ...s, dirty: false };
  }
}
