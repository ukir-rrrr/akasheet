import Constants from 'expo-constants';
import { Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headerBarPaddingRight } from './headerBarPadding';
import { devMenuReservePx } from './expoGoDevMenuReserve';
import { space } from './theme';

export { headerBarPaddingRight } from './headerBarPadding';

export {
  EXPO_GO_DEV_MENU_RESERVE_ANDROID,
  EXPO_GO_DEV_MENU_RESERVE_IOS,
  shouldReserveExpoGoDevMenu,
} from './expoGoDevMenuReserve';

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
  const devMenuReserve = devMenuReservePx(Platform.OS, Constants.executionEnvironment);
  const paddingRight = headerBarPaddingRight(
    { horizontal },
    { right: insets.right },
    Platform.OS,
    Constants.executionEnvironment,
  );

  const containerStyle: ViewStyle = {
    paddingTop: insets.top + topGap,
    paddingLeft: horizontal + insets.left,
    paddingRight,
  };

  return { containerStyle, insets, devMenuReserve };
}
