import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { API_URL } from "./api";

const TASK_NAME = "BACKGROUND_MESSAGES";
const KEY_CODIGO = "bg_tienda_codigo";
const KEY_LAST_CHECK = "bg_last_check";

// DEBE estar al nivel del módulo — expo-task-manager lo exige fuera de cualquier función
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const codigo = await AsyncStorage.getItem(KEY_CODIGO);
    if (!codigo) return BackgroundFetch.BackgroundFetchResult.NoData;

    const lastCheck = await AsyncStorage.getItem(KEY_LAST_CHECK);
    const lastCheckDate = lastCheck
      ? new Date(lastCheck)
      : new Date(Date.now() - 20 * 60 * 1000);

    const res = await fetch(
      `${API_URL}/mensajes/conversaciones?yo=${encodeURIComponent(codigo)}`
    );
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

export async function saveCodigoForBackground(codigo: string) {
  await AsyncStorage.setItem(KEY_CODIGO, codigo);
}

export async function registerBackgroundMessages() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    console.log("[bgfetch] Background polling registrado ✓");
  } catch (e) {
    console.log("[bgfetch] Error al registrar:", e);
  }
}
