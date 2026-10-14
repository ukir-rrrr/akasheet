/**
 * Extra right inset for Expo Go's floating dev-menu gear (storeClient only).
 *
 * The control is ~44pt wide but on iOS it sits inset from the screen edge (e.g. on a
 * 402pt-wide simulator the gear's left edge is at x≈344, i.e. 58pt from the right).
 * Reserving only 44pt leaves header tap targets overlapping the gear (folder ⋯ at x=350).
 */
export const EXPO_GO_DEV_MENU_RESERVE = 66;

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
