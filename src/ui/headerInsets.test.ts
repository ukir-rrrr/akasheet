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

  it('does not reserve on web even in Expo Go', () => {
    expect(shouldReserveExpoGoDevMenu('web', 'storeClient')).toBe(false);
    expect(devMenuReservePx('web', 'storeClient')).toBe(0);
  });

  it('does not reserve in production standalone builds', () => {
    expect(devMenuReservePx('android', 'standalone')).toBe(0);
  });
});
