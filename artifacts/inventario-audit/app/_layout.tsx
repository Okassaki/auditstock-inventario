import "@/polyfills";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";

import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { StoreConfigProvider, useStoreConfig } from "@/context/StoreConfigContext";
import { BossConfigProvider, useBossConfig } from "@/context/BossConfigContext";
import { CallProvider, useCall, type IncomingCallInfo } from "@/context/CallContext";
import { IncomingCallOverlay } from "@/components/IncomingCallOverlay";
import { ActiveCallOverlay } from "@/components/ActiveCallOverlay";
import { registerForPushNotificationsAsync, openNotificationSettings } from "@/utils/notifications";
import { saveCodigoForBackground, registerBackgroundMessages } from "@/utils/backgroundMessages";
import { checkForUpdate, registerUpdateCallback, registerBackgroundUpdateChecker, currentVersionCode } from "@/utils/updateChecker";
import { connectChatSocket, disconnectChatSocket } from "@/utils/chatSocket";
import { UpdateModal, type UpdateInfo } from "@/components/UpdateModal";

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

// Seguro de último recurso: si React crashea o los hooks se cuelgan,
// ocultar el splash a los 5s directamente desde el módulo (fuera de React).
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, 5000);

const queryClient = new QueryClient();

const isWeb = Platform.OS === "web";

