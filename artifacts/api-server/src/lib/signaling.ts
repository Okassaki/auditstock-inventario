import { WebSocketServer, WebSocket } from "ws";
import type { Logger } from "pino";

const clients = new Map<string, WebSocket>();

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
        const target = clients.get(to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(msg));
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
