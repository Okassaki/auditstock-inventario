import { WebSocketServer, WebSocket } from "ws";
import type { Logger } from "pino";
import { db, pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const clients = new Map<string, WebSocket>();

async function sendCallPushNotification(
  to: string,
  msg: Record<string, unknown>,
  logger: Logger,
) {
  try {
    const rows = await db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.tiendaCodigo, to));
    if (rows.length === 0) {
      logger.warn({ to }, "call push: no token for recipient");
      return;
    }
    const token = rows[0].token;
    const fromName = (msg.fromName ?? msg.from) as string;
    const callType = (msg.callType ?? "audio") as string;
    const payload = [
      {
        to: token,
        title: `📞 Llamada entrante de ${fromName}`,
        body: callType === "video" ? "📹 Videollamada — toca para responder" : "Toca para responder",
        sound: "default",
        channelId: "llamadas",
        priority: "high",
        data: {
          type: "call_offer",
          from: msg.from,
          fromName: msg.fromName ?? msg.from,
          callType: msg.callType ?? "audio",
          roomId: msg.roomId,
        },
      },
    ];
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    logger.info({ to, token, status: resp.status, body }, "call push notification sent");
  } catch (e) {
    logger.error({ e }, "failed to send call push notification");
  }
}

export function setupSignaling(wss: WebSocketServer, logger: Logger) {
  wss.on("connection", (ws) => {
    let myCode: string | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "register") {
          myCode = String(msg.codigo);
          clients.set(myCode, ws);
          logger.info({ codigo: myCode }, "WS client registered");
          return;
        }

        const to = msg.to as string | undefined;
        if (!to) return;

        // Forward via WebSocket if recipient is connected
        const target = clients.get(to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(msg));
          logger.info({ type: msg.type, from: myCode, to }, "WS message forwarded");
        }

        // For call offers: also send push notification as fallback
        if (msg.type === "call_offer") {
          sendCallPushNotification(to, msg as Record<string, unknown>, logger);
        }
      } catch (e) {
        logger.error({ e }, "WS message error");
      }
    });

    ws.on("close", () => {
      if (myCode) {
        clients.delete(myCode);
        logger.info({ codigo: myCode }, "WS client disconnected");
      }
    });
  });
}
