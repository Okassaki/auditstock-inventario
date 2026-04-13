import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

export function ActiveCallOverlay() {
  const { callState, activeCall, isMuted, endCall, toggleMute } = useCall();
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animación de pulso mientras la llamada está activa
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const visible = callState === "outgoing" || callState === "active";

  useEffect(() => {
    if (callState === "active") {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      // Pulso suave
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
      setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      pulseLoop.current?.stop();
    };
  }, [callState, pulseAnim]);

  if (!visible || !activeCall) return null;

  const isOutgoing = callState === "outgoing";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const duration = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const initials = activeCall.peerName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top }]}>

        {/* Cabecera */}
        <View style={s.header}>
          <Feather
            name={activeCall.type === "video" ? "video" : "phone"}
            size={16}
            color="#00D4FF"
          />
          <Text style={s.headerTitle} numberOfLines={1}>
            {activeCall.peerName}
          </Text>
          <Text style={s.headerStatus}>
            {isOutgoing ? "Llamando..." : duration}
          </Text>
        </View>

        {/* Centro: avatar + estado */}
        <View style={s.center}>
          <Animated.View
            style={[s.avatarRing, { transform: [{ scale: pulseAnim }] }]}
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials || "?"}</Text>
            </View>
          </Animated.View>

          <Text style={s.peerName}>{activeCall.peerName}</Text>

          {isOutgoing ? (
            <Text style={s.statusText}>Conectando...</Text>
          ) : (
            <View style={s.audioIndicator}>
              <Feather name="activity" size={18} color="#00D4FF" />
              <Text style={s.statusText}>Llamada en curso</Text>
            </View>
          )}
        </View>

        {/* Controles */}
        <View style={[s.controls, { paddingBottom: insets.bottom + 24 }]}>
          {/* Silenciar micrófono */}
          <TouchableOpacity
            style={[s.ctrlBtn, isMuted && s.ctrlBtnActive]}
            onPress={toggleMute}
          >
            <Feather
              name={isMuted ? "mic-off" : "mic"}
              size={26}
              color={isMuted ? "#FF6B6B" : "#fff"}
            />
            <Text style={[s.ctrlLabel, isMuted && s.ctrlLabelActive]}>
              {isMuted ? "Silenciado" : "Micrófono"}
            </Text>
          </TouchableOpacity>

          {/* Colgar */}
          <TouchableOpacity style={s.hangupBtn} onPress={endCall}>
            <Feather name="phone-off" size={30} color="#fff" />
            <Text style={s.hangupLabel}>Colgar</Text>
          </TouchableOpacity>

          {/* Placeholder para botón futuro (altavoz, etc.) */}
          <View style={s.ctrlBtn} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050C1A",
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerStatus: {
    color: "#8B9AB5",
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  avatarRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2.5,
    borderColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,212,255,0.08)",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E3A5F",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: 1,
  },
  peerName: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  audioIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: "#8B9AB5",
    fontSize: 15,
  },
  controls: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingHorizontal: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  ctrlBtn: {
    width: 72,
    alignItems: "center",
    gap: 6,
  },
  ctrlBtnActive: {},
  ctrlLabel: {
    color: "#8B9AB5",
    fontSize: 11,
    textAlign: "center",
  },
  ctrlLabelActive: {
    color: "#FF6B6B",
  },
  hangupBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E53E3E",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#E53E3E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  hangupLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});
