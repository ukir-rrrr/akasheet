import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { AppText, Icon, PressableScale, type IconName } from './primitives';
import { radius, useTheme } from './theme';

export type ToastSpec = {
  id: number;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  durationMs?: number;
};

/** Ink toast with an optional action and a bottom bar that shrinks over the toast's lifetime. */
export type ToastEnd = 'timeout' | 'action';

export function Toast({
  spec,
  onDone,
  bottom = 16,
}: {
  spec: ToastSpec | null;
  onDone: (reason: ToastEnd) => void;
  bottom?: number;
}) {
  const { c } = useTheme();
  const progress = useSharedValue(1);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const id = spec?.id;
  const ms = spec?.durationMs ?? 3000;
  useEffect(() => {
    if (id === undefined) return;
    progress.value = 1;
    progress.value = withTiming(0, { duration: ms, easing: Easing.linear });
    const timer = setTimeout(() => doneRef.current('timeout'), ms);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [id, ms, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!spec) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        style={[styles.toast, { backgroundColor: c.ink }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        testID="toast"
      >
        <View style={styles.row}>
          {spec.icon && <Icon name={spec.icon} color={c.matchaTint} size={18} />}
          <AppText variant="button" color={c.onInk} style={{ flex: 1 }} numberOfLines={2}>
            {spec.message}
          </AppText>
          {spec.actionLabel && (
            <PressableScale
              testID="toast-action"
              accessibilityRole="button"
              onPress={() => {
                spec.onAction?.();
                onDone('action');
              }}
              style={[styles.action, { borderColor: c.ink3 }]}
            >
              {spec.actionIcon && <Icon name={spec.actionIcon} color={c.onInk} size={16} />}
              <AppText variant="button" color={c.onInk}>
                {spec.actionLabel}
              </AppText>
            </PressableScale>
          )}
        </View>
        <Animated.View style={[styles.bar, { backgroundColor: c.ink3 }, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { width: '100%', maxWidth: 520, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 52,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    height: 36,
  },
  bar: { height: 3 },
});
