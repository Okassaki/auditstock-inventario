import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RTCView } from "react-native-webrtc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

// ── Botón de control circular estilo WhatsApp ──────────────────────────────────
function CtrlBtn({
  icon,
  label,
  onPress,
  active = false,
  activeColor = "#fff",
  disabled = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.ctrlBtn, active && { backgroundColor: "rgba(255,255,255,0.25)" }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Feather
        name={icon as never}
        size={24}
        color={disabled ? "#555" : active ? activeColor : "#fff"}
      />
      <Text style={[s.ctrlLabel, disabled && { color: "#555" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function ActiveCallOverlay() {
  const {
    callState,
    activeCall,
    isMuted,
    isSpeaker,
    webrtcStreams,
    endCall,
    toggleMute,
    toggleSpeaker,
    flipCamera,
  } = useCall();

  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Anillos expandiéndose (estilo WhatsApp mientras llama)
  const rings = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const visible = callState === "outgoing" || callState === "active";
  const isActive = callState === "active";
  const isVideo = activeCall?.type === "video";

  // Temporizador de duración
  useEffect(() => {
    if (isActive) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Animación de anillos cuando está llamando (outgoing)
  useEffect(() => {
    if (callState !== "outgoing") {
      rings.forEach((r) => r.setValue(0));
      return;
    }
    const anim = Animated.loop(
      Animated.stagger(500, [
        Animated.timing(rings[0], { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(rings[1], { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(rings[2], { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => {
      anim.stop();
      rings.forEach((r) => r.setValue(0));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  if (!visible || !activeCall) return null;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const duration = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const statusText = callState === "outgoing" ? "Llamando..." : duration;

  const initials = activeCall.peerName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // ── Video call UI ────────────────────────────────────────────────────────────
  if (isVideo && isActive && webrtcStreams.remote) {
    const remoteUrl = (webrtcStreams.remote as unknown as { toURL?: () => string }).toURL?.() ?? "";
    const localUrl = (webrtcStreams.local as unknown as { toURL?: () => string } | null)?.toURL?.() ?? "";

    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={vs.root}>
          {/* Vídeo remoto — pantalla completa */}
          {remoteUrl ? (
            <RTCView
              streamURL={remoteUrl}
              style={StyleSheet.absoluteFillObject}
              objectFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, vs.noVideoPlaceholder]}>
              <Feather name="video-off" size={48} color="#444" />
              <Text style={vs.noVideoText}>Sin vídeo remoto</Text>
            </View>
          )}

          {/* PiP local — esquina superior derecha */}
          {localUrl ? (
            <View style={[vs.pip, { top: insets.top + 12, right: 12 }]}>
              <RTCView
                streamURL={localUrl}
                style={StyleSheet.absoluteFillObject}
                objectFit="cover"
                mirror
              />
            </View>
          ) : null}

          {/* Barra superior: nombre + duración */}
          <View style={[vs.topBar, { paddingTop: insets.top + 12 }]}>
            <Text style={vs.topName}>{activeCall.peerName}</Text>
            <Text style={vs.topDuration}>{duration}</Text>
          </View>

          {/* Controles inferiores */}
          <View style={[vs.controls, { paddingBottom: insets.bottom + 24 }]}>
            <CtrlBtn
              icon="refresh-cw"
              label="Girar"
              onPress={flipCamera}
            />
            <CtrlBtn
              icon={isMuted ? "mic-off" : "mic"}
              label={isMuted ? "Activar" : "Silencio"}
              onPress={toggleMute}
              active={isMuted}
              activeColor="#FF6B6B"
            />
            <TouchableOpacity style={vs.hangupBtn} onPress={endCall} activeOpacity={0.8}>
              <Feather name="phone-off" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Audio call UI (estilo WhatsApp) ──────────────────────────────────────────
  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top }]}>

        {/* Nombre + estado arriba */}
        <View style={s.header}>
          <Text style={s.peerName}>{activeCall.peerName}</Text>
          <Text style={s.statusText}>{statusText}</Text>
          {isActive && (
            <View style={s.encryptRow}>
              <Feather name="lock" size={11} color="#8B9AB5" />
              <Text style={s.encryptText}>Cifrado de extremo a extremo</Text>
            </View>
          )}
        </View>

        {/* Avatar con anillos animados */}
        <View style={s.avatarArea}>
          {rings.map((r, i) => (
            <Animated.View
              key={i}
              style={[
                s.ring,
                {
                  transform: [
                    {
                      scale: r.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.4 + i * 0.3],
                      }),
                    },
                  ],
                  opacity: r.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0.5, 0.25, 0],
                  }),
                },
              ]}
            />
          ))}
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials || "?"}</Text>
          </View>
        </View>

        {/* Controles — fila inferior estilo WhatsApp */}
        <View style={[s.controls, { paddingBottom: insets.bottom + 32 }]}>
          {/* Fila de botones secundarios */}
          <View style={s.btnRow}>
            <CtrlBtn
              icon={isSpeaker ? "volume-2" : "volume-x"}
              label={isSpeaker ? "Altavoz" : "Auricular"}
              onPress={toggleSpeaker}
              active={isSpeaker}
            />
            <CtrlBtn
              icon={isMuted ? "mic-off" : "mic"}
              label={isMuted ? "Activar mic" : "Silencio"}
              onPress={toggleMute}
              active={isMuted}
              activeColor="#FF6B6B"
            />
            <CtrlBtn
              icon="video"
              label="Cámara"
              onPress={() => {}}
              disabled
            />
          </View>

          {/* Botón de colgar — rojo, centrado, más grande */}
          <TouchableOpacity style={s.hangupBtn} onPress={endCall} activeOpacity={0.8}>
            <Feather name="phone-off" size={30} color="#fff" />
            <Text style={s.hangupLabel}>Colgar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Estilos audio call ─────────────────────────────────────────────────────────
const AVATAR_SIZE = 130;
const RING_SIZE = AVATAR_SIZE + 20;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D1520",
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    paddingTop: 24,
    gap: 6,
  },
  peerName: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  statusText: {
    color: "#8B9AB5",
    fontSize: 16,
    textAlign: "center",
  },
  encryptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  encryptText: {
    color: "#8B9AB5",
    fontSize: 11,
  },
  avatarArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "#00D4FF",
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#1E3A5F",
    borderWidth: 3,
    borderColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 46,
    fontWeight: "700",
  },
  controls: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 32,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  ctrlBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  ctrlLabel: {
    position: "absolute",
    bottom: -22,
    color: "#8B9AB5",
    fontSize: 11,
    textAlign: "center",
    width: 80,
  },
  hangupBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#E53E3E",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    shadowColor: "#E53E3E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  hangupLabel: {
    position: "absolute",
    bottom: -22,
    color: "#E53E3E",
    fontSize: 12,
    fontWeight: "600",
  },
});

// ── Estilos video call ─────────────────────────────────────────────────────────
const vs = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  noVideoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#111",
  },
  noVideoText: {
    color: "#555",
    fontSize: 14,
  },
  pip: {
    position: "absolute",
    width: 110,
    height: 160,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    gap: 2,
  },
  topName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  topDuration: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  hangupBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E53E3E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#E53E3E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
});
