/**
 * WebRTC nativo para llamadas de audio/video.
 * Conexión peer-to-peer directa — sin Jitsi, sin WebView.
 * InCallManager maneja ruteo de audio (auricular ↔ altavoz) y sensor de proximidad.
 *
 * Flujo del CALLER:
 *   1. initCallerWebRTC() → captura micrófono, crea SDP offer, InCallManager inicia ringback
 *   2. Enviar SDP al servidor junto con el call offer → obtener offerId
 *   3. setOfferId(offerId) → flush de ICE candidates que se habían buffeado
 *   4. callerPollForAnswer() → espera SDP answer del callee
 *   5. stopRingback() cuando el callee acepta
 *
 * Flujo del CALLEE:
 *   1. initCalleeWebRTC(sdpOffer) → captura micrófono, crea SDP answer, InCallManager rutea a auricular
 *   2. Envía answer via WebSocket + HTTP fallback
 *   3. Intercambia ICE candidates via WebSocket
 */
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from "react-native-webrtc";
import type { MediaStream, MediaStreamTrack } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { registerWsHandler, sendWsMessage } from "./chatSocket";
import { API_URL } from "./api";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export interface WebRTCStreams {
  local: MediaStream | null;
  remote: MediaStream | null;
}
export type StreamsCallback = (streams: WebRTCStreams) => void;
export type HangupCallback = () => void;

// Estado global del módulo (una sola llamada activa a la vez)
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let onStreams: StreamsCallback | null = null;
let onRemoteHangup: HangupCallback | null = null;
let wsUnsub: (() => void) | null = null;

let myCode: string | null = null;
let peerId: string | null = null;
let currentOfferId: string | null = null;
let myRole: "caller" | "callee" | null = null;
let currentCallType: "audio" | "video" = "audio";

// Buffer de ICE candidates generados ANTES de que tengamos el offerId del servidor
const pendingIceCandidates: object[] = [];

function emitStreams() {
  onStreams?.({ local: localStream, remote: remoteStream });
}

async function getLocalStream(callType: "audio" | "video"): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video:
      callType === "video"
        ? { facingMode: "user", width: 640, height: 480 }
        : false,
  });
  return stream as unknown as MediaStream;
}

function flushPendingIce() {
  if (!currentOfferId || pendingIceCandidates.length === 0) return;
  const toSend = [...pendingIceCandidates];
  pendingIceCandidates.length = 0;
  for (const candidate of toSend) {
    sendWsMessage({
      type: "webrtc_ice",
      to: peerId,
      from: myCode,
      offerId: currentOfferId,
      candidate,
    });
    void fetch(`${API_URL}/calls/signal/${currentOfferId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: myRole, type: "ice", data: JSON.stringify(candidate) }),
    }).catch(() => {});
  }
}

/** Llama esto después de que el servidor devuelve el offerId real */
export function setOfferId(offerId: string) {
  currentOfferId = offerId;
  flushPendingIce();
}

/** Cambia el ruteo de audio entre auricular y altavoz. */
export function setSpeakerOn(on: boolean): void {
  try {
    InCallManager.setSpeakerphoneOn(on);
  } catch {}
}

/** Para el tono de retorno (ring ring que escucha el que llama). */
export function stopRingback(): void {
  try {
    InCallManager.stopRingback();
  } catch {}
}

/** Rota entre cámara frontal y trasera durante una videollamada. */
export async function flipCamera(): Promise<void> {
  if (!localStream) return;
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) return;
  const track = videoTracks[0] as MediaStreamTrack & { _switchCamera?: () => void };
  track._switchCamera?.();
}

function buildPeerConnection(): RTCPeerConnection {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // ICE candidates: si ya tenemos offerId → enviar de inmediato; si no → bufferear
  (conn as { onicecandidate?: (e: { candidate: object | null }) => void }).onicecandidate = (e: { candidate: object | null }) => {
    if (!e.candidate || !myCode || !peerId) return;
    if (!currentOfferId) {
      pendingIceCandidates.push(e.candidate);
      return;
    }
    sendWsMessage({
      type: "webrtc_ice",
      to: peerId,
      from: myCode,
      offerId: currentOfferId,
      candidate: e.candidate,
    });
    void fetch(`${API_URL}/calls/signal/${currentOfferId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: myRole, type: "ice", data: JSON.stringify(e.candidate) }),
    }).catch(() => {});
  };

  // Stream remoto → audio/video del otro lado
  (conn as { ontrack?: (e: { streams: MediaStream[] }) => void }).ontrack = (e: { streams: MediaStream[] }) => {
    if (e.streams?.[0]) {
      remoteStream = e.streams[0];
      emitStreams();
    }
  };

  // Detectar desconexión
  (conn as { onconnectionstatechange?: () => void }).onconnectionstatechange = () => {
    const state = (conn as { connectionState?: string }).connectionState;
    if (state === "disconnected" || state === "failed") {
      onRemoteHangup?.();
    }
  };

  return conn;
}

async function handleWsMsg(msg: Record<string, unknown>): Promise<void> {
  if (!pc || msg.from !== peerId) return;

  if (msg.type === "webrtc_answer" && myRole === "caller") {
    const sdp = msg.sdp as string | undefined;
    if (!sdp) return;
    try {
      const hasRemote = !!(pc as { remoteDescription?: unknown }).remoteDescription;
      if (!hasRemote) {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp })
        );
        emitStreams();
      }
    } catch {}
    return;
  }

  if (msg.type === "webrtc_ice") {
    const candidate = msg.candidate as object | undefined;
    if (!candidate) return;
    try {
      await pc.addIceCandidate(
        new RTCIceCandidate(candidate as ConstructorParameters<typeof RTCIceCandidate>[0])
      );
    } catch {}
  }
}

