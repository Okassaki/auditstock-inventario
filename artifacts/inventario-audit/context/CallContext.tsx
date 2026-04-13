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
import { API_URL } from "@/utils/api";

export type CallType = "audio" | "video";
export type CallState = "idle" | "outgoing" | "incoming" | "active";

export interface IncomingCallInfo {
  from: string;
  fromName: string;
  type: CallType;
  roomId: string;
  offerId?: string;
}

export interface ActiveCallInfo {
  peerId: string;
  peerName: string;
  type: CallType;
  roomId: string;
  jitsiUrl: string;
  offerId?: string;
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

const JITSI_SERVER = "https://meet.jit.si";
const OUTGOING_POLL_MS = 2000;
const INCOMING_POLL_MS = 3000;

function buildJitsiUrl(roomId: string, type: CallType, displayName: string): string {
  const room = `AuditStk${roomId}`;
  const params = [
    "config.prejoinPageEnabled=false",
    "config.prejoinConfig.enabled=false",
    `config.startWithVideoMuted=${type === "audio" ? "true" : "false"}`,
    "config.startWithAudioMuted=false",
    "config.disableDeepLinking=true",
    "config.disableInviteFunctions=true",
    "config.disableLobby=true",
    "config.enableLobbyChat=false",
    "config.lobby.enabled=false",
    "config.requireDisplayName=false",
    "config.enableNoAudioDetection=false",
    "config.toolbarButtons=[\"microphone\",\"camera\",\"hangup\",\"tileview\"]",
    `userInfo.displayName="${encodeURIComponent(displayName)}"`,
  ].join("&");
  return `${JITSI_SERVER}/${room}#${params}`;
}

async function apiPost(path: string, body: object): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`);
  return res.json();
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { storeConfig } = useStoreConfig();
  const { bossAuthenticated } = useBossConfig();

  const myCode = bossAuthenticated ? "JEFE" : (storeConfig?.codigo ?? null);
  const myName = bossAuthenticated ? "Jefe" : (storeConfig?.nombre ?? myCode ?? "");

  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);

  const outgoingOfferIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrateInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;

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

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Polling para llamadas salientes: espera confirmación del destinatario
  const pollOutgoing = useCallback(
    (offerId: string) => {
      clearPoll();
      const tick = async () => {
        if (callStateRef.current !== "outgoing") return;
        try {
          const data = (await apiGet(`/calls/status/${offerId}`)) as { response: string };
          if (data.response === "accepted") {
            const offer = outgoingOfferIdRef.current;
            if (!offer) return;
            setCallState("active");
            return;
          }
          if (data.response === "rejected" || data.response === "expired" || data.response === "cancelled") {
            stopRingtone().catch(() => {});
            setCallState("idle");
            setActiveCall(null);
            return;
          }
        } catch {}
        pollTimerRef.current = setTimeout(tick, OUTGOING_POLL_MS);
      };
      pollTimerRef.current = setTimeout(tick, OUTGOING_POLL_MS);
    },
    [clearPoll],
  );

  // Polling para llamadas entrantes: fallback si el push no llegó
  const pollIncoming = useCallback(() => {
    clearPoll();
    const tick = async () => {
      if (callStateRef.current !== "idle" || !myCode) return;
      try {
        const data = await apiGet(`/calls/incoming/${myCode}`);
        if (data && typeof data === "object") {
          const offer = data as { offerId?: string; from?: string; fromName?: string; callType?: string; roomId?: string };
          if (offer.offerId && offer.from && offer.roomId) {
            setIncomingCall({
              from: offer.from,
              fromName: offer.fromName ?? offer.from,
              type: (offer.callType as CallType) ?? "audio",
              roomId: offer.roomId,
              offerId: offer.offerId,
            });
            setCallState("incoming");
            startRinging();
            return;
          }
        }
      } catch {}
      pollTimerRef.current = setTimeout(tick, INCOMING_POLL_MS);
    };
    pollTimerRef.current = setTimeout(tick, INCOMING_POLL_MS);
  }, [clearPoll, myCode, startRinging]);

  // Inicia el polling según el estado
  useEffect(() => {
    if (callState === "idle" && myCode) {
      pollIncoming();
    } else if (callState === "outgoing" && outgoingOfferIdRef.current) {
      pollOutgoing(outgoingOfferIdRef.current);
    } else {
      clearPoll();
    }
    return clearPoll;
  }, [callState, myCode, pollIncoming, pollOutgoing, clearPoll]);

  // Cuando hay una llamada entrante (sonando), monitorear si el llamante canceló.
  // Si el offer pasa a "cancelled" o "expired" → dejar de sonar automáticamente.
  const incomingOfferId = incomingCall?.offerId ?? null;
  useEffect(() => {
    if (callState !== "incoming" || !incomingOfferId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      try {
        const data = (await apiGet(`/calls/status/${incomingOfferId}`)) as { response: string };
        if (data.response === "cancelled" || data.response === "expired") {
          stopRinging();
          setIncomingCall(null);
          setCallState("idle");
          return;
        }
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 2000);
    };

    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [callState, incomingOfferId, stopRinging]);

  // Reanudar polling al volver al frente
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && callStateRef.current === "idle" && myCode) {
        pollIncoming();
      }
    });
    return () => sub.remove();
  }, [myCode, pollIncoming]);

  const endCall = useCallback(() => {
    stopRinging();
    setCallState("idle");
    setIncomingCall(null);
    setActiveCall(null);
    outgoingOfferIdRef.current = null;
  }, [stopRinging]);

  const initiateCall = useCallback(
    (peerId: string, peerName: string, type: CallType) => {
      if (callState !== "idle" || !myCode) return;
      const roomId = `${Date.now()}`;
      const jitsiUrl = buildJitsiUrl(roomId, type, myName);
      setActiveCall({ peerId, peerName, type, roomId, jitsiUrl });
      setCallState("outgoing");
      apiPost("/calls/offer", {
        from: myCode,
        fromName: myName,
        to: peerId,
        callType: type,
        roomId,
      })
        .then((res) => {
          const r = res as { offerId?: string };
          if (r.offerId) {
            outgoingOfferIdRef.current = r.offerId;
            pollOutgoing(r.offerId);
          }
        })
        .catch(() => {});
    },
    [callState, myCode, myName, pollOutgoing],
  );

  const acceptCall = useCallback(() => {
    if (!incomingCall || !myCode) return;
    stopRinging();
    const jitsiUrl = buildJitsiUrl(incomingCall.roomId, incomingCall.type, myName);
    setActiveCall({
      peerId: incomingCall.from,
      peerName: incomingCall.fromName,
      type: incomingCall.type,
      roomId: incomingCall.roomId,
      jitsiUrl,
    });
    setIncomingCall(null);
    setCallState("active");
    if (incomingCall.offerId) {
      apiPost("/calls/respond", { offerId: incomingCall.offerId, response: "accepted" }).catch(() => {});
    }
  }, [incomingCall, myCode, myName, stopRinging]);

  const rejectCall = useCallback(() => {
    if (!incomingCall || !myCode) return;
    stopRinging();
    if (incomingCall.offerId) {
      apiPost("/calls/respond", { offerId: incomingCall.offerId, response: "rejected" }).catch(() => {});
    }
    setIncomingCall(null);
    setCallState("idle");
  }, [incomingCall, myCode, stopRinging]);

  const endCallWithSignal = useCallback(() => {
    if (callState === "outgoing" && outgoingOfferIdRef.current) {
      apiPost(`/calls/cancel/${outgoingOfferIdRef.current}`, {}).catch(() => {});
    }
    endCall();
  }, [callState, endCall]);

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
