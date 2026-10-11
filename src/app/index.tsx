import { Canvas, Rect } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { openAppData } from '@/data/db/client';

export default function Smoke() {
  const [msg, setMsg] = useState('opening');
  useEffect(() => {
    (async () => {
      try {
        const app = await openAppData();
        await app.folders.create('smoke');
        const list = await app.folders.list(Number.MAX_SAFE_INTEGER);
        setMsg(`folders=${list.length}`);
      } catch (e) {
        setMsg(`error: ${String(e)}`);
      }
    })();
  }, []);
  return (
    <View>
      <Text testID="msg">{msg}</Text>
      <Canvas style={{ width: 200, height: 100 }}>
        <Rect x={10} y={10} width={100} height={50} color="#D9381E" />
      </Canvas>
    </View>
  );
}
