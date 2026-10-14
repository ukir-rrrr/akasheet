import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/shared/errors';

import { AppText, Button, Icon, PressableScale, type IconName } from './primitives';
import { heights, radius, useTheme } from './theme';

export type SheetAction<T> = {
  value: T;
  label: string;
  icon?: IconName;
  destructive?: boolean;
  hint?: string;
  testID?: string;
};

export type SheetOptions<T> = {
  title?: string;
  message?: string;
  actions: SheetAction<T>[];
  cancelLabel?: string;
};
type SheetRequest = SheetOptions<unknown> & { kind: 'sheet' };
type PromptRequest = {
  kind: 'prompt';
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
};
type Request =
  | (SheetRequest & { resolve: (v: unknown) => void })
  | (PromptRequest & { resolve: (v: string | null) => void });

export type DialogApi = {
  /** Resolves with the chosen action's value, or null when cancelled. */
  sheet: <T>(r: SheetOptions<T>) => Promise<T | null>;
  confirm: (r: {
    title: string;
    message?: string;
    confirmLabel: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  alert: (title: string, message?: string) => Promise<void>;
  prompt: (r: Omit<PromptRequest, 'kind'>) => Promise<string | null>;
  /** Runs `fn`; on failure shows `title` with the error message and resolves null. */
  attempt: <T>(title: string, fn: () => Promise<T>) => Promise<T | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('DialogProvider missing');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);

  const api = useMemo<DialogApi>(() => {
    const sheet = <T,>(r: SheetOptions<T>) =>
      new Promise<T | null>((resolve) =>
        setReq({ kind: 'sheet', ...r, resolve: (v) => resolve(v as T | null) }),
      );
    const alert: DialogApi['alert'] = async (title, message) => {
      await sheet({ title, message, actions: [], cancelLabel: 'OK' });
    };
    return {
      sheet,
      confirm: async ({ title, message, confirmLabel, destructive }) =>
        (await sheet({
          title,
          message,
          actions: [{ value: true, label: confirmLabel, destructive, testID: 'dialog-confirm' }],
        })) === true,
      alert,
      prompt: (r) => new Promise((resolve) => setReq({ kind: 'prompt', ...r, resolve })),
      attempt: async (title, fn) => {
        try {
          return await fn();
        } catch (e) {
          await alert(title, errorMessage(e));
          return null;
        }
      },
    };
  }, []);

  const close = useCallback(
    (value: unknown) => {
      if (!req) return;
      setReq(null);
      (req.resolve as (v: unknown) => void)(value);
    },
    [req],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        transparent
        visible={req !== null}
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => close(null)}
      >
        {req?.kind === 'sheet' && <SheetView req={req} onClose={close} />}
        {req?.kind === 'prompt' && <PromptView req={req} onClose={close} />}
      </Modal>
    </DialogContext.Provider>
  );
}

function SheetView({ req, onClose }: { req: SheetRequest; onClose: (v: unknown) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={[styles.backdrop, { backgroundColor: c.overlay }]}
      onPress={() => onClose(null)}
      accessibilityLabel="閉じる"
    >
      <Pressable
        style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 12 }]}
        onPress={() => undefined}
      >
        {(req.title || req.message) && (
          <View style={styles.sheetHeader}>
            {req.title && <AppText style={{ textAlign: 'center' }}>{req.title}</AppText>}
            {req.message && (
              <AppText variant="sub" color={c.ink3} style={{ textAlign: 'center', marginTop: 4 }}>
                {req.message}
              </AppText>
            )}
          </View>
        )}
        {req.actions.map((a) => (
          <PressableScale
            key={a.label}
            testID={a.testID}
            accessibilityRole="button"
            onPress={() => onClose(a.value)}
            style={[styles.action, { borderTopColor: c.line }]}
          >
            <AppText color={a.destructive ? c.shuInk : c.ink} style={{ flex: 1 }}>
              {a.label}
              {a.hint ? (
                <AppText variant="sub" color={c.ink3}>
                  {'  '}
                  {a.hint}
                </AppText>
              ) : null}
            </AppText>
            {a.icon && <Icon name={a.icon} color={a.destructive ? c.shuInk : c.ink2} />}
          </PressableScale>
        ))}
        <Button
          label={req.cancelLabel ?? 'キャンセル'}
          kind="secondary"
          onPress={() => onClose(null)}
          style={{ marginTop: 12 }}
          testID="dialog-cancel"
        />
      </Pressable>
    </Pressable>
  );
}

function PromptView({ req, onClose }: { req: PromptRequest; onClose: (v: string | null) => void }) {
  const { c } = useTheme();
  const [value, setValue] = useState(req.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const submit = () => {
    const err = req.validate?.(value) ?? null;
    if (err) {
      setError(err);
      return;
    }
    onClose(value);
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.center, { backgroundColor: c.overlay }]}
    >
      <View style={[styles.prompt, { backgroundColor: c.surface }]} accessibilityViewIsModal>
        <AppText variant="section">{req.title}</AppText>
        {req.message && (
          <AppText variant="sub" color={c.ink3} style={{ marginTop: 4 }}>
            {req.message}
          </AppText>
        )}
        <TextInput
          ref={inputRef}
          testID="prompt-input"
          autoFocus
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError(null);
          }}
          onSubmitEditing={submit}
          placeholder={req.placeholder}
          placeholderTextColor={c.ink3}
          maxLength={60}
          style={[
            styles.input,
            { color: c.ink, borderColor: error ? c.shuInk : c.lineStrong, backgroundColor: c.bg },
          ]}
          accessibilityLabel={req.title}
        />
        {error && (
          <AppText variant="sub" color={c.shuInk} style={{ marginTop: 6 }} accessibilityRole="alert">
            {error}
          </AppText>
        )}
        <View style={styles.promptButtons}>
          <Button label="キャンセル" kind="secondary" onPress={() => onClose(null)} style={{ flex: 1 }} />
          <Button
            label={req.confirmLabel ?? 'OK'}
            onPress={submit}
            style={{ flex: 1 }}
            testID="prompt-confirm"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  sheetHeader: { paddingBottom: 12, paddingHorizontal: 8 },
  action: {
    minHeight: heights.button + 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  prompt: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 20 },
  input: {
    marginTop: 16,
    height: heights.button,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  promptButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
});
