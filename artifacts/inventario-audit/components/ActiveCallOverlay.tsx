import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RTCView } from "react-native-webrtc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

function useTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      setSecs(0);
      ref.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function ActiveCallOverlay() {
  const { callState, remoteName, callType, localStream, remoteStream, hangup } = useCall();
  const insets = useSafeAreaInsets();
  const visible = callState === "outgoing" || callState === "connected";
  const timer = useTimer(callState === "connected");

  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [camOff, setCamOff] = useState(false);

  useEffect(() => {
    if (!visible) { setMuted(false); setSpeakerOn(false); setCamOff(false); }
  }, [visible]);

  function toggleMute() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t: any) => { t.enabled = !t.enabled; });
    setMuted((m) => !m);
  }

  function toggleCamera() {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t: any) => { t.enabled = !t.enabled; });
    setCamOff((c) => !c);
  }

  function flipCamera() {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t: any) => {
      if (typeof t._switchCamera === "function") t._switchCamera();
    });
  }

  if (!visible) return null;

  const hasRemoteVideo = callType === "video" && remoteStream;
  const hasLocalVideo  = callType === "video" && localStream && !camOff;

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={s.root}>

        {hasRemoteVideo ? (
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            style={s.remoteVideo}
            objectFit="cover"
            mirror={false}
          />
        ) : (
          <View style={s.avatarFull}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{(remoteName ?? "?").charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={s.callerName}>{remoteName}</Text>
            <Text style={s.statusText}>
              {callState === "outgoing" ? "Llamando..." : timer}
            </Text>
          </View>
        )}

        {hasRemoteVideo && (
          <View style={[s.remoteInfo, { top: insets.top + 10 }]}>
            <Text style={s.remoteInfoName}>{remoteName}</Text>
            <Text style={s.remoteInfoTimer}>{callState === "outgoing" ? "Llamando..." : timer}</Text>
          </View>
        )}

        {hasLocalVideo && (
          <View style={[s.localVideo, { top: insets.top + 10 }]}>
            <RTCView
              streamURL={(localStream as any).toURL()}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror
            />
          </View>
        )}

        <View style={[s.controls, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.controlsRow}>
            <CtrlBtn icon={muted ? "mic-off" : "mic"} label={muted ? "Activar" : "Silenciar"} onPress={toggleMute} active={muted} />
            {callType === "video" && (
              <>
                <CtrlBtn icon={camOff ? "video-off" : "video"} label={camOff ? "Activar" : "Cámara"} onPress={toggleCamera} active={camOff} />
                <CtrlBtn icon="refresh-cw" label="Cambiar" onPress={flipCamera} />
              </>
            )}
            <CtrlBtn icon="volume-2" label="Altavoz" onPress={() => setSpeakerOn((v) => !v)} active={speakerOn} />
          </View>
          <TouchableOpacity style={s.hangupBtn} onPress={hangup}>
            <Feather name="phone-off" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function CtrlBtn({ icon, label, onPress, active }: { icon: string; label: string; onPress: () => void; active?: boolean }) {
  return (
    <View style={s.ctrlWrap}>
      <TouchableOpacity style={[s.ctrlBtn, active && s.ctrlBtnActive]} onPress={onPress}>
        <Feather name={icon as any} size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={s.ctrlLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  remoteVideo: { flex: 1 },
  avatarFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  avatarCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#2D2550", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 46, fontWeight: "700", color: "#fff" },
  callerName: { fontSize: 26, fontWeight: "700", color: "#fff" },
  statusText: { fontSize: 16, color: "#aaa" },
  remoteInfo: { position: "absolute", left: 16 },
  remoteInfoName: { fontSize: 17, fontWeight: "700", color: "#fff", textShadowColor: "#000", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  remoteInfoTimer: { fontSize: 13, color: "#ccc", textShadowColor: "#000", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  localVideo: { position: "absolute", right: 16, width: 100, height: 140, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "#fff4" },
  controls: { backgroundColor: "#0009", paddingTop: 20, alignItems: "center", gap: 20 },
  controlsRow: { flexDirection: "row", gap: 24, justifyContent: "center" },
  ctrlWrap: { alignItems: "center", gap: 6 },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#ffffff25", alignItems: "center", justifyContent: "center" },
  ctrlBtnActive: { backgroundColor: "#ffffff55" },
  ctrlLabel: { fontSize: 11, color: "#ccc" },
  hangupBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
});
