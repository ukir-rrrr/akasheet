import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { openAppData, type AppData } from '@/data/db/client';
import { collectGarbage } from '@/data/media/mediaStore';
import { errorMessage } from '@/shared/errors';
import { AppText, Button, Icon } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

const GC_GRACE_MS = 30 * 86_400_000;

const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error('AppDataProvider missing');
  return v;
}

async function startup(): Promise<AppData> {
  const app = await openAppData();
  try {
    // Files of media whose cards were deleted 30+ days ago, then any orphan files left by failed saves.
    const purge = await app.cards.unreferencedMedia(app.ctx.clock.now() - GC_GRACE_MS);
    for (const m of purge) await app.cards.markMediaPurged(m.id);
    await collectGarbage(await app.cards.livePaths());
  } catch (e) {
    console.warn('media GC failed', e);
  }
  return app;
}

// Shared per attempt so a double-invoked effect (StrictMode) does not open and migrate the DB twice.
let started: { attempt: number; promise: Promise<AppData> } | null = null;
function startupOnce(attempt: number): Promise<AppData> {
  if (started?.attempt !== attempt) started = { attempt, promise: startup() };
  return started.promise;
}

/** Opens the DB and runs migrations + GC before any screen renders. Never deletes the DB on failure. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const [state, setState] = useState<{ app?: AppData; error?: unknown }>({});

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    startupOnce(attempt).then(
      (app) => alive && setState({ app }),
      (error: unknown) => alive && setState({ error }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const open = () => {
    setState({});
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (state.app || state.error) SplashScreen.hideAsync().catch(() => undefined);
  }, [state]);

  if (state.error) {
    const diag = `めくる DB error\nplatform=${Platform.OS}\n${errorMessage(state.error)}`;
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]} accessibilityRole="alert">
        <Icon name="warning-outline" size={36} color={c.warn} />
        <AppText variant="section" style={{ marginTop: 12 }}>
          データを開けませんでした
        </AppText>
        <AppText variant="sub" color={c.ink3} style={{ textAlign: 'center', marginTop: 8 }}>
          データは削除していません。再試行しても開けない場合は診断情報を送ってください。
        </AppText>
        <Button label="再試行" onPress={open} style={{ marginTop: 20, alignSelf: 'stretch' }} />
        <Button
          label="診断情報をコピー・共有"
          kind="secondary"
          onPress={() => Share.share({ message: diag }).catch(() => undefined)}
          style={{ marginTop: 12, alignSelf: 'stretch' }}
        />
      </View>
    );
  }
  if (!state.app) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return <AppDataContext.Provider value={state.app}>{children}</AppDataContext.Provider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
