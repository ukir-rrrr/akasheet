import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { FolderColor } from '@/data/repos/folderRepo';

import { FOLDER_COLOR_HEX, heights, radius, type, useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof type;

export function AppText({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const { c } = useTheme();
  return <Text {...rest} style={[type[variant] as TextStyle, { color: color ?? c.ink }, style]} />;
}

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.ink} />;
}

/** Press feedback is a 0.97 scale (never opacity), per the UI spec. */
export function PressableScale({
  style,
  children,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [style, pressed && !rest.disabled ? { transform: [{ scale: 0.97 }] } : null]}
    >
      {children}
    </Pressable>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  height = heights.button,
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.ink : kind === 'secondary' ? c.surface : 'transparent';
  const fg = kind === 'primary' ? c.onInk : c.ink;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        { height, backgroundColor: bg, opacity: disabled ? 0.45 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: c.lineStrong },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} size={18} /> : null}
      <AppText variant="button" color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  testID,
  size = 22,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  testID?: string;
  size?: number;
}) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={styles.iconButton}
    >
      <Icon name={icon} color={color} size={size} />
    </PressableScale>
  );
}

export function Badge({ label, tone }: { label: string; tone: 'due' | 'done' | 'muted' }) {
  const { c } = useTheme();
  const bg = tone === 'due' ? c.shuInk : tone === 'done' ? c.matchaTint : 'transparent';
  const fg = tone === 'due' ? '#FFFFFF' : tone === 'done' ? c.matchaInk : c.ink3;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText variant="caption" color={fg} style={{ fontVariant: ['tabular-nums'] }}>
        {label}
      </AppText>
    </View>
  );
}

export function FolderTab({
  name,
  color,
  size = 'md',
}: {
  name: string;
  color: FolderColor;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'md' ? { width: 42, height: 50 } : { width: 26, height: 30 };
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.tab, dims, { backgroundColor: FOLDER_COLOR_HEX[color] }]}
    >
      <AppText variant="initial" color="#FFFFFF" style={size === 'sm' ? { fontSize: 14 } : undefined}>
        {[...name][0] ?? '?'}
      </AppText>
    </View>
  );
}

export function Skeleton({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height, backgroundColor: c.surface2, borderRadius: radius.md }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg }, style]}>{children}</View>;
}

export function ErrorState({
  onRetry,
  title = '読み込めませんでした',
}: {
  onRetry: () => void;
  title?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Icon name="warning-outline" size={32} color={c.warn} />
      <AppText style={{ marginTop: 8 }}>{title}</AppText>
      <AppText variant="sub" color={c.ink3} style={{ marginTop: 4, textAlign: 'center' }}>
        データは端末に残っています
      </AppText>
      <Button
        label="再試行"
        kind="secondary"
        onPress={onRetry}
        style={{ marginTop: 16, paddingHorizontal: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  iconButton: { width: heights.tap, height: heights.tap, alignItems: 'center', justifyContent: 'center' },
  badge: {
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: 'center',
  },
  tab: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
