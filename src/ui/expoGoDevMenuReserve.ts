/**
 * Extra right inset for Expo Go's floating dev-menu gear (storeClient only).
 *
 * iOS: measured on a 402pt-wide simulator — gear left edge at x≈344 (58pt from the
 * right). Reserving only 44pt left folder ⋯ (right edge x=350) overlapping the gear.
 *
 * Android: keep 44pt until measured on device; do not apply the iOS-specific inset.
 */
export const EXPO_GO_DEV_MENU_RESERVE_IOS = 66;

/** Expo Go on Android — prior 44pt minimum tap target; not re-measured in this change. */
export const EXPO_GO_DEV_MENU_RESERVE_ANDROID = 44;

export const EXPO_STORE_CLIENT_ENV = 'storeClient';

/** Pure helper (platform + execution environment strings) for unit tests and runtime. */
export function devMenuReservePx(platformOs: string, executionEnvironment: string): number {
  if (platformOs === 'web') return 0;
  if (executionEnvironment !== EXPO_STORE_CLIENT_ENV) return 0;
  if (platformOs === 'ios') return EXPO_GO_DEV_MENU_RESERVE_IOS;
  if (platformOs === 'android') return EXPO_GO_DEV_MENU_RESERVE_ANDROID;
  return EXPO_GO_DEV_MENU_RESERVE_ANDROID;
}

export function shouldReserveExpoGoDevMenu(platformOs: string, executionEnvironment: string): boolean {
  return devMenuReservePx(platformOs, executionEnvironment) > 0;
}
