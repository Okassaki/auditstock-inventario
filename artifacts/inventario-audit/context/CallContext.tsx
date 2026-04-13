/**
 * CallContext — máquina de estados para llamadas de audio/video.
 * Usa WebRTC nativo (sin Jitsi, sin WebView).
 * Señalización via WebSocket + HTTP fallback.
 */
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
import {
  initCallerWebRTC,
  initCalleeWebRTC,
  callerPollForAnswer,
  setOfferId,
  hangupWebRTC,
  setMicMuted,
  setSpeakerOn,
  stopRingback,
  flipCamera as webrtcFlipCamera,
  type WebRTCStreams,
} from "@/utils/webrtcManager";
import { registerWsHandler } from "@/utils/chatSocket";

export type CallType = "audio" | "video";
export type CallState = "idle" | "outgoing" | "incoming" | "active";

export interface IncomingCallInfo {
  from: string;
  fromName: string;
  type: CallType;
  roomId: string;
  offerId?: string;
  sdpOffer?: string;
}

export interface ActiveCallInfo {
  peerId: string;
  peerName: string;
  type: CallType;
  roomId: string;
  offerId?: string;
}

interface CallContextValue {
  callState: CallState;
  incomingCall: IncomingCallInfo | null;
  activeCall: ActiveCallInfo | null;
  webrtcStreams: WebRTCStreams;
  isMuted: boolean;
  isSpeaker: boolean;
  initiateCall: (peerId: string, peerName: string, type: CallType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  flipCamera: () => void;
  triggerIncomingCallFromNotification: (info: IncomingCallInfo) => void;
}

const CallContext = createContext<CallContextValue>({
  callState: "idle",
  incomingCall: null,
  activeCall: null,
  webrtcStreams: { local: null, remote: null },
  isMuted: false,
  isSpeaker: false,
  initiateCall: () => {},
  acceptCall: () => {},
  rejectCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  toggleSpeaker: () => {},
  flipCamera: () => {},
  triggerIncomingCallFromNotification: () => {},
});

const INCOMING_POLL_MS = 1500;

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
  const myName = bossAuthenticated
    ? "Jefe"
    : (storeConfig?.nombre ?? myCode ?? "");

  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [webrtcStreams, setWebrtcStreams] = useState<WebRTCStreams>({
    local: null,
    remote: null,
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrateInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;
  // Guarda el offerId tan pronto llega del servidor (antes de que el state se actualice)
  const outgoingOfferIdRef = useRef<string | null>(null);

  // ── Ringtone / vibración ──────────────────────────────────────────────────────

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
      vibrateInterval.current = setInterval(
        () => Vibration.vibrate([0, 500, 200, 500]),
        1200
      );
    }
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────────

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollIncoming = useCallback(() => {
    clearPoll();
    const tick = async () => {
      if (callStateRef.current !== "idle" || !myCode) return;
      try {
        const data = await apiGet(`/calls/incoming/${myCode}`);
        if (data && typeof data === "object") {
          const offer = data as {
            offerId?: string;
            from?: string;
            fromName?: string;
            callType?: string;
            roomId?: string;
            sdpOffer?: string;
          };
          if (offer.offerId && offer.from && offer.roomId) {
            setIncomingCall({
              from: offer.from,
              fromName: offer.fromName ?? offer.from,
              type: (offer.callType as CallType) ?? "audio",
              roomId: offer.roomId,
              offerId: offer.offerId,
              sdpOffer: offer.sdpOffer,
            });
            setCallState("incoming");
            startRinging();
            return;
          }
        }
      } catch {}
      pollTimerRef.current = setTimeout(tick, INCOMING_POLL_MS);
    };
    // Primera comprobación inmediata (detecta llamada pendiente al abrir desde notificación)
    void tick();
  }, [clearPoll, myCode, startRinging]);

  useEffect(() => {
    if (callState === "idle" && myCode) {
      pollIncoming();
    } else {
      clearPoll();
    }
    return clearPoll;
  }, [callState, myCode, pollIncoming, clearPoll]);

  // Al volver al frente, reanudar polling
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && callStateRef.current === "idle" && myCode) {
        pollIncoming();
      }
    });
    return () => sub.remove();
  }, [myCode, pollIncoming]);

  // Mientras suena llamada entrante, detectar si el llamante canceló
  const incomingOfferId = incomingCall?.offerId ?? null;
  useEffect(() => {
    if (callState !== "incoming" || !incomingOfferId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!alive) return;
      try {
        const data = (await apiGet(`/calls/status/${incomingOfferId}`)) as {
          response: string;
        };
        if (data.response === "cancelled" || data.response === "expired") {
          stopRinging();
          setIncomingCall(null);
          setCallState("idle");
          return;
        }
      } catch {}
      if (alive) timer = setTimeout(tick, 2000);
    };

    timer = setTimeout(tick, 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [callState, incomingOfferId, stopRinging]);

  // Escuchar WS "call_cancelled" para dismiss instantáneo sin esperar el poll HTTP
  useEffect(() => {
    const unsub = registerWsHandler((msg) => {
      if (
        msg.type === "call_cancelled" &&
        callStateRef.current === "incoming" &&
        msg.offerId === incomingCall?.offerId
      ) {
        stopRinging();
        setIncomingCall(null);
        setCallState("idle");
      }
    });
    return unsub;
  }, [incomingCall?.offerId, stopRinging]);

  // ── WebRTC callbacks ──────────────────────────────────────────────────────────

  const onStreams = useCallback((streams: WebRTCStreams) => {
    setWebrtcStreams({ ...streams });
  }, []);

  // ── endCall (limpieza central) ────────────────────────────────────────────────

  const endCall = useCallback(() => {
    stopRinging();
    hangupWebRTC();
    outgoingOfferIdRef.current = null;
    setCallState("idle");
    setIncomingCall(null);
    setActiveCall(null);
    setWebrtcStreams({ local: null, remote: null });
    setIsMuted(false);
    setIsSpeaker(false);
  }, [stopRinging]);

  const onRemoteHangup = useCallback(() => {
    endCall();
  }, [endCall]);

  // Cuando la llamada pasa a activa: parar el ringback del caller y sincronizar altavoz
  const prevCallState = useRef<CallState>("idle");
  useEffect(() => {
    if (callState === "active" && prevCallState.current === "outgoing") {
      // El caller ya no escucha "ring ring" — la llamada se contestó
      stopRingback();
      // Inicializar botón de altavoz según tipo de llamada
      setIsSpeaker(activeCall?.type === "video");
    }
    prevCallState.current = callState;
  }, [callState, activeCall?.type]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((prev) => {
      const next = !prev;
      setSpeakerOn(next);
      return next;
    });
  }, []);

  const doFlipCamera = useCallback(() => {
    webrtcFlipCamera().catch(() => {});
  }, []);

  // ── Acciones públicas ─────────────────────────────────────────────────────────

  const initiateCall = useCallback(
    (peerId: string, peerName: string, type: CallType) => {
      if (callState !== "idle" || !myCode) return;
      const roomId = `${Date.now()}`;

      setActiveCall({ peerId, peerName, type, roomId });
      setCallState("outgoing");

      void (async () => {
        try {
          // 1. Capturar micrófono/cámara + crear SDP offer (sin offerId todavía)
          const sdpOffer = await initCallerWebRTC({
            myCode,
            peerId,
            callType: type,
            onStreams,
            onRemoteHangup,
          });

          // 2. Enviar call offer + SDP al servidor → obtener offerId
          const res = (await apiPost("/calls/offer", {
            from: myCode,
            fromName: myName,
            to: peerId,
            callType: type,
            roomId,
            sdpOffer,
          })) as { offerId?: string };

          if (!res.offerId) {
            endCall();
            return;
          }

          const offerId = res.offerId;

          // 3. Guardar en ref INMEDIATAMENTE (antes de esperar el setState)
          //    Esto evita la race condition si el usuario cancela enseguida.
          outgoingOfferIdRef.current = offerId;

          // 4. Actualizar offerId en webrtcManager (flush ICE buffereados)
          setOfferId(offerId);

          // 5. Actualizar estado
          setActiveCall((prev) => (prev ? { ...prev, offerId } : prev));

          // 5. Esperar que el destinatario acepte (poll cada 2s)
          let pollActive = true;
          const pollOutgoing = async () => {
            while (pollActive && callStateRef.current === "outgoing") {
              await new Promise((r) => setTimeout(r, 2000));
              if (!pollActive || callStateRef.current !== "outgoing") break;
              try {
                const status = (await apiGet(`/calls/status/${offerId}`)) as {
                  response: string;
                };
                if (status.response === "accepted") {
                  setCallState("active");
                  // Buscar SDP answer del callee (WS ya lo intentó, HTTP como fallback)
                  void callerPollForAnswer(offerId);
                  break;
                }
                if (
                  status.response === "rejected" ||
                  status.response === "expired" ||
                  status.response === "cancelled"
                ) {
                  endCall();
                  break;
                }
              } catch {}
            }
          };

          void pollOutgoing();

          // Limpiar poll al salir de outgoing (hangup)
          const checkStopped = setInterval(() => {
            if (callStateRef.current !== "outgoing") {
              pollActive = false;
              clearInterval(checkStopped);
            }
          }, 500);
        } catch (err) {
          console.warn("[call] Error iniciando llamada:", err);
          endCall();
        }
      })();
    },
    [callState, myCode, myName, onStreams, onRemoteHangup, endCall]
  );

  const acceptCall = useCallback(() => {
    if (!incomingCall || !myCode) return;
    stopRinging();

    const snapshot = { ...incomingCall };
    setIncomingCall(null);
    setCallState("active");
    setActiveCall({
      peerId: snapshot.from,
      peerName: snapshot.fromName,
      type: snapshot.type,
      roomId: snapshot.roomId,
      offerId: snapshot.offerId,
    });

    if (snapshot.offerId) {
      apiPost("/calls/respond", {
        offerId: snapshot.offerId,
        response: "accepted",
      }).catch(() => {});
    }

    void (async () => {
      try {
        let sdpOffer = snapshot.sdpOffer;

        // Si el SDP no llegó en el push/poll, buscarlo en el servidor
        // El endpoint /calls/signal/:offerId lo devuelve siempre (incluso después de aceptar)
        if (!sdpOffer && snapshot.offerId) {
          for (let i = 0; i < 6; i++) {
            try {
              const sig = (await fetch(
                `${API_URL}/calls/signal/${snapshot.offerId}`
              ).then((r) => r.json())) as { sdpOffer?: string } | null;
              if (sig?.sdpOffer) {
                sdpOffer = sig.sdpOffer;
                break;
              }
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        if (!sdpOffer || !snapshot.offerId) {
          console.warn("[call] SDP offer no disponible, cancelando");
          endCall();
          return;
        }

        await initCalleeWebRTC({
          myCode,
          peerId: snapshot.from,
          offerId: snapshot.offerId,
          callType: snapshot.type,
          sdpOffer,
          onStreams,
          onRemoteHangup,
        });
      } catch (err) {
        console.warn("[call] Error aceptando llamada:", err);
        endCall();
      }
    })();
  }, [incomingCall, myCode, onStreams, onRemoteHangup, stopRinging, endCall]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    stopRinging();
    if (incomingCall.offerId) {
      apiPost("/calls/respond", {
        offerId: incomingCall.offerId,
        response: "rejected",
      }).catch(() => {});
    }
    setIncomingCall(null);
    setCallState("idle");
  }, [incomingCall, stopRinging]);

  const endCallWithSignal = useCallback(() => {
    // Usa ref para evitar race condition: el offerId puede llegar antes de que el
    // estado se actualice, pero el ref se escribe de forma síncrona al recibirlo.
    if (callStateRef.current === "outgoing" && outgoingOfferIdRef.current) {
      apiPost(`/calls/cancel/${outgoingOfferIdRef.current}`, {}).catch(() => {});
    }
    outgoingOfferIdRef.current = null;
    endCall();
  }, [endCall]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setMicMuted(next);
      return next;
    });
  }, []);

  const triggerIncomingCallFromNotification = useCallback(
    (info: IncomingCallInfo) => {
      setCallState((prev) => {
        if (prev !== "idle") return prev;
        setIncomingCall(info);
        startRinging();
        return "incoming";
      });
    },
    [startRinging]
  );

  return (
    <CallContext.Provider
      value={{
        callState,
        incomingCall,
        activeCall,
        webrtcStreams,
        isMuted,
        isSpeaker,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall: endCallWithSignal,
        toggleMute,
        toggleSpeaker,
        flipCamera: doFlipCamera,
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
