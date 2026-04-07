import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useCall } from "@/context/CallContext";

export function ActiveCallOverlay() {
  const { callState, activeCall, endCall } = useCall();
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (callState === "active") {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  const visible = callState === "outgoing" || callState === "active";
  if (!visible || !activeCall) return null;

  const isOutgoing = callState === "outgoing";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const duration = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.peerInfo}>
            <Feather
              name={activeCall.type === "video" ? "video" : "phone"}
              size={16}
              color="#00D4FF"
            />
            <Text style={s.peerName} numberOfLines={1}>
              {activeCall.peerName}
            </Text>
          </View>
          <Text style={s.status}>
            {isOutgoing ? "Llamando..." : duration}
          </Text>
        </View>

        {/* WebView Jitsi */}
        {!isOutgoing ? (
          <WebView
            style={s.webview}
            source={{ uri: activeCall.jitsiUrl }}
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            allowsProtectedMedia
            mediaCapturePermissionGrantType="grant"
            originWhitelist={["*"]}
            mixedContentMode="always"
            userAgent={
              Platform.OS === "android"
                ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                : undefined
            }
          />
        ) : (
          <View style={s.waitingScreen}>
            <View style={s.waitingAvatar}>
              <Feather
                name={activeCall.type === "video" ? "video" : "phone-call"}
                size={48}
                color="#fff"
              />
            </View>
            <Text style={s.waitingName}>{activeCall.peerName}</Text>
            <Text style={s.waitingText}>Llamando...</Text>
          </View>
        )}

        {/* Botón colgar */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={s.hangupBtn} onPress={endCall}>
            <Feather name="phone-off" size={28} color="#fff" />
            <Text style={s.hangupText}>Colgar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050C1A" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  peerInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  peerName: { color: "#fff", fontSize: 17, fontWeight: "600", flex: 1 },
  status: { color: "#8B9AB5", fontSize: 14 },
  webview: { flex: 1 },
  waitingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  waitingAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E3A5F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#00D4FF",
  },
  waitingName: { color: "#fff", fontSize: 28, fontWeight: "700" },
  waitingText: { color: "#8B9AB5", fontSize: 16 },
  footer: {
    paddingHorizontal: 40,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  hangupBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E53E3E",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  hangupText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
