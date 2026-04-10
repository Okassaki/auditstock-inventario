import admin from "firebase-admin";

let initialized = false;

function initFirebase() {
  if (initialized) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON no configurado — FCM directo deshabilitado");
    return;
  }
  try {
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log("[fcm] Firebase Admin inicializado ✅");
  } catch (e) {
    console.error("[fcm] Error inicializando Firebase Admin:", e);
  }
}

initFirebase();

export function fcmReady() {
  return initialized;
}

export async function sendFcmNotification(options: {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
  priority?: "high" | "normal";
  ttlSeconds?: number;
}): Promise<{ success: boolean; error?: string }> {
  if (!initialized) {
    return { success: false, error: "Firebase no inicializado" };
  }
  try {
    const msg: admin.messaging.Message = {
      token: options.fcmToken,
      notification: {
        title: options.title,
        body: options.body,
      },
      data: options.data ?? {},
      android: {
        priority: options.priority === "high" ? "high" : "normal",
        ttl: (options.ttlSeconds ?? 86400) * 1000,
        notification: {
          channelId: options.channelId ?? "mensajes",
          sound: "default",
        },
      },
    };
    const response = await admin.messaging().send(msg);
    console.log("[fcm] Enviado OK:", response);
    return { success: true };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error("[fcm] Error enviando:", err?.code, err?.message);
    return { success: false, error: err?.message ?? String(e) };
  }
}
