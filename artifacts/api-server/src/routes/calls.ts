import { Router } from "express";
import { randomUUID } from "crypto";
import { db, pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fcmReady, sendFcmDataMessage, sendFcmNotification } from "../lib/fcm";

const router = Router();

export interface CallOffer {
  offerId: string;
  from: string;
  fromName: string;
  to: string;
  callType: "audio" | "video";
  roomId: string;
  createdAt: number;
  response?: "accepted" | "rejected" | "cancelled";
}

const offers = new Map<string, CallOffer>();
const OFFER_TTL_MS = 90_000;

setInterval(() => {
  const now = Date.now();
  for (const [id, o] of offers) {
    if (now - o.createdAt > OFFER_TTL_MS) offers.delete(id);
  }
}, 30_000);

async function notifyCallPush(offer: CallOffer) {
  try {
    const rows = await db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.tiendaCodigo, offer.to));
    if (rows.length === 0) {
      console.log("[push-call] No hay token para", offer.to);
      return;
    }
    const row = rows[0];
    const callTitle = `📞 Llamada entrante de ${offer.fromName}`;
    const callBody = offer.callType === "video"
      ? "📹 Videollamada — toca para responder"
      : "Toca para responder";
    const callData: Record<string, string> = {
      type: "call_offer",
      caller: offer.from,
      fromName: offer.fromName,
      callType: offer.callType,
      roomId: offer.roomId,
      offerId: offer.offerId,
    };

    if (row.fcmToken && fcmReady()) {
      console.log("[push-call] Enviando via FCM data-only a", offer.to);
      // Data-only: nuestro CallNotificationService.kt intercepta y muestra
      // la notificación estilo WhatsApp con fullScreenIntent + botones RECHAZAR/RESPONDER
      const result = await sendFcmDataMessage({
        fcmToken: row.fcmToken,
        priority: "high",
        ttlSeconds: 30,
        data: callData,
      });
      if (!result.success) {
        console.error("[push-call] FCM error:", result.error);
        if (result.error?.includes("registration-token-not-registered") || result.error?.includes("invalid-registration-token")) {
          await db.update(pushTokensTable)
            .set({ fcmToken: null })
            .where(eq(pushTokensTable.tiendaCodigo, offer.to))
            .catch(() => {});
        }
      }
    } else {
      console.log("[push-call] Enviando via Expo push a", offer.to, "(sin fcmToken o FCM no listo)");
      const token = row.token;
      console.log("[push-call] token:", token.slice(0, 30) + "...");
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify([
          {
            to: token,
            title: callTitle,
            body: callBody,
            sound: "default",
            channelId: "llamadas",
            priority: "high",
            ttl: 30,
            data: callData,
          },
        ]),
      });
      const body = await resp.json().catch(() => ({})) as { data?: Array<{ status: string; message?: string; details?: unknown }> };
      console.log("[push-call] Expo resp:", resp.status, JSON.stringify(body?.data ?? body));
    }
  } catch (e) {
    console.error("[push-call] Error:", e);
  }
}

// Caller: inicia llamada
router.post("/calls/offer", async (req, res) => {
  const { from, fromName, to, callType, roomId } = req.body as Partial<CallOffer>;
  if (!from || !to || !roomId) {
    res.status(400).json({ error: "Faltan campos: from, to, roomId" });
    return;
  }
  const offer: CallOffer = {
    offerId: randomUUID(),
    from,
    fromName: fromName ?? from,
    to,
    callType: callType ?? "audio",
    roomId,
    createdAt: Date.now(),
  };
  offers.set(offer.offerId, offer);
  notifyCallPush(offer).catch(() => {});
  res.json({ ok: true, offerId: offer.offerId });
});

// Caller: cancela antes de que conteste
router.post("/calls/cancel/:offerId", (req, res) => {
  const offer = offers.get(req.params.offerId);
  if (offer && !offer.response) offer.response = "cancelled";
  res.json({ ok: true });
});

// Caller: poll para ver si ya respondieron
router.get("/calls/status/:offerId", (req, res) => {
  const offer = offers.get(req.params.offerId);
  if (!offer) { res.json({ response: "expired" }); return; }
  const expired = Date.now() - offer.createdAt > OFFER_TTL_MS;
  res.json({ response: expired ? "expired" : (offer.response ?? "pending") });
});

// Recipient: poll para llamadas entrantes pendientes (fallback)
router.get("/calls/incoming/:code", (req, res) => {
  const now = Date.now();
  for (const o of offers.values()) {
    if (
      o.to === req.params.code &&
      !o.response &&
      now - o.createdAt < OFFER_TTL_MS
    ) {
      res.json(o);
      return;
    }
  }
  res.json(null);
});

// Recipient: acepta o rechaza
router.post("/calls/respond", (req, res) => {
  const { offerId, response } = req.body as { offerId: string; response: "accepted" | "rejected" };
  const offer = offers.get(offerId);
  if (!offer) { res.status(404).json({ error: "Llamada no encontrada o expirada" }); return; }
  if (!offer.response) offer.response = response;
  res.json({ ok: true });
});

export default router;
