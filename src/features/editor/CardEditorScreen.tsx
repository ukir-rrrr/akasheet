import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PreparedImage } from '@/data/media/types';
import { EMPTY_MASKS_MESSAGE } from '@/data/repos/cardRepo';
import type { Folder } from '@/data/repos/folderRepo';
import { useAppData } from '@/features/app/AppDataProvider';
import { goBackOr } from '@/features/app/navigation';
import { flash } from '@/features/app/flash';
import { useFolders, useInvalidateAll } from '@/features/app/queries';
import { pendingImage, type PickedImage } from '@/features/cards/pickImage';
import { useFolderActions } from '@/features/folders/useFolderActions';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';
import { AppText, Button, FolderTab, Icon, IconButton, PressableScale } from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';
import { Toast, type ToastSpec } from '@/ui/Toast';

import { editorReducer, initialEditorState } from './editorReducer';
import { MaskEditorCanvas } from './MaskEditorCanvas';
import { Toolbar } from './Toolbar';

const HINT_KEY = 'zoom_hint_shown';
const HINT_TIMES = 3;

function useZoomHint(): boolean {
  const { meta } = useAppData();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    meta
      .bumpCounter(HINT_KEY, HINT_TIMES)
      .then((first) => alive && first && setShow(true))
      .catch(() => undefined);
    const t = setTimeout(() => alive && setShow(false), 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [meta]);
  return show;
}

