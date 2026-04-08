import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./api";

const TASK_NAME = "BACKGROUND_MESSAGES";
const KEY_CODIGO = "bg_tienda_codigo";
const KEY_LAST_CHECK = "bg_last_check";

export async function saveCodigoForBackground(codigo: string) {
  await AsyncStorage.setItem(KEY_CODIGO, codigo);
}

export async function registerBackgroundMessages() {
  try {
    // Dynamic require — these native modules are only available after rebuild
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BackgroundFetch = require("expo-background-fetch");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications");

    if (!TaskManager.isTaskDefined(TASK_NAME)) {
      TaskManager.defineTask(TASK_NAME, async () => {
        try {
          const codigo = await AsyncStorage.getItem(KEY_CODIGO);
          if (!codigo) return BackgroundFetch.BackgroundFetchResult.NoData;

          const lastCheck = await AsyncStorage.getItem(KEY_LAST_CHECK);
          const lastCheckDate = lastCheck
            ? new Date(lastCheck)
            : new Date(Date.now() - 20 * 60 * 1000);

          const res = await fetch(`${API_URL}/mensajes/conversaciones`);
          if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

          const convs: Array<{
            noLeidos: number;
            ultimoMensaje?: { remitente: string; creadoEn: string; texto?: string };
          }> = await res.json();

          let totalNuevos = 0;
          let primerRemitente = "";
          let primerTexto = "";

          for (const conv of convs) {
            if (
              conv.noLeidos > 0 &&
              conv.ultimoMensaje &&
              new Date(conv.ultimoMensaje.creadoEn) > lastCheckDate &&
              conv.ultimoMensaje.remitente !== codigo
            ) {
              totalNuevos += conv.noLeidos;
              if (!primerRemitente) {
                primerRemitente = conv.ultimoMensaje.remitente;
                primerTexto = conv.ultimoMensaje.texto ?? "";
              }
            }
          }

          await AsyncStorage.setItem(KEY_LAST_CHECK, new Date().toISOString());

          if (totalNuevos > 0) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title:
                  totalNuevos === 1
                    ? `Mensaje de ${primerRemitente}`
                    : `${totalNuevos} mensajes nuevos`,
                body: primerTexto || "Tocá para abrir AuditStock",
                channelId: "mensajes",
                data: { type: "bg_message" },
              },
              trigger: null,
            });
            return BackgroundFetch.BackgroundFetchResult.NewData;
          }

          return BackgroundFetch.BackgroundFetchResult.NoData;
        } catch {
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });
    }

    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log("[bgfetch] Background message polling registrado");
  } catch (e) {
    // Native module not available in current APK build — activates on next build
    console.log("[bgfetch] Native module no disponible (se activa en próximo build):", e);
  }
}
