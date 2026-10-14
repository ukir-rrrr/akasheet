import { devMenuReservePx } from './expoGoDevMenuReserve';

/** Matches `space[8]` in theme (kept literal so Jest node tests avoid react-native). */
export const DEFAULT_HEADER_HORIZONTAL = 8;

type PaddingOptions = {
  /** Base horizontal padding before safe-area and dev-menu reserve (default: 8). */
  horizontal?: number;
};

type SafeAreaHorizontal = { left?: number; right?: number };

/** Same paddingRight formula as `useHeaderBarInsets` (testable without hooks). */
export function headerBarPaddingRight(
  options: PaddingOptions = {},
  safeArea: SafeAreaHorizontal = {},
  platformOs: string,
  executionEnvironment: string,
): number {
  const { horizontal = DEFAULT_HEADER_HORIZONTAL } = options;
  const insetsRight = safeArea.right ?? 0;
  const devMenuReserve = devMenuReservePx(platformOs, executionEnvironment);
  return horizontal + insetsRight + devMenuReserve;
}
