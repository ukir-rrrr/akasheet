import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { uriForImageManipulator } from './importStageUri';
import { fitLongSide, type PreparedImage } from './types';

/** The manipulator renders an upright bitmap, which bakes EXIF orientation into the pixels. */
export async function encodeJpeg(
  uri: string,
  maxSide: number,
  quality: number,
  asDataUri: boolean,
): Promise<PreparedImage> {
  const inputUri = uriForImageManipulator(uri);
  let ref = await ImageManipulator.manipulate(inputUri).renderAsync();
  const resize = fitLongSide(ref.width, ref.height, maxSide);
  // A fresh context per pass: re-rendering a context fails on web.
  if (resize) ref = await ImageManipulator.manipulate(inputUri).resize(resize).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: asDataUri });
  const outUri = asDataUri ? `data:image/jpeg;base64,${out.base64 ?? ''}` : out.uri;
  return { uri: outUri, width: out.width, height: out.height };
}
