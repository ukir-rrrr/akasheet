// react-native-skia binds to the global CanvasKit when its modules load, so CanvasKit must be
// initialized before any route module is evaluated.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(() => {
  require('expo-router/entry');
});
