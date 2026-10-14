export type SheetActionA11y = {
  label: string;
  hint?: string;
};

export function sheetActionAccessibilityLabel(a: SheetActionA11y): string {
  return a.hint ? `${a.label}、${a.hint}` : a.label;
}
