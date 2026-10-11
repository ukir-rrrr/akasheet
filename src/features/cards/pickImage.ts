import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

import type { CardSource } from '@/data/repos/cardRepo';
import { createHandoff } from '@/features/app/handoff';
import type { DialogApi } from '@/ui/dialogs';

export type PickSource = Extract<CardSource, 'camera' | 'library' | 'sample'>;
export type PickedImage = { uri: string; source: PickSource };

type Dialogs = Pick<DialogApi, 'sheet'>;

const SAMPLE = require('../../../assets/sample/textbook.jpg');

async function ensurePermission(source: 'camera' | 'library', dialogs: Dialogs): Promise<boolean> {
  const res =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (res.granted) return true;
  const other =
    source === 'camera'
      ? '「選ぶ」から写真を使うこともできます。'
      : '「撮る」からカメラを使うこともできます。';
  const choice = await dialogs.sheet({
    title: source === 'camera' ? 'カメラを使えません' : '写真を読み込めません',
    message: `設定アプリで許可すると使えるようになります。${other}`,
    actions: [{ value: 'settings' as const, label: '設定を開く' }],
  });
  if (choice === 'settings') await Linking.openSettings().catch(() => undefined);
  return false;
}

/** Returns the picked image URI (OS crop UI disabled, full quality) or null when cancelled/denied. */
export async function pickImage(source: PickSource, dialogs: Dialogs): Promise<PickedImage | null> {
  if (source === 'sample') {
    const asset = Asset.fromModule(SAMPLE);
    await asset.downloadAsync();
    return { uri: asset.localUri ?? asset.uri, source };
  }
  if (!(await ensurePermission(source, dialogs))) return null;
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets[0]) return null;
  return { uri: result.assets[0].uri, source };
}

/** Hands a picked image to the editor route without putting large URIs in route params. */
export const pendingImage = createHandoff<PickedImage>();
