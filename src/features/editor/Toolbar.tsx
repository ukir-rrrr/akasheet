import { StyleSheet, View } from 'react-native';

import { MARKER_WIDTHS_PT, type MarkerSize } from '@/domain/mask/geometry';
import { AppText, Icon, PressableScale, type IconName } from '@/ui/primitives';
import { heights, radius, shadow, useTheme } from '@/ui/theme';

import type { EditorAction, EditorState, Tool } from './editorReducer';

const SIZES: { key: MarkerSize; label: string }[] = [
  { key: 's', label: '小' },
  { key: 'm', label: '中' },
  { key: 'l', label: '大' },
];

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const fg = active ? c.onInk : c.ink;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tool, { backgroundColor: active ? c.ink : 'transparent', opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon name={icon} color={fg} size={20} />
      <AppText variant="caption" color={fg} style={{ fontSize: 10 }} numberOfLines={1}>
        {label}
      </AppText>
    </PressableScale>
  );
}

export function Toolbar({ state, dispatch }: { state: EditorState; dispatch: (a: EditorAction) => void }) {
  const { c } = useTheme();
  const setTool = (tool: Tool) => dispatch({ type: 'setTool', tool });
  const hasSelection = state.selectedId !== null;

  return (
    <View style={[styles.bar, shadow, { backgroundColor: c.surface }]}>
      {state.tool === 'marker' && !state.joinMode && (
        <View
          style={[styles.segment, { backgroundColor: c.surface2 }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="マーカーの太さ"
        >
          {SIZES.map((s) => {
            const on = state.size === s.key;
            return (
              <PressableScale
                key={s.key}
                testID={`size-${s.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`太さ ${s.label}`}
                onPress={() => dispatch({ type: 'setSize', size: s.key })}
                style={[styles.segItem, on && { backgroundColor: c.surface }]}
              >
                <View
                  style={{
                    width: MARKER_WIDTHS_PT[s.key] / 2.4,
                    height: MARKER_WIDTHS_PT[s.key] / 2.4,
                    borderRadius: 99,
                    backgroundColor: c.mask,
                  }}
                />
                <AppText variant="caption" color={on ? c.ink : c.ink2}>
                  {s.label}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      )}
      {(state.tool === 'select' || state.joinMode) && (
        <View style={[styles.segment, { backgroundColor: c.surface2 }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ selected: state.joinMode, disabled: !hasSelection }}
            disabled={!hasSelection}
            onPress={() => dispatch({ type: 'toggleJoin' })}
            style={[
              styles.segItem,
              state.joinMode && { backgroundColor: c.surface },
              { opacity: hasSelection ? 1 : 0.4 },
            ]}
          >
            <Icon name="link-outline" size={16} />
            <AppText variant="caption">{state.joinMode ? 'つなげて描く中' : 'つなげて描く'}</AppText>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            disabled={!hasSelection}
            onPress={() => dispatch({ type: 'deleteSelected' })}
            style={[styles.segItem, { opacity: hasSelection ? 1 : 0.4 }]}
          >
            <Icon name="trash-outline" size={16} color={c.shuInk} />
            <AppText variant="caption" color={c.shuInk}>
              消す
            </AppText>
          </PressableScale>
        </View>
      )}
      <View style={styles.tools}>
        <ToolButton
          icon="brush-outline"
          label="マーカー"
          active={state.tool === 'marker'}
          onPress={() => setTool('marker')}
          testID="tool-marker"
        />
        <ToolButton
          icon="square-outline"
          label="矩形"
          active={state.tool === 'rect'}
          onPress={() => setTool('rect')}
          testID="tool-rect"
        />
        <ToolButton
          icon="hand-left-outline"
          label="選択・消す"
          active={state.tool === 'select'}
          onPress={() => setTool('select')}
          testID="tool-select"
        />
        <View style={[styles.divider, { backgroundColor: c.line }]} />
        <ToolButton
          icon="arrow-undo-outline"
          label="元に戻す"
          disabled={state.past.length === 0}
          onPress={() => dispatch({ type: 'undo' })}
          testID="tool-undo"
        />
        <ToolButton
          icon="arrow-redo-outline"
          label="やり直す"
          disabled={state.future.length === 0}
          onPress={() => dispatch({ type: 'redo' })}
          testID="tool-redo"
        />
        <View style={[styles.divider, { backgroundColor: c.line }]} />
        <ToolButton
          icon="eye-outline"
          label="確認"
          disabled={state.masks.length === 0}
          onPress={() => dispatch({ type: 'togglePreview' })}
          testID="tool-preview"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radius.xl, padding: 8, gap: 8, width: '100%', maxWidth: 520, alignSelf: 'center' },
  segment: { flexDirection: 'row', borderRadius: radius.full, padding: 3, alignSelf: 'center' },
  segItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.full,
    minWidth: 64,
    justifyContent: 'center',
  },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tool: {
    width: 48,
    height: heights.tool,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  divider: { width: 1, height: 32 },
});
