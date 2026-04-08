import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform, Vibration } from "react-native";
import { playCallRingtone, stopRingtone } from "@/utils/ringtone";
import { useBossConfig } from "./BossConfigContext";
import { useStoreConfig } from "./StoreConfigContext";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  "https://439c42d1-136d-446b-bfa8-78b46cf7a994-00-3pt3107uvwsb4.janeway.replit.dev";

const WS_URL = API_BASE.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws";
const JITSI_SERVER = "https://meet.jit.si";

export type CallType = "audio" | "video";
export type CallState = "idle" | "outgoing" | "incoming" | "active";

export interface ActiveCallInfo {
  peerId: string;
  peerName: string;
  type: CallType;
  roomId: string;
  jitsiUrl: string;
}

export interface IncomingCallInfo {
  from: string;
  fromName: string;
  type: CallType;
  roomId: string;
}

interface CallContextValue {
  callState: CallState;
  incomingCall: IncomingCallInfo | null;
  activeCall: ActiveCallInfo | null;
  initiateCall: (peerId: string, peerName: string, type: CallType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  triggerIncomingCallFromNotification: (info: IncomingCallInfo) => void;
}

const CallContext = createContext<CallContextValue>({
  callState: "idle",
  incomingCall: null,
  activeCall: null,
  initiateCall: () => {},
  acceptCall: () => {},
  rejectCall: () => {},
  endCall: () => {},
  triggerIncomingCallFromNotification: () => {},
});

function buildJitsiUrl(roomId: string, type: CallType, displayName: string): string {
  const room = `AuditStk${roomId}`;
  const params = [
    "config.prejoinPageEnabled=false",
    `config.startWithVideoMuted=${type === "audio" ? "true" : "false"}`,
    "config.startWithAudioMuted=false",
    "config.disableDeepLinking=true",
    "config.disableInviteFunctions=true",
    "config.toolbarButtons=[\"microphone\",\"camera\",\"hangup\",\"tileview\"]",
    `userInfo.displayName="${encodeURIComponent(displayName)}"`,
  ].join("&");
  return `${JITSI_SERVER}/${room}#${params}`;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { storeConfig } = useStoreConfig();
  const { bossAuthenticated } = useBossConfig();

  const myCode = bossAuthenticated ? "JEFE" : (storeConfig?.codigo ?? null);
  const myName = bossAuthenticated ? "Jefe" : (storeConfig?.nombre ?? myCode ?? "");

  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRinging = useCallback(() => {
    stopRingtone().catch(() => {});
    if (vibrateInterval.current) {
      clearInterval(vibrateInterval.current);
      vibrateInterval.current = null;
    }
    Vibration.cancel();
  }, []);

  const startRinging = useCallback(() => {
    playCallRingtone().catch(() => {});
    if (Platform.OS === "android") {
      vibrateInterval.current = setInterval(() => Vibration.vibrate([0, 500, 200, 500]), 1200);
    }
  }, []);

  const sendWS = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const endCall = useCallback(() => {
    stopRinging();
    setCallState("idle");
    setIncomingCall(null);
    setActiveCall(null);
  }, [stopRinging]);

  const connect = useCallback(() => {
    if (!myCode) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "register", codigo: myCode }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === "call_offer") {
            const info: IncomingCallInfo = {
              from: msg.from,
              fromName: msg.fromName ?? msg.from,
              type: msg.callType ?? "audio",
              roomId: msg.roomId,
            };
            setIncomingCall(info);
            setCallState("incoming");
            startRinging();
          } else if (msg.type === "call_accepted") {
            setCallState((prev) => (prev === "outgoing" ? "active" : prev));
          } else if (msg.type === "call_rejected") {
            endCall();
          } else if (msg.type === "call_ended") {
            endCall();
          }
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(() => connect(), 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {}
  }, [myCode, startRinging, endCall]);

  useEffect(() => {
    connect();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
    });
    return () => {
      sub.remove();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const initiateCall = useCallback(
    (peerId: string, peerName: string, type: CallType) => {
      if (callState !== "idle" || !myCode) return;
      const roomId = `${Date.now()}`;
      const jitsiUrl = buildJitsiUrl(roomId, type, myName);
      setActiveCall({ peerId, peerName, type, roomId, jitsiUrl });
      setCallState("outgoing");
      sendWS({
        type: "call_offer",
        to: peerId,
        from: myCode,
        fromName: myName,
        callType: type,
        roomId,
      });
    },
    [callState, myCode, myName, sendWS]
  );

  const acceptCall = useCallback(() => {
    if (!incomingCall || !myCode) return;
    stopRinging();
    const jitsiUrl = buildJitsiUrl(incomingCall.roomId, incomingCall.type, myName);
    sendWS({ type: "call_accepted", to: incomingCall.from, from: myCode, roomId: incomingCall.roomId });
    setActiveCall({
      peerId: incomingCall.from,
      peerName: incomingCall.fromName,
      type: incomingCall.type,
      roomId: incomingCall.roomId,
      jitsiUrl,
    });
    setIncomingCall(null);
    setCallState("active");
  }, [incomingCall, myCode, myName, sendWS, stopRinging]);

  const rejectCall = useCallback(() => {
    if (!incomingCall || !myCode) return;
    stopRinging();
    sendWS({ type: "call_rejected", to: incomingCall.from, from: myCode });
    setIncomingCall(null);
    setCallState("idle");
  }, [incomingCall, myCode, sendWS, stopRinging]);

  const endCallWithSignal = useCallback(() => {
    if (activeCall && myCode) {
      sendWS({ type: "call_ended", to: activeCall.peerId, from: myCode });
    }
    endCall();
  }, [activeCall, myCode, sendWS, endCall]);

  // Llamada iniciada desde push notification (app en background)
  const triggerIncomingCallFromNotification = useCallback(
    (info: IncomingCallInfo) => {
      setCallState((prev) => {
        if (prev !== "idle") return prev;
        setIncomingCall(info);
        startRinging();
        return "incoming";
      });
    },
    [startRinging],
  );

  return (
    <CallContext.Provider
      value={{
        callState,
        incomingCall,
        activeCall,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall: endCallWithSignal,
        triggerIncomingCallFromNotification,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
