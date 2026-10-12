import { Platform, useColorScheme, type TextStyle } from 'react-native';

import type { FolderColor } from '@/data/repos/folderRepo';

const light = {
  bg: '#F5F0E6',
  surface: '#FFFCF5',
  surface2: '#EDE6D8',
  line: '#E0D7C5',
  lineStrong: '#CFC4AF',
  ink: '#1F1B16',
  ink2: '#4F483F',
  ink3: '#6B6357',
  onInk: '#FFFCF5',
  mask: '#D9381E',
  maskHatch: '#F06A4F',
  shuInk: '#B3301A',
  shuTint: '#FBE4DC',
  shuTintInk: '#9A2814',
  matcha: '#1E7A5A',
  matchaTint: '#DCEFE6',
  matchaInk: '#17654A',
  ai: '#2D5B8C',
  warn: '#9A6A0A',
  canvas: '#2B2620',
  overlay: 'rgba(31,27,22,0.72)',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#14110E',
  surface: '#1E1A16',
  surface2: '#2A251F',
  line: '#3A332B',
  lineStrong: '#4B4238',
  ink: '#F3EDE2',
  ink2: '#CFC6B8',
  ink3: '#A39A8C',
  onInk: '#1F1B16',
  mask: '#D9381E',
  maskHatch: '#F06A4F',
  shuInk: '#C23A22',
  shuTint: '#3A1D16',
  shuTintInk: '#FF8D72',
  matcha: '#23805F',
  matchaTint: '#17302A',
  matchaInk: '#5CC79D',
  ai: '#7FA8D6',
  warn: '#E0B04A',
  canvas: '#0B0908',
  overlay: 'rgba(0,0,0,0.6)',
};

/** Subject colors are stored as token names; vermilion hues are intentionally excluded. */
export const FOLDER_COLOR_HEX: Record<FolderColor, string> = {
  tobi: '#8C4A2F',
  ai: '#2D5B8C',
  moegi: '#4E7A2A',
  murasaki: '#6B4C93',
  yamabuki: '#9A6A0A',
  tetsu: '#3E5F66',
};

export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40 } as const;
export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 24, full: 999 } as const;
export const heights = { tap: 44, button: 48, cta: 56, answer: 72, tool: 56, row: 68 } as const;
/** Top-trailing width for Expo Go / dev-client floating tools (gear) so controls stay tappable. */
export const expoToolsTrailingReserve = 60;

const mincho = Platform.select({ ios: 'Hiragino Mincho ProN', android: 'serif', default: 'serif' });

export const type = {
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  hero: { fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroMincho: {
    fontSize: 88,
    fontWeight: '900',
    fontFamily: mincho,
    fontVariant: ['tabular-nums'],
    lineHeight: 96,
  },
  headingMincho: { fontSize: 26, fontWeight: '900', fontFamily: mincho, lineHeight: 34 },
  section: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  button: { fontSize: 16, fontWeight: '700' },
  answer: { fontSize: 19, fontWeight: '900' },
  sub: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '700' },
  initial: { fontSize: 20, fontWeight: '900', fontFamily: mincho },
} satisfies Record<string, TextStyle>;

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 18px rgba(0,0,0,0.07)' },
});

export function useTheme(): { c: Palette; dark: boolean } {
  const scheme = useColorScheme();
  return scheme === 'dark' ? { c: dark, dark: true } : { c: light, dark: false };
}
