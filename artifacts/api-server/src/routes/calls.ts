import { Router } from "express";
import { randomUUID } from "crypto";
import { db, pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fcmReady, sendFcmDataMessage } from "../lib/fcm";
import { sendToCode } from "../lib/signaling";

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
  sdpOffer?: string;
}

interface WebRTCSignal {
  sdpOffer?: string;   // SDP del caller (para que el callee lo busque al aceptar)
  sdpAnswer?: string;  // SDP del callee (para que el caller lo busque)
  callerIce: string[]; // ICE candidates del caller
  calleeIce: string[]; // ICE candidates del callee
}

const offers = new Map<string, CallOffer>();
const signals = new Map<string, WebRTCSignal>();
const OFFER_TTL_MS = 90_000;

setInterval(() => {
  const now = Date.now();
  for (const [id, o] of offers) {
    if (now - o.createdAt > OFFER_TTL_MS) {
      offers.delete(id);
      signals.delete(id);
    }
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

    const isVideo = offer.callType === "video";
    const callTitle = isVideo
      ? `📹 Videollamada de ${offer.fromName}`
      : `📞 Llamada de ${offer.fromName}`;
    const callBody = isVideo
      ? "Toca para responder la videollamada"
      : "Toca para responder";

    // SDP NO va en el push (excede el límite de 4KB).
    // El callee lo recupera via GET /calls/signal/:offerId al aceptar.
    const callData: Record<string, string> = {
      type: "call_offer",
      caller: offer.from,
      fromName: offer.fromName,
      callType: offer.callType,
      roomId: offer.roomId,
      offerId: offer.offerId,
    };

    // ── 1. EXPO PUSH — siempre enviado (garantiza entrega en modo Doze/app cerrada)
    // La notificación Expo usa el canal "llamadas_v2" (IMPORTANCE_MAX + tono nativo).
    // Esto es lo que suena cuando el teléfono está en reposo o la app está cerrada.
    if (row.token) {
      console.log("[push-call] Enviando Expo push a", offer.to);
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify([
          {
            to: row.token,
            title: callTitle,
            body: callBody,
            sound: "ring1.wav",  // bundled en la APK vía expo-notifications plugin
            channelId: "llamadas_v2",  // canal nativo con IMPORTANCE_MAX + vibración
            priority: "high",
            ttl: 30,
            data: callData,
          },
        ]),
      });
      const respBody = (await resp.json().catch(() => ({}))) as {
        data?: Array<{ status: string; message?: string }>;
      };
      console.log("[push-call] Expo resp:", resp.status, JSON.stringify(respBody?.data ?? respBody));
    }

    // ── 2. FCM DATA-ONLY — secundario (active CallNotificationService para full-screen
    // intent cuando la app está en background; no funciona en modo Doze/app cerrada).
    if (row.fcmToken && fcmReady()) {
      console.log("[push-call] Enviando FCM data a", offer.to);
      const result = await sendFcmDataMessage({
        fcmToken: row.fcmToken,
        priority: "high",
        ttlSeconds: 30,
        data: callData,
      });
      if (!result.success) {
        console.error("[push-call] FCM error:", result.error);
        if (
          result.error?.includes("registration-token-not-registered") ||
          result.error?.includes("invalid-registration-token")
        ) {
          await db
            .update(pushTokensTable)
            .set({ fcmToken: null })
            .where(eq(pushTokensTable.tiendaCodigo, offer.to))
            .catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error("[push-call] Error:", e);
  }
}

// ── Call lifecycle ─────────────────────────────────────────────────────────────

// Caller: inicia llamada (incluye sdpOffer WebRTC)
router.post("/calls/offer", async (req, res) => {
  const { from, fromName, to, callType, roomId, sdpOffer } =
    req.body as Partial<CallOffer>;
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
    sdpOffer,
  };
  offers.set(offer.offerId, offer);

  // Guardar sdpOffer en signals para que el callee lo recupere al aceptar
  if (sdpOffer) {
    signals.set(offer.offerId, { sdpOffer, callerIce: [], calleeIce: [] });
  }

  notifyCallPush(offer).catch(() => {});
  res.json({ ok: true, offerId: offer.offerId });
});

// Caller: cancela antes de que conteste
router.post("/calls/cancel/:offerId", (req, res) => {
  const offer = offers.get(req.params.offerId);
  if (offer && !offer.response) {
    offer.response = "cancelled";
    // Notificar al callee via WS para dismiss instantáneo (no esperar poll)
    sendToCode(offer.to, { type: "call_cancelled", offerId: req.params.offerId });
  }
  res.json({ ok: true });
});

// Caller: poll para ver si ya respondieron
router.get("/calls/status/:offerId", (req, res) => {
  const offer = offers.get(req.params.offerId);
  if (!offer) {
    res.json({ response: "expired" });
    return;
  }
  const expired = Date.now() - offer.createdAt > OFFER_TTL_MS;
  res.json({ response: expired ? "expired" : (offer.response ?? "pending") });
});

// Recipient: poll para llamadas entrantes pendientes (incluye sdpOffer)
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
  const { offerId, response } = req.body as {
    offerId: string;
    response: "accepted" | "rejected";
  };
  const offer = offers.get(offerId);
  if (!offer) {
    res.status(404).json({ error: "Llamada no encontrada o expirada" });
    return;
  }
  if (!offer.response) offer.response = response;
  res.json({ ok: true });
});

// ── WebRTC signaling ───────────────────────────────────────────────────────────

// Almacenar SDP answer o candidatos ICE
router.post("/calls/signal/:offerId", (req, res) => {
  const { role, type, data } = req.body as {
    role: "caller" | "callee";
    type: "answer" | "ice";
    data: string;
  };
  if (!signals.has(req.params.offerId)) {
    signals.set(req.params.offerId, { callerIce: [], calleeIce: [] });
  }
  const sig = signals.get(req.params.offerId)!;
  if (type === "answer") sig.sdpAnswer = data;
  if (type === "ice" && role === "caller") sig.callerIce.push(data);
  if (type === "ice" && role === "callee") sig.calleeIce.push(data);
  res.json({ ok: true });
});

// Obtener señales WebRTC (sdpOffer, sdpAnswer, ICE candidates)
// Callee usa esto para buscar el sdpOffer al aceptar.
// Caller usa esto para buscar el sdpAnswer si el WS falló.
router.get("/calls/signal/:offerId", (req, res) => {
  res.json(
    signals.get(req.params.offerId) ?? { callerIce: [], calleeIce: [] }
  );
});

export default router;
