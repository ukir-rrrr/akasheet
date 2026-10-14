import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '@/features/app/AppDataProvider';
import { DialogProvider } from '@/ui/dialogs';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <DialogProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <AppDataProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="folders/[folderId]" />
                <Stack.Screen
                  name="cards/new"
                  options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
                />
                <Stack.Screen
                  name="review/[folderId]"
                  options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
                />
                <Stack.Screen
                  name="review/summary"
                  options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
                />
                <Stack.Screen name="import/index" options={{ presentation: 'modal' }} />
              </Stack>
            </AppDataProvider>
          </DialogProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
