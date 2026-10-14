import {
  EXPO_GO_DEV_MENU_RESERVE_ANDROID,
  EXPO_GO_DEV_MENU_RESERVE_IOS,
  devMenuReservePx,
  shouldReserveExpoGoDevMenu,
} from './expoGoDevMenuReserve';
import { headerBarPaddingRight } from './headerBarPadding';

describe('expoGoDevMenuReservePx', () => {
  it('reserves iOS-specific width in Expo Go on iOS', () => {
    expect(shouldReserveExpoGoDevMenu('ios', 'storeClient')).toBe(true);
    expect(devMenuReservePx('ios', 'storeClient')).toBe(EXPO_GO_DEV_MENU_RESERVE_IOS);
  });

  it('reserves 44pt in Expo Go on Android (unchanged)', () => {
    expect(shouldReserveExpoGoDevMenu('android', 'storeClient')).toBe(true);
    expect(devMenuReservePx('android', 'storeClient')).toBe(EXPO_GO_DEV_MENU_RESERVE_ANDROID);
  });

  it('clears measured iOS Expo Go gear via headerBarPaddingRight', () => {
    const screenWidth = 402;
    const gearLeft = 344;
    const horizontal = 8;
    const clearance = 8;
    const paddingRight = headerBarPaddingRight({ horizontal }, { right: 0 }, 'ios', 'storeClient');
    expect(paddingRight).toBe(horizontal + devMenuReservePx('ios', 'storeClient'));
    const headerControlRight = screenWidth - paddingRight;
    expect(headerControlRight).toBeLessThanOrEqual(gearLeft - clearance);
  });

  it('does not reserve on web even in Expo Go', () => {
    expect(shouldReserveExpoGoDevMenu('web', 'storeClient')).toBe(false);
    expect(devMenuReservePx('web', 'storeClient')).toBe(0);
    expect(headerBarPaddingRight({ horizontal: 8 }, { right: 0 }, 'web', 'storeClient')).toBe(8);
  });

  it('does not reserve in production standalone builds', () => {
    expect(devMenuReservePx('android', 'standalone')).toBe(0);
    expect(headerBarPaddingRight({ horizontal: 8 }, { right: 0 }, 'android', 'standalone')).toBe(8);
  });
});
