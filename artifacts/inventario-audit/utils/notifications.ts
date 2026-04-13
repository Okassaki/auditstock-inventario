import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { API_URL } from "./api";
import { getCallTone, getMsgTone, getCustomCallUri, getSystemCallUri } from "./ringtone";

export type PushRegResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_device" | "permission_denied" | "token_error" | "network_error"; detail?: string };

async function reportToServer(tiendaCodigo: string, result: PushRegResult) {
  try {
    await fetch(`${API_URL}/push-debug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiendaCodigo, ...result, platform: Platform.OS, ts: new Date().toISOString() }),
    });
  } catch {}
}

export async function registerForPushNotificationsAsync(
  tiendaCodigo: string,
): Promise<PushRegResult> {
  if (!Device.isDevice) {
    const r: PushRegResult = { ok: false, reason: "not_device" };
    await reportToServer(tiendaCodigo, r);
    return r;
  }

  if (Platform.OS === "android") {
    // Leer preferencias de tono guardadas
    let callSound = "ring1"; // valor para el servicio nativo Kotlin
    let callBundled: string | null = "ring1.wav"; // para el canal Expo (solo soporta archivos bundled)
    let msgBundled: string | null = "ping.wav";
    try {
      const [ct, mt, sysCallUri, custCallUri] = await Promise.all([
        getCallTone(), getMsgTone(), getSystemCallUri(), getCustomCallUri(),
      ]);
      if (ct === "ring2")       { callSound = "ring2";  callBundled = "ring2.wav"; }
      else if (ct === "ring3")  { callSound = "ring3";  callBundled = "ring3.wav"; }
      else if (ct === "silent") { callSound = "silent"; callBundled = null; }
      else if (ct === "system" && sysCallUri) { callSound = sysCallUri; callBundled = "ring1.wav"; }
      else if (ct === "custom" && custCallUri) { callSound = custCallUri; callBundled = "ring1.wav"; }

      if (mt === "chime")      msgBundled = "chime.wav";
      else if (mt === "pop")   msgBundled = "pop.wav";
      else if (mt === "silent") msgBundled = null;
    } catch {}

    // Guardar configuración para CallNotificationService.kt y CallRejectReceiver.kt
    try {
      if (FileSystem.documentDirectory) {
        await FileSystem.writeAsStringAsync(
          FileSystem.documentDirectory + "native_config.json",
          JSON.stringify({ apiUrl: API_URL, callSound }),
        );
      }
    } catch {}

    // Sólo gestionamos el canal de MENSAJES desde el lado JS/Expo.
    // El canal "llamadas" es gestionado EXCLUSIVAMENTE por CallNotificationService.kt
    // para garantizar que use USAGE_NOTIFICATION_RINGTONE y el tono correcto.
    await Notifications.deleteNotificationChannelAsync("mensajes").catch(() => {});
    await Notifications.setNotificationChannelAsync("mensajes", {
      name: "Mensajes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D4FF",
      sound: msgBundled ?? "default",
      enableVibrate: true,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    const r: PushRegResult = { ok: false, reason: "permission_denied", detail: `status=${finalStatus}` };
    await reportToServer(tiendaCodigo, r);
    return r;
  }

  try {
    // Obtener ExponentPushToken (para fallback vía Expo)
    const expoTokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "82653458-4336-45d4-9b1d-a3c6410411ca",
    });
    const token = expoTokenData.data;

    // Obtener raw FCM token (para envío directo desde Firebase Admin SDK)
    let fcmToken: string | undefined;
    if (Platform.OS === "android") {
      try {
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();
        if (deviceTokenData?.data && typeof deviceTokenData.data === "string") {
          fcmToken = deviceTokenData.data;
          console.log("[push] FCM token obtenido ✅");
        }
      } catch (fcmErr) {
        console.warn("[push] No se pudo obtener FCM token:", fcmErr);
      }
    }

    await fetch(`${API_URL}/push-token/${encodeURIComponent(tiendaCodigo)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fcmToken }),
    });

    await reportToServer(tiendaCodigo, { ok: true, token });
    return { ok: true, token };
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    const r: PushRegResult = { ok: false, reason: "token_error", detail };
    await reportToServer(tiendaCodigo, r);
    return r;
  }
}

export async function openNotificationSettings() {
  await Linking.openSettings();
}
