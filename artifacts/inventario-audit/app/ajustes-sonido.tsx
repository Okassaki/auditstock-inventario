import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type CallTone,
  type MsgTone,
  getCallTone,
  getMsgTone,
  previewSound,
  setCallTone,
  setMsgTone,
  stopRingtone,
} from "@/utils/ringtone";

const BG = "#0A0F1E";
const SURFACE = "#111827";
const BORDER = "#1F2937";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B98B8";
const PRIMARY = "#00D4FF";

const CALL_TONES: { label: string; value: CallTone; icon: string }[] = [
  { label: "Classic Ring",  value: "ring1",  icon: "phone-call" },
  { label: "Digital",       value: "ring2",  icon: "zap" },
  { label: "Suave",         value: "ring3",  icon: "wind" },
  { label: "Silencio",      value: "silent", icon: "volume-x" },
];

const MSG_TONES: { label: string; value: MsgTone; icon: string }[] = [
  { label: "Ping",     value: "ping",   icon: "bell" },
  { label: "Chime",    value: "chime",  icon: "music" },
  { label: "Pop",      value: "pop",    icon: "circle" },
  { label: "Silencio", value: "silent", icon: "volume-x" },
];

export default function AjustesSonido() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [callTone, setCallToneState] = useState<CallTone>("ring1");
  const [msgTone, setMsgToneState] = useState<MsgTone>("ping");
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    getCallTone().then(setCallToneState);
    getMsgTone().then(setMsgToneState);
    return () => { stopRingtone().catch(() => {}); };
  }, []);

  async function selectCallTone(v: CallTone) {
    setCallToneState(v);
    await setCallTone(v);
    if (v !== "silent") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 3500);
    }
  }

  async function selectMsgTone(v: MsgTone) {
    setMsgToneState(v);
    await setMsgTone(v);
    if (v !== "silent") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 2000);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.title}>Ajustes de sonido</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={s.section}>TONO DE LLAMADA ENTRANTE</Text>
        {CALL_TONES.map((t) => {
          const active = callTone === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[s.row, active && s.rowActive]}
              onPress={() => selectCallTone(t.value)}
            >
              <View style={[s.iconBox, active && { backgroundColor: PRIMARY + "25" }]}>
                <Feather name={t.icon as any} size={18} color={active ? PRIMARY : TEXT_SEC} />
              </View>
              <Text style={[s.rowLabel, active && { color: PRIMARY }]}>{t.label}</Text>
              <View style={{ flex: 1 }} />
              {previewing === t.value && (
                <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />
              )}
              {active && <Feather name="check-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
          );
        })}

        <Text style={[s.section, { marginTop: 28 }]}>TONO DE NOTIFICACIÓN DE MENSAJES</Text>
        {MSG_TONES.map((t) => {
          const active = msgTone === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[s.row, active && s.rowActive]}
              onPress={() => selectMsgTone(t.value)}
            >
              <View style={[s.iconBox, active && { backgroundColor: PRIMARY + "25" }]}>
                <Feather name={t.icon as any} size={18} color={active ? PRIMARY : TEXT_SEC} />
              </View>
              <Text style={[s.rowLabel, active && { color: PRIMARY }]}>{t.label}</Text>
              <View style={{ flex: 1 }} />
              {previewing === t.value && (
                <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />
              )}
              {active && <Feather name="check-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
          );
        })}

        <Text style={s.hint}>Al seleccionar un tono se reproduce una vista previa.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER },
  title: { fontSize: 17, fontWeight: "600", color: TEXT },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 20 },
  section: { fontSize: 11, fontWeight: "700", color: TEXT_SEC, letterSpacing: 1.2, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8 },
  rowActive: { borderWidth: 1, borderColor: PRIMARY + "60" },
  iconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: BORDER, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, color: TEXT, fontWeight: "500" },
  hint: { fontSize: 12, color: TEXT_SEC, textAlign: "center", marginTop: 24 },
});
