import Constants from 'expo-constants';
import { Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { devMenuReservePx } from './expoGoDevMenuReserve';
import { space } from './theme';

export { EXPO_GO_DEV_MENU_RESERVE, shouldReserveExpoGoDevMenu } from './expoGoDevMenuReserve';

export function expoGoDevMenuReservePx(): number {
  return devMenuReservePx(Platform.OS, Constants.executionEnvironment);
}

type HeaderBarInsetsOptions = {
  /** Padding below the safe-area top inset (default: design spacing 4). */
  topGap?: number;
  /** Base horizontal padding before safe-area and dev-menu reserve (default: 8). */
  horizontal?: number;
};

export function useHeaderBarInsets(options: HeaderBarInsetsOptions = {}) {
  const { topGap = space[4], horizontal = space[8] } = options;
  const insets = useSafeAreaInsets();
  const devMenuReserve = expoGoDevMenuReservePx();

  const containerStyle: ViewStyle = {
    paddingTop: insets.top + topGap,
    paddingLeft: horizontal + insets.left,
    paddingRight: horizontal + insets.right + devMenuReserve,
  };

  return { containerStyle, insets, devMenuReserve };
}
