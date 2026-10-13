import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useHeaderBarInsets } from './headerInsets';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  topGap?: number;
  horizontal?: number;
};

/** Top app bar with safe-area and Expo Go dev-menu gutter applied consistently. */
export function HeaderBar({ children, style, topGap, horizontal }: Props) {
  const { containerStyle } = useHeaderBarInsets({ topGap, horizontal });
  return <View style={[styles.bar, containerStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
});
