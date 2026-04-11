import { DeviceEventEmitter } from "react-native";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://439c42d1-136d-446b-bfa8-78b46cf7a994-00-3pt3107uvwsb4.janeway.replit.dev";

const WS_URL = API_BASE.replace(/^https?:\/\//, (m) =>
  m.startsWith("https") ? "wss://" : "ws://"
) + "/ws";

let socket: WebSocket | null = null;
let codigoActual: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1500;
let intentional = false;

function connect(codigo: string) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    reconnectDelay = 1500;
    socket!.send(JSON.stringify({ type: "register", codigo }));
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "new_message") {
        DeviceEventEmitter.emit("chatNewMessage", msg);
      }
    } catch {}
  };

  socket.onclose = () => {
    socket = null;
    if (!intentional && codigoActual) {
      reconnectTimer = setTimeout(() => {
        if (codigoActual) connect(codigoActual);
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
    }
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function connectChatSocket(codigo: string) {
  intentional = false;
  codigoActual = codigo;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  connect(codigo);
}

export function disconnectChatSocket() {
  intentional = true;
  codigoActual = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socket?.close();
  socket = null;
}
