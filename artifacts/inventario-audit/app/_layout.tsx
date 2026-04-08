import "@/polyfills";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { StoreConfigProvider, useStoreConfig } from "@/context/StoreConfigContext";
import { BossConfigProvider, useBossConfig } from "@/context/BossConfigContext";
import { CallProvider } from "@/context/CallContext";
import { IncomingCallOverlay } from "@/components/IncomingCallOverlay";
import { ActiveCallOverlay } from "@/components/ActiveCallOverlay";
import { registerForPushNotificationsAsync } from "@/utils/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const isWeb = Platform.OS === "web";

function RootLayoutNav() {
  const { storeConfig, isLoading: storeLoading } = useStoreConfig();
  const { bossAuthenticated, isLoading: bossLoading } = useBossConfig();
  const router = useRouter();
  const segments = useSegments();
  const notifListenerRef = useRef<Notifications.Subscription | null>(null);

  // Registrar push token cuando la tienda o el jefe están listos
  useEffect(() => {
    if (storeLoading || bossLoading) return;
    let codigo: string | null = null;
    if (bossAuthenticated) codigo = "JEFE";
    else if (storeConfig) codigo = storeConfig.codigo;
    if (codigo) registerForPushNotificationsAsync(codigo).catch(() => {});
  }, [storeConfig, bossAuthenticated, storeLoading, bossLoading]);

  // Manejar taps en notificaciones
  useEffect(() => {
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data) return;
      const { deTienda, paraTienda } = data;
      if (!deTienda) return;
      const con = paraTienda === "GENERAL" || !paraTienda ? "GENERAL" : deTienda;
      const conNombre = con === "GENERAL" ? "General" : deTienda;
      if (bossAuthenticated) {
        router.push({ pathname: "/boss/chat-room", params: { con, conNombre } });
      } else if (storeConfig) {
        router.push({ pathname: "/chat-room", params: { yo: storeConfig.codigo, con, conNombre } });
      }
    });
    return () => { notifListenerRef.current?.remove(); };
  }, [bossAuthenticated, storeConfig, router]);

  useEffect(() => {
    if (storeLoading || bossLoading) return;

    const inBossMain   = segments[0] === "boss";            // tabs del jefe
    const inBossLogin  = segments[0] === "boss-login";      // pantalla de login del jefe
    const inBoss       = inBossMain || inBossLogin;
    const inSetup      = segments[0] === "setup";
    // Rutas accesibles desde cualquier modo (boss o tienda)
    const inShared     = segments[0] === "ajustes-sonido" || segments[0] === "chat-room";

    if (bossAuthenticated) {
      // Autenticado como jefe: permitir rutas del jefe y rutas compartidas
      if (!inBossMain && !inShared) router.replace("/boss");
      return;
    }

    // No autenticado:
    if (inBossMain) {
      // Llegó a las tabs sin autenticar (race condition o navegación directa)
      // → mandarlo al login del jefe, no al setup
      router.replace("/boss-login");
      return;
    }

    if (!storeConfig && !inSetup && !inBossLogin) {
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
      <Stack.Screen name="ajustes-sonido" options={{ headerShown: false }} />
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
                  <CallProvider>
                    <RootLayoutNav />
                    <IncomingCallOverlay />
                    <ActiveCallOverlay />
                  </CallProvider>
                </GestureHandlerRootView>
              </DatabaseProvider>
            </StoreConfigProvider>
          </BossConfigProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
