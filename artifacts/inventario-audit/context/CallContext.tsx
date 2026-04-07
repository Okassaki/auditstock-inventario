import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
  type MediaStream,
} from "react-native-webrtc";
import { useBossConfig } from "./BossConfigContext";
import { useStoreConfig } from "./StoreConfigContext";
import { playCallRingtone, stopRingtone } from "@/utils/ringtone";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  `https://${process.env.EXPO_PUBLIC_DOMAIN as string}`;

const WS_URL = API_BASE.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type CallState = "idle" | "outgoing" | "incoming" | "connected";

export interface CallContextType {
  callState: CallState;
  remoteCode: string | null;
  remoteName: string | null;
  callType: "audio" | "video";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  initiateCall: (to: string, toName: string, type: "audio" | "video") => Promise<void>;
  acceptCall: (type: "audio" | "video") => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
}

const CallContext = createContext<CallContextType>({
  callState: "idle",
  remoteCode: null,
  remoteName: null,
  callType: "audio",
  localStream: null,
  remoteStream: null,
  initiateCall: async () => {},
  acceptCall: async () => {},
  rejectCall: () => {},
  hangup: () => {},
});

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { storeConfig } = useStoreConfig();
  const { bossAuthenticated } = useBossConfig();

  const myCode = bossAuthenticated ? "JEFE" : (storeConfig?.codigo ?? null);
  const myName = bossAuthenticated ? "Jefe" : (storeConfig?.nombre ?? myCode ?? "");

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<RTCIceCandidate[]>([]);
  const remoteDescSetRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteCode, setRemoteCode] = useState<string | null>(null);
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);

  function wsSend(msg: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function cleanupPC() {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    setLocalStream(null);
    setRemoteStream(null);
    setPendingOffer(null);
  }

  const cleanup = useCallback(() => {
    cleanupPC();
    stopRingtone().catch(() => {});
    setCallState("idle");
    setRemoteCode(null);
    setRemoteName(null);
  }, []);

  async function addPendingIce(pc: RTCPeerConnection) {
    for (const c of pendingIceRef.current) {
      try { await (pc as any).addIceCandidate(c); } catch {}
    }
    pendingIceRef.current = [];
  }

  async function handleRemoteICE(candidate: RTCIceCandidateInit) {
    if (!pcRef.current) return;
    const ice = new RTCIceCandidate(candidate);
    if (remoteDescSetRef.current) {
      try { await (pcRef.current as any).addIceCandidate(ice); } catch {}
    } else {
      pendingIceRef.current.push(ice);
    }
  }

  async function handleAnswer(msg: { sdp: RTCSessionDescriptionInit }) {
    if (!pcRef.current) return;
    try {
      await (pcRef.current as any).setRemoteDescription(new RTCSessionDescription(msg.sdp));
      remoteDescSetRef.current = true;
      await addPendingIce(pcRef.current);
      setCallState("connected");
    } catch {}
  }

  const handleSignaling = useCallback((msg: any) => {
    switch (msg.type) {
      case "call-offer":
        setRemoteCode(msg.from);
        setRemoteName(msg.fromName ?? msg.from);
        setCallType(msg.callType ?? "audio");
        setPendingOffer(msg.sdp);
        setCallState("incoming");
        playCallRingtone().catch(() => {});
        break;
      case "call-answer":
        handleAnswer(msg);
        break;
      case "call-reject":
        cleanup();
        break;
      case "call-hangup":
        cleanup();
        break;
      case "ice-candidate":
        handleRemoteICE(msg.candidate);
        break;
    }
  }, [cleanup]);

  const connectWS = useCallback((code: string) => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", codigo: code }));
    };
    ws.onmessage = (e) => {
      try { handleSignaling(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => {
      reconnectTimer.current = setTimeout(() => { if (code) connectWS(code); }, 4000);
    };
    ws.onerror = () => { ws.close(); };
  }, [handleSignaling]);

  useEffect(() => {
    if (!myCode) return;
    connectWS(myCode);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [myCode, connectWS]);

  async function getLocalStream(type: "audio" | "video"): Promise<MediaStream> {
    const constraints: any = {
      audio: true,
      video: type === "video" ? { facingMode: "user", width: 640, height: 480 } : false,
    };
    return await mediaDevices.getUserMedia(constraints) as MediaStream;
  }

  function createPC(stream: MediaStream, toCode: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS } as any);
    pcRef.current = pc;

    stream.getTracks().forEach((t: any) => (pc as any).addTrack(t, stream));

    (pc as any).ontrack = (e: any) => {
      setRemoteStream(e.streams?.[0] ?? null);
    };
    (pc as any).onicecandidate = (e: any) => {
      if (e.candidate) {
        wsSend({ type: "ice-candidate", from: myCode, to: toCode, candidate: e.candidate });
      }
    };

    return pc;
  }

  const initiateCall = useCallback(async (to: string, toName: string, type: "audio" | "video") => {
    if (!myCode || callState !== "idle") return;
    try {
      setRemoteCode(to);
      setRemoteName(toName);
      setCallType(type);
      setCallState("outgoing");

      const stream = await getLocalStream(type);
      setLocalStream(stream);

      const pc = createPC(stream, to);

      const offer = await (pc as any).createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === "video" });
      await (pc as any).setLocalDescription(offer);

      wsSend({ type: "call-offer", from: myCode, fromName: myName, to, callType: type, sdp: offer });
    } catch {
      cleanup();
    }
  }, [myCode, myName, callState, cleanup]);

  const acceptCall = useCallback(async (type: "audio" | "video") => {
    if (!pendingOffer || !remoteCode) return;
    stopRingtone().catch(() => {});
    try {
      setCallType(type);

      const stream = await getLocalStream(type);
      setLocalStream(stream);

      const pc = createPC(stream, remoteCode);

      await (pc as any).setRemoteDescription(new RTCSessionDescription(pendingOffer));
      remoteDescSetRef.current = true;
      await addPendingIce(pc);

      const answer = await (pc as any).createAnswer();
      await (pc as any).setLocalDescription(answer);

      wsSend({ type: "call-answer", from: myCode, to: remoteCode, sdp: answer });
      setCallState("connected");
    } catch {
      cleanup();
    }
  }, [pendingOffer, remoteCode, myCode, cleanup]);

  const rejectCall = useCallback(() => {
    stopRingtone().catch(() => {});
    if (remoteCode) wsSend({ type: "call-reject", from: myCode, to: remoteCode });
    cleanup();
  }, [remoteCode, myCode, cleanup]);

  const hangup = useCallback(() => {
    if (remoteCode) wsSend({ type: "call-hangup", from: myCode, to: remoteCode });
    cleanup();
  }, [remoteCode, myCode, cleanup]);

  return (
    <CallContext.Provider value={{
      callState, remoteCode, remoteName, callType,
      localStream, remoteStream,
      initiateCall, acceptCall, rejectCall, hangup,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
