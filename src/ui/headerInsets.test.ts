import {
  EXPO_GO_DEV_MENU_RESERVE,
  devMenuReservePx,
  shouldReserveExpoGoDevMenu,
} from './expoGoDevMenuReserve';

describe('expoGoDevMenuReservePx', () => {
  it('reserves tap width in Expo Go on native', () => {
    expect(shouldReserveExpoGoDevMenu('ios', 'storeClient')).toBe(true);
    expect(devMenuReservePx('ios', 'storeClient')).toBe(EXPO_GO_DEV_MENU_RESERVE);
  });

  it('clears measured iOS Expo Go gear with default header horizontal padding', () => {
    const screenWidth = 402;
    const gearLeft = 344;
    const horizontal = 8;
    const clearance = 8;
    const headerControlRight = screenWidth - horizontal - EXPO_GO_DEV_MENU_RESERVE;
    expect(headerControlRight).toBeLessThanOrEqual(gearLeft - clearance);
  });

  it('does not reserve on web even in Expo Go', () => {
    expect(shouldReserveExpoGoDevMenu('web', 'storeClient')).toBe(false);
    expect(devMenuReservePx('web', 'storeClient')).toBe(0);
  });

  it('does not reserve in production standalone builds', () => {
    expect(devMenuReservePx('android', 'standalone')).toBe(0);
  });
});
