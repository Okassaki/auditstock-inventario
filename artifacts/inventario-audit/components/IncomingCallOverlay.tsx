import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "@/context/CallContext";

export function IncomingCallOverlay() {
  const { callState, remoteName, acceptCall, rejectCall } = useCall();
  const insets = useSafeAreaInsets();
  const visible = callState === "incoming";

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent={false} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#0D0A1E" />
      <View style={[s.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}>

        <View style={s.topSection}>
          <Text style={s.callingLabel}>Llamada entrante</Text>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {(remoteName ?? "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.callerName}>{remoteName ?? "Desconocido"}</Text>
        </View>

        <View style={s.actions}>
          <View style={s.actionCol}>
            <TouchableOpacity style={[s.btn, s.rejectBtn]} onPress={rejectCall}>
              <Feather name="phone-off" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={s.btnLabel}>Rechazar</Text>
          </View>

          <View style={s.actionCol}>
            <TouchableOpacity style={[s.btn, s.videoBtn]} onPress={() => acceptCall("video")}>
              <Feather name="video" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={s.btnLabel}>Video</Text>
          </View>

          <View style={s.actionCol}>
            <TouchableOpacity style={[s.btn, s.acceptBtn]} onPress={() => acceptCall("audio")}>
              <Feather name="phone" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={s.btnLabel}>Audio</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D0A1E",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topSection: { alignItems: "center", gap: 20, marginTop: 40 },
  callingLabel: { fontSize: 14, color: "#8B7FBA", letterSpacing: 1 },
  avatarWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "#2D2550",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#8B5CF6",
  },
  avatarText: { fontSize: 52, fontWeight: "700", color: "#fff" },
  callerName: { fontSize: 30, fontWeight: "700", color: "#F0F4FF", textAlign: "center" },
  actions: { flexDirection: "row", justifyContent: "center", gap: 30, width: "100%" },
  actionCol: { alignItems: "center", gap: 10 },
  btn: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  rejectBtn: { backgroundColor: "#EF4444" },
  acceptBtn: { backgroundColor: "#22C55E" },
  videoBtn: { backgroundColor: "#3B82F6" },
  btnLabel: { fontSize: 13, color: "#8B98B8" },
});
