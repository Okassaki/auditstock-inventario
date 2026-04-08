import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_URL } from "./api";

export async function registerForPushNotificationsAsync(tiendaCodigo: string): Promise<void> {
  if (!Device.isDevice) return;

  if (Platform.OS === "android") {
    // Canal para mensajes
    await Notifications.setNotificationChannelAsync("mensajes", {
      name: "Mensajes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D4FF",
      sound: "default",
      enableVibrate: true,
    });
    // Canal para llamadas
    await Notifications.setNotificationChannelAsync("llamadas", {
      name: "Llamadas",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#8B5CF6",
      sound: "default",
      enableVibrate: true,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: "82653458-4336-45d4-9b1d-a3c6410411ca",
  });
  const token = tokenData.data;

  await fetch(`${API_URL}/push-token/${encodeURIComponent(tiendaCodigo)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
