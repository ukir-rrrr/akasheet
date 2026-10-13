/** Expo Go / dev-client floating dev-menu control is roughly one minimum tap target wide (UI spec: 44pt). */
export const EXPO_GO_DEV_MENU_RESERVE = 44;

export const EXPO_STORE_CLIENT_ENV = 'storeClient';

/** Pure helper (platform + execution environment strings) for unit tests and runtime. */
export function devMenuReservePx(platformOs: string, executionEnvironment: string): number {
  if (platformOs === 'web') return 0;
  if (executionEnvironment === EXPO_STORE_CLIENT_ENV) return EXPO_GO_DEV_MENU_RESERVE;
  return 0;
}

export function shouldReserveExpoGoDevMenu(platformOs: string, executionEnvironment: string): boolean {
  return devMenuReservePx(platformOs, executionEnvironment) > 0;
}