// ── Caller ─────────────────────────────────────────────────────────────────────

/**
 * Inicia WebRTC como llamante.
 * Reproduce tono de retorno (ring ring) via InCallManager.
 * Ruteo de audio: auricular para audio, altavoz para video.
 */
export async function initCallerWebRTC(opts: {
  myCode: string;
  peerId: string;
  callType: "audio" | "video";
  onStreams: StreamsCallback;
  onRemoteHangup: HangupCallback;
}): Promise<string> {
  myCode = opts.myCode;
  peerId = opts.peerId;
  currentOfferId = null;
  myRole = "caller";
  currentCallType = opts.callType;
  onStreams = opts.onStreams;
  onRemoteHangup = opts.onRemoteHangup;
  pendingIceCandidates.length = 0;

  localStream = await getLocalStream(opts.callType);
  pc = buildPeerConnection();
  localStream.getTracks().forEach((t) => pc!.addTrack(t, localStream!));

  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: opts.callType === "video",
  });
  await pc.setLocalDescription(offer);

  // InCallManager: inicia audio en modo llamada + tono de retorno para el caller
  try {
    InCallManager.start({
      media: opts.callType === "video" ? "video" : "audio",
      ringback: opts.callType === "audio" ? "_DTMF_" : "",
    });
    // Video → altavoz; Audio → auricular por defecto
    InCallManager.setSpeakerphoneOn(opts.callType === "video");
    InCallManager.setKeepScreenOn(true);
  } catch {}

  wsUnsub = registerWsHandler(handleWsMsg);
  emitStreams();

  return (offer as { sdp?: string }).sdp ?? "";
}

/**
 * Después de que la callee acepta, poll HTTP para obtener el SDP answer
 * en caso de que el WebSocket no lo entregó (fallback confiable).
 */
export async function callerPollForAnswer(offerId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!pc) return;
    const hasRemote = !!(pc as { remoteDescription?: unknown }).remoteDescription;
    if (hasRemote) return;
    try {
      const res = await fetch(`${API_URL}/calls/signal/${offerId}`);
      const data = (await res.json()) as {
        sdpAnswer?: string;
        calleeIce?: string[];
      };
      if (data.sdpAnswer && pc) {
        const still = !!(pc as { remoteDescription?: unknown }).remoteDescription;
        if (!still) {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: data.sdpAnswer })
          );
          emitStreams();
        }
      }
      if (data.calleeIce?.length && pc) {
        for (const raw of data.calleeIce) {
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate(JSON.parse(raw) as ConstructorParameters<typeof RTCIceCandidate>[0])
            );
          } catch {}
        }
      }
    } catch {}
  }
}

// ── Callee ─────────────────────────────────────────────────────────────────────

/**
 * Acepta la llamada entrante como callee.
 * InCallManager rutea audio a auricular (llamada de audio) o altavoz (video).
 */
export async function initCalleeWebRTC(opts: {
  myCode: string;
  peerId: string;
  offerId: string;
  callType: "audio" | "video";
  sdpOffer: string;
  onStreams: StreamsCallback;
  onRemoteHangup: HangupCallback;
}): Promise<void> {
  myCode = opts.myCode;
  peerId = opts.peerId;
  currentOfferId = opts.offerId;
  myRole = "callee";
  currentCallType = opts.callType;
  onStreams = opts.onStreams;
  onRemoteHangup = opts.onRemoteHangup;
  pendingIceCandidates.length = 0;

  localStream = await getLocalStream(opts.callType);
  pc = buildPeerConnection();
  localStream.getTracks().forEach((t) => pc!.addTrack(t, localStream!));

  await pc.setRemoteDescription(
    new RTCSessionDescription({ type: "offer", sdp: opts.sdpOffer })
  );
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // InCallManager: auricular para audio, altavoz para video
  try {
    InCallManager.start({ media: opts.callType === "video" ? "video" : "audio" });
    InCallManager.setSpeakerphoneOn(opts.callType === "video");
    InCallManager.setKeepScreenOn(true);
  } catch {}

  const answerSdp = (answer as { sdp?: string }).sdp ?? "";

  // Enviar answer via WebSocket (rápido)
  sendWsMessage({
    type: "webrtc_answer",
    to: opts.peerId,
    from: opts.myCode,
    offerId: opts.offerId,
    sdp: answerSdp,
  });

  // Guardar en servidor (fallback)
  void fetch(`${API_URL}/calls/signal/${opts.offerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "callee", type: "answer", data: answerSdp }),
  }).catch(() => {});

  wsUnsub = registerWsHandler(handleWsMsg);
  emitStreams();
}

// ── Controles ──────────────────────────────────────────────────────────────────

export function getWebRTCStreams(): WebRTCStreams {
  return { local: localStream, remote: remoteStream };
}

export function setMicMuted(muted: boolean): void {
  localStream?.getAudioTracks().forEach((t) => {
    t.enabled = !muted;
  });
}

export function hangupWebRTC(): void {
  try { InCallManager.stop(); } catch {}
  wsUnsub?.();
  wsUnsub = null;
  pendingIceCandidates.length = 0;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  remoteStream = null;
  try { pc?.close(); } catch {}
  pc = null;
  myCode = null;
  peerId = null;
  currentOfferId = null;
  myRole = null;
  currentCallType = "audio";
  onStreams = null;
  onRemoteHangup = null;
}
