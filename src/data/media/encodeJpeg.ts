import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { fitLongSide, type PreparedImage } from './types';

/** The manipulator renders an upright bitmap, which bakes EXIF orientation into the pixels. */
export async function encodeJpeg(
  uri: string,
  maxSide: number,
  quality: number,
  asDataUri: boolean,
): Promise<PreparedImage> {
  let ref = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = fitLongSide(ref.width, ref.height, maxSide);
  // A fresh context per pass: re-rendering a context fails on web.
  if (resize) ref = await ImageManipulator.manipulate(uri).resize(resize).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: asDataUri });
  const outUri = asDataUri ? `data:image/jpeg;base64,${out.base64 ?? ''}` : out.uri;
  return { uri: outUri, width: out.width, height: out.height };
}
