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
import * as Updates from "expo-updates";
import React, { useEffect } from "react";
import { Alert, Platform } from "react-native";
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

    // inBoss incluye AMBAS pantallas: boss-login y boss tabs
    const inBoss      = segments[0] === "boss" || segments[0] === "boss-login";
    const inBossMain  = segments[0] === "boss"; // sólo las tabs del jefe (no el login)
    const inSetup     = segments[0] === "setup";

    if (bossAuthenticated) {
      // No redirigir si ya está en cualquier pantalla de boss (incluyendo boss-login)
      // boss-login.tsx maneja su propia navegación hacia /boss
      if (!inBoss) router.replace("/boss");
      return;
    }

    // Sin autenticar y dentro de las tabs del jefe → redirigir afuera
    // (boss-login está excluido: el usuario está ingresando su PIN)
    if (inBossMain) {
      if (storeConfig) router.replace("/(tabs)");
      else router.replace("/setup");
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
      <Stack.Screen name="chat-room" options={{ headerShown: false }} />
    </Stack>
  );
}

async function checkForUpdates() {
  if (isWeb) return;
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      Alert.alert(
        "Nueva versión disponible",
        "Se descargó una actualización. ¿Reiniciar ahora para aplicarla?",
        [
          { text: "Después", style: "cancel" },
          { text: "Reiniciar", onPress: () => Updates.reloadAsync() },
        ]
      );
    }
  } catch {
    // En desarrollo o sin conexión, ignorar silenciosamente
  }
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
      checkForUpdates();
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
