import "@/polyfills";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { StoreConfigProvider, useStoreConfig } from "@/context/StoreConfigContext";
import { BossConfigProvider, useBossConfig } from "@/context/BossConfigContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const isWeb = Platform.OS === "web";

function RootLayoutNav() {
  const { storeConfig, isLoading: storeLoading } = useStoreConfig();
  const { bossAuthenticated, isLoading: bossLoading } = useBossConfig();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (storeLoading || bossLoading) return;

    const inBoss = segments[0] === "boss" || segments[0] === "boss-login";
    const inSetup = segments[0] === "setup";
    const inTabs = segments[0] === "(tabs)";

    if (bossAuthenticated) {
      if (!inBoss) router.replace("/boss");
      return;
    }

    if (!storeConfig && !inSetup && !inBoss) {
      router.replace("/setup");
    } else if (storeConfig && inSetup) {
      router.replace("/(tabs)");
    }
  }, [storeConfig, storeLoading, bossAuthenticated, bossLoading, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Atrás" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ headerShown: false }} />
      <Stack.Screen name="boss-login" options={{ headerShown: false }} />
      <Stack.Screen name="boss" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    isWeb
      ? {}
      : {
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
        }
  );

  const ready = isWeb || fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BossConfigProvider>
            <StoreConfigProvider>
              <DatabaseProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </DatabaseProvider>
            </StoreConfigProvider>
          </BossConfigProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