function RootLayoutNav() {
  const { storeConfig, isLoading: storeLoading } = useStoreConfig();
  const { bossAuthenticated, isLoading: bossLoading } = useBossConfig();
  const { triggerIncomingCallFromNotification } = useCall();
  const router = useRouter();
  const segments = useSegments();
  const notifListenerRef = useRef<Notifications.Subscription | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Registrar callback + verificar actualización inmediatamente al abrir la app
  useEffect(() => {
    registerUpdateCallback(setUpdateInfo);
    registerBackgroundUpdateChecker().catch(() => {});
    checkForUpdate({ silent: true }).catch(() => {});
  }, []);

  // Manejar llamada entrante desde notificación que LANZÓ la app (cold start)
  // Se ejecuta inmediatamente al montar, sin esperar storeConfig/bossConfig.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data || data.type !== "call_offer") return;
      const callerId = data.caller ?? data.from ?? "";
      triggerIncomingCallFromNotification({
        from: callerId,
        fromName: data.fromName ?? callerId,
        type: (data.callType as "audio" | "video") ?? "audio",
        roomId: data.roomId ?? "",
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verificar periódicamente cada 3 minutos mientras la app está abierta
  useEffect(() => {
    const interval = setInterval(() => checkForUpdate({ silent: true }), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Conectar WebSocket para mensajes en tiempo real
  useEffect(() => {
    if (storeLoading || bossLoading) return;
    let codigo: string | null = null;
    if (bossAuthenticated) codigo = "JEFE";
    else if (storeConfig) codigo = storeConfig.codigo;
    if (codigo) {
      connectChatSocket(codigo);
    } else {
      disconnectChatSocket();
    }
    return () => { disconnectChatSocket(); };
  }, [storeConfig, bossAuthenticated, storeLoading, bossLoading]);

  // Solicitar exclusión de optimización de batería (Android) — solo la primera vez.
  // Muestra primero un Alert explicativo; al tocar "Activar", abre el diálogo del sistema
  // donde el usuario solo tiene que tocar "Permitir". Sin esto, Android mata FCM y las
  // llamadas no llegan cuando la app está cerrada.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (storeLoading || bossLoading) return;
    const isConfigured = bossAuthenticated || !!storeConfig;
    if (!isConfigured) return;
    // Esperar que la UI esté completamente visible antes de mostrar diálogos
    const timer = setTimeout(() => {
      AsyncStorage.getItem("battery_opt_asked").then((val) => {
        if (val) return;
        Alert.alert(
          "Recibir llamadas con la app cerrada",
          "Para que las llamadas lleguen aunque la app no esté abierta, necesitás desactivar la optimización de batería para AuditStock. Solo es un toque.",
          [
            { text: "Ahora no", style: "cancel" },
            {
              text: "Activar",
              onPress: () => {
                AsyncStorage.setItem("battery_opt_asked", "true").catch(() => {});
                IntentLauncher.startActivityAsync(
                  "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
                  { data: "package:com.auditstock.inventario" },
                ).catch(() => {
                  // Fallback: abrir configuración general de batería si el intent no está disponible
                  IntentLauncher.startActivityAsync(
                    "android.settings.BATTERY_SAVER_SETTINGS",
                  ).catch(() => {});
                });
              },
            },
          ],
        );
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading, bossLoading, bossAuthenticated, storeConfig]);

  // Registrar push token cuando la tienda o el jefe están listos
  useEffect(() => {
    if (storeLoading || bossLoading) return;
    let codigo: string | null = null;
    if (bossAuthenticated) codigo = "JEFE";
    else if (storeConfig) codigo = storeConfig.codigo;
    if (codigo) {
      // Guardar código para que el background task lo use cuando el app esté cerrado
      saveCodigoForBackground(codigo).catch(() => {});
      // Intentar registrar background fetch (se activa en próximo build que incluya Firebase)
      registerBackgroundMessages().catch(() => {});
      // Registrar push token con FCM
      registerForPushNotificationsAsync(codigo)
        .then((result) => {
          if (!result.ok && result.reason === "permission_denied") {
            Alert.alert(
              "Notificaciones desactivadas",
              "Para recibir mensajes y llamadas cuando el app está cerrado, habilitá las notificaciones en Configuración del sistema.",
              [
                { text: "Ahora no", style: "cancel" },
                { text: "Ir a Configuración", onPress: () => openNotificationSettings() },
              ],
            );
          }
        })
        .catch((err) => console.warn("[push]", err));
    }
  }, [storeConfig, bossAuthenticated, storeLoading, bossLoading]);

  // Manejar taps en notificaciones
  useEffect(() => {
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data) return;

      // Notificación de actualización disponible
      if (data.type === "update_available") {
        setUpdateInfo({
          versionCode: Number(data.versionCode ?? 0),
          currentCode: currentVersionCode(),
          name: data.releaseName ?? `v${data.versionCode}`,
          downloadUrl: data.downloadUrl ?? "",
        });
        return;
      }

      // Notificación de llamada entrante
      if (data.type === "call_offer") {
        const callerId = data.caller ?? data.from;
        const info: IncomingCallInfo = {
          from: callerId,
          fromName: data.fromName ?? callerId,
          type: (data.callType as "audio" | "video") ?? "audio",
          roomId: data.roomId,
        };
        triggerIncomingCallFromNotification(info);
        return;
      }

      // Notificación de mensaje
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
  }, [bossAuthenticated, storeConfig, router, triggerIncomingCallFromNotification]);

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
      // Salió del Modo Jefe o llegó sin autenticar
      // Si el dispositivo tiene tienda configurada → ir a la tienda
      // Si no → ir al login del jefe para que pueda entrar de nuevo
      if (storeConfig) {
        router.replace("/(tabs)");
      } else {
        router.replace("/boss-login");
      }
      return;
    }

    if (!storeConfig && !inSetup && !inBossLogin) {
      router.replace("/setup");
    } else if (storeConfig && inSetup) {
      router.replace("/(tabs)");
    }
  }, [storeConfig, storeLoading, bossAuthenticated, bossLoading, segments]);

  return (
    <>
      <Stack screenOptions={{ headerBackTitle: "Atrás" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="boss-login" options={{ headerShown: false }} />
        <Stack.Screen name="boss" options={{ headerShown: false }} />
        <Stack.Screen name="chat-room" options={{ headerShown: false }} />
        <Stack.Screen name="ajustes-sonido" options={{ headerShown: false }} />
      </Stack>
      <UpdateModal info={updateInfo} onDismiss={() => setUpdateInfo(null)} />
    </>
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

  // Timeout de seguridad: si useFonts se cuelga en producción (sin error ni éxito),
  // forzamos la continuación a los 4 segundos para no quedar atascados en el splash.
  const [forceReady, setForceReady] = React.useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const ready = isWeb || fontsLoaded || !!fontError || forceReady;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
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