export function CardEditorScreen({ initialFolderId }: { initialFolderId?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppData();
  const dialogs = useDialogs();
  const invalidate = useInvalidateAll();
  const folders = useFolders();
  const { createFolder, startCard } = useFolderActions();
  const [picked] = useState<PickedImage | null>(() => pendingImage.take());
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | undefined>(initialFolderId);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const idSeq = useRef(0);
  const showHint = useZoomHint();

  const folderList = folders.data ?? [];
  const folder: Folder | undefined =
    folderList.find((f) => f.id === folderId) ?? (folderId ? undefined : folderList[0]);

  useEffect(() => {
    if (!picked) return;
    app.images
      .prepareImage(picked.uri)
      .then(setPrepared)
      .catch((e) => setPrepError(errorMessage(e)));
  }, [picked, app]);

  const close = async () => {
    if (state.dirty) {
      const ok = await dialogs.confirm({
        title: '編集内容を破棄しますか?',
        message: '描いたマスクは保存されません。',
        confirmLabel: '破棄する',
        destructive: true,
      });
      if (!ok) return;
    }
    goBackOr('/');
  };

  const chooseFolder = async () => {
    const NEW = { kind: 'new' } as const;
    const choice = await dialogs.sheet<string | typeof NEW>({
      title: '保存先のフォルダ',
      actions: [
        ...folderList.map((f) => ({
          value: f.id,
          label: f.name,
          icon: f.id === folder?.id ? ('checkmark' as const) : undefined,
        })),
        { value: NEW, label: '新しいフォルダ', icon: 'add' as const },
      ],
    });
    if (choice === null) return;
    if (typeof choice === 'string') setFolderId(choice);
    else {
      const f = await createFolder();
      if (f) setFolderId(f.id);
    }
  };

  const save = async () => {
    if (saving || !prepared || !picked) return;
    if (state.masks.length === 0) {
      setToast({
        id: idSeq.current++,
        message: EMPTY_MASKS_MESSAGE,
        icon: 'brush-outline',
        durationMs: 2500,
      });
      return;
    }
    let target = folder;
    if (!target) {
      const f = await createFolder();
      if (!f) return;
      setFolderId(f.id);
      target = f;
    }
    setSaving(true);
    try {
      await app.saveCard({
        folderId: target.id,
        image: prepared,
        masks: state.masks.map((m) => m.geometry),
        source: picked.source,
      });
      dispatch({ type: 'markSaved' });
      await invalidate();
      const savedFolderId = target.id;
      flash.show({
        message: `「${target.name}」に保存しました`,
        icon: 'checkmark-circle',
        actionLabel: 'もう1枚',
        actionIcon: 'camera-outline',
        onAction: () => startCard(picked.source, savedFolderId),
        durationMs: 4000,
      });
      goBackOr({ pathname: '/folders/[folderId]', params: { folderId: savedFolderId } });
    } catch (e) {
      await dialogs.alert('保存できませんでした', `${errorMessage(e)}\n編集内容はそのまま残っています。`);
    } finally {
      setSaving(false);
    }
  };

  if (!picked || prepError) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <Icon name="image-outline" size={36} color={c.ink3} />
        <AppText style={{ marginTop: 12, textAlign: 'center' }}>
          {prepError ? '画像を読み込めませんでした' : '画像が選ばれていません'}
        </AppText>
        {prepError && (
          <AppText variant="sub" color={c.ink3} style={{ marginTop: 6, textAlign: 'center' }}>
            {prepError}
          </AppText>
        )}
        <Button label="戻る" kind="secondary" onPress={() => goBackOr('/')} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 4,
            paddingRight: 8 + insets.right + heights.tap,
            backgroundColor: c.bg,
          },
        ]}
      >
        <IconButton icon="close" label="閉じる" onPress={close} testID="editor-close" />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`保存先 ${folder?.name ?? '未選択'}、変更する`}
          onPress={chooseFolder}
          style={[styles.folderPill, { borderColor: c.lineStrong, backgroundColor: c.surface }]}
          testID="editor-folder"
        >
          {folder ? (
            <FolderTab name={folder.name} color={folder.color} size="sm" />
          ) : (
            <Icon name="folder-outline" size={18} />
          )}
          <AppText variant="button" numberOfLines={1} style={{ maxWidth: 160 }}>
            {folder?.name ?? '保存先を選ぶ'}
          </AppText>
          <Icon name="chevron-down" size={16} color={c.ink3} />
        </PressableScale>
        <Button
          label="保存"
          onPress={save}
          loading={saving}
          height={40}
          style={{ borderRadius: radius.full, paddingHorizontal: 20 }}
          testID="editor-save"
        />
      </View>

      <View style={{ flex: 1 }}>
        {prepared ? (
          <MaskEditorCanvas
            uri={prepared.uri}
            img={prepared}
            state={state}
            onShape={(shape) => dispatch({ type: 'addShape', shape, id: `m${idSeq.current++}` })}
            onSelect={(id) => dispatch({ type: 'select', id })}
            onDeleteSelected={() => dispatch({ type: 'deleteSelected' })}
            onPreviewTap={(id) => dispatch({ type: 'togglePreviewMask', id })}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
            <AppText variant="sub" color="#FFFFFF" style={{ marginTop: 8 }}>
              写真を整えています…
            </AppText>
          </View>
        )}
        {showHint && prepared && (
          <View pointerEvents="none" style={styles.hintWrap}>
            <View style={[styles.hint, { backgroundColor: c.overlay }]}>
              <AppText variant="caption" color="#FFFFFF">
                2本指でズーム・ダブルタップで全体
              </AppText>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12, backgroundColor: c.canvas }]}>
        {state.preview ? (
          <View style={[styles.previewBar, { backgroundColor: c.surface }]}>
            <Icon name="eye-outline" />
            <AppText variant="sub" style={{ flex: 1 }}>
              復習と同じ見え方です・タップでめくれます
            </AppText>
            <Button
              label="編集に戻る"
              kind="secondary"
              height={40}
              onPress={() => dispatch({ type: 'togglePreview' })}
              testID="preview-exit"
            />
          </View>
        ) : (
          <Toolbar state={state} dispatch={dispatch} />
        )}
      </View>
      <Toast spec={toast} onDone={() => setToast(null)} bottom={insets.bottom + 150} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  folderPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  bottom: { paddingHorizontal: 8, paddingTop: 10 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingLeft: 16,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  hintWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  hint: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
});
