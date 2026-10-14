import { sheetActionAccessibilityLabel } from './sheetActionAccessibility';

describe('sheetActionAccessibilityLabel', () => {
  it('uses the action label for screen readers', () => {
    expect(
      sheetActionAccessibilityLabel({
        label: 'Anki / CSV を取り込む',
      }),
    ).toBe('Anki / CSV を取り込む');
  });

  it('appends hint text when present', () => {
    expect(
      sheetActionAccessibilityLabel({
        label: '削除',
        hint: '3枚も削除',
      }),
    ).toBe('削除、3枚も削除');
  });
});
