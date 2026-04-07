import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function registerForPushNotificationsAsync(tiendaCodigo: string): Promise<void> {
  if (!Device.isDevice) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("mensajes", {
      name: "Mensajes",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D4FF",
      sound: "default",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: "82653458-4336-45d4-9b1d-a3c6410411ca",
  });

  const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;
  await fetch(`${API_BASE}/push-token/${encodeURIComponent(tiendaCodigo)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
