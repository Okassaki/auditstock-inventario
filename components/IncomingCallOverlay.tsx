import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

export function IncomingCallOverlay() {
  const { callState, incomingCall, acceptCall, rejectCall } = useCall();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (callState !== "incoming") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [callState, pulse]);

  if (callState !== "incoming" || !incomingCall) return null;

  const isVideo = incomingCall.type === "video";

  return (
    <Modal transparent animationType="slide" visible statusBarTranslucent>
      <View style={[s.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.card}>
          <Text style={s.callType}>{isVideo ? "Video llamada entrante" : "Llamada entrante"}</Text>

          <Animated.View style={[s.avatarWrap, { transform: [{ scale: pulse }] }]}>
            <View style={s.avatar}>
              <Feather name={isVideo ? "video" : "phone-call"} size={38} color="#fff" />
            </View>
          </Animated.View>

          <Text style={s.callerName}>{incomingCall.fromName}</Text>
          <Text style={s.callerSub}>{incomingCall.from}</Text>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.rejectBtn]} onPress={rejectCall}>
              <Feather name="phone-off" size={28} color="#fff" />
              <Text style={s.btnLabel}>Rechazar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btn, s.acceptBtn]} onPress={acceptCall}>
              <Feather name={isVideo ? "video" : "phone"} size={28} color="#fff" />
              <Text style={s.btnLabel}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "88%",
    backgroundColor: "#0D1528",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 36,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  callType: { fontSize: 14, color: "#8B9AB5", fontWeight: "500" },
  avatarWrap: { marginVertical: 8 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1E3A5F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#00D4FF",
  },
  callerName: { fontSize: 26, color: "#fff", fontWeight: "700", textAlign: "center" },
  callerSub: { fontSize: 14, color: "#8B9AB5", marginTop: -4 },
  btnRow: { flexDirection: "row", gap: 32, marginTop: 20 },
  btn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  rejectBtn: { backgroundColor: "#E53E3E" },
  acceptBtn: { backgroundColor: "#38A169" },
  btnLabel: { fontSize: 12, color: "#fff", fontWeight: "600" },
});
