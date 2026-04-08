import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  getCustomCallName,
  getCustomCallUri,
  getCustomMsgName,
  getCustomMsgUri,
  persistAudioFile,
  previewSound,
  setCallTone,
  setCustomCall,
  setCustomMsg,
  setMsgTone,
  stopRingtone,
} from "@/utils/ringtone";

const BG          = "#0A0F1E";
const SURFACE     = "#111827";
const SURFACE_SEL = "#0D1B2A";
const BORDER      = "#1F2937";
const TEXT        = "#F0F4FF";
const TEXT_SEC    = "#8B98B8";
const TEXT_MUTED  = "#4B5563";
const PRIMARY     = "#00D4FF";
const DANGER      = "#FF4757";

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

  const [callTone,       setCallToneState]       = useState<CallTone>("ring1");
  const [msgTone,        setMsgToneState]         = useState<MsgTone>("ping");
  const [previewing,     setPreviewing]           = useState<string | null>(null);
  const [customCallName, setCustomCallName]       = useState<string | null>(null);
  const [customMsgName,  setCustomMsgName]        = useState<string | null>(null);
  const [pickingCall,    setPickingCall]          = useState(false);
  const [pickingMsg,     setPickingMsg]           = useState(false);

  useEffect(() => {
    async function load() {
      const [ct, mt, ccn, cmn] = await Promise.all([
        getCallTone(),
        getMsgTone(),
        getCustomCallName(),
        getCustomMsgName(),
      ]);
      setCallToneState(ct);
      setMsgToneState(mt);
      setCustomCallName(ccn);
      setCustomMsgName(cmn);
    }
    load();
    return () => { stopRingtone().catch(() => {}); };
  }, []);

  async function selectCallTone(v: CallTone) {
    setCallToneState(v);
    await setCallTone(v);
    if (v !== "silent" && v !== "custom") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 3500);
    }
  }

  async function selectMsgTone(v: MsgTone) {
    setMsgToneState(v);
    await setMsgTone(v);
    if (v !== "silent" && v !== "custom") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 2000);
    }
  }

  async function pickCustomCall() {
    setPickingCall(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name  = asset.name ?? "tono_llamada";
      const uri   = await persistAudioFile(asset.uri, name, "call");
      await setCustomCall(uri, name);
      await setCallTone("custom");
      setCustomCallName(name);
      setCallToneState("custom");
      // Vista previa
      setPreviewing("custom_call");
      await previewSound("custom", uri);
      setTimeout(() => setPreviewing(null), 4000);
    } catch {
      // usuario canceló o error de permisos
    } finally {
      setPickingCall(false);
    }
  }

  async function pickCustomMsg() {
    setPickingMsg(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name  = asset.name ?? "tono_mensaje";
      const uri   = await persistAudioFile(asset.uri, name, "msg");
      await setCustomMsg(uri, name);
      await setMsgTone("custom");
      setCustomMsgName(name);
      setMsgToneState("custom");
      // Vista previa
      setPreviewing("custom_msg");
      await previewSound("custom", uri);
      setTimeout(() => setPreviewing(null), 4000);
    } catch {
      // usuario canceló o error de permisos
    } finally {
      setPickingMsg(false);
    }
  }

  async function previewCustomCall() {
    const uri = await getCustomCallUri();
    if (!uri) return;
    setPreviewing("custom_call");
    await previewSound("custom", uri);
    setTimeout(() => setPreviewing(null), 4000);
  }

  async function previewCustomMsg() {
    const uri = await getCustomMsgUri();
    if (!uri) return;
    setPreviewing("custom_msg");
    await previewSound("custom", uri);
    setTimeout(() => setPreviewing(null), 4000);
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

        {/* ── Tono de llamada ── */}
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

        {/* Desde dispositivo — llamada */}
        <TouchableOpacity
          style={[s.row, s.customRow, callTone === "custom" && s.rowActive]}
          onPress={pickCustomCall}
          disabled={pickingCall}
        >
          <View style={[s.iconBox, callTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
            {pickingCall
              ? <ActivityIndicator size={18} color={PRIMARY} />
              : <Feather name="folder" size={18} color={callTone === "custom" ? PRIMARY : TEXT_SEC} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, callTone === "custom" && { color: PRIMARY }]}>
              Desde dispositivo
            </Text>
            {customCallName && (
              <Text style={s.customName} numberOfLines={1}>{customCallName}</Text>
            )}
          </View>
          {callTone === "custom" && customCallName && previewing !== "custom_call" && (
            <TouchableOpacity onPress={previewCustomCall} style={s.previewBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="play" size={15} color={PRIMARY} />
            </TouchableOpacity>
          )}
          {previewing === "custom_call" && (
            <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />
          )}
          {callTone === "custom" && <Feather name="check-circle" size={20} color={PRIMARY} />}
        </TouchableOpacity>

        {/* ── Tono de mensajes ── */}
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

        {/* Desde dispositivo — mensaje */}
        <TouchableOpacity
          style={[s.row, s.customRow, msgTone === "custom" && s.rowActive]}
          onPress={pickCustomMsg}
          disabled={pickingMsg}
        >
          <View style={[s.iconBox, msgTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
            {pickingMsg
              ? <ActivityIndicator size={18} color={PRIMARY} />
              : <Feather name="folder" size={18} color={msgTone === "custom" ? PRIMARY : TEXT_SEC} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, msgTone === "custom" && { color: PRIMARY }]}>
              Desde dispositivo
            </Text>
            {customMsgName && (
              <Text style={s.customName} numberOfLines={1}>{customMsgName}</Text>
            )}
          </View>
          {msgTone === "custom" && customMsgName && previewing !== "custom_msg" && (
            <TouchableOpacity onPress={previewCustomMsg} style={s.previewBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="play" size={15} color={PRIMARY} />
            </TouchableOpacity>
          )}
          {previewing === "custom_msg" && (
            <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />
          )}
          {msgTone === "custom" && <Feather name="check-circle" size={20} color={PRIMARY} />}
        </TouchableOpacity>

        <Text style={s.hint}>
          Al seleccionar un tono integrado se reproduce una vista previa.{"\n"}
          Los archivos del dispositivo se copian localmente para que funcionen sin conexión.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },
  header:      { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER },
  title:       { fontSize: 17, fontWeight: "600", color: TEXT },
  scroll:      { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 20 },
  section:     { fontSize: 11, fontWeight: "700", color: TEXT_SEC, letterSpacing: 1.2, marginBottom: 10 },
  row:         { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8 },
  rowActive:   { borderWidth: 1, borderColor: PRIMARY + "60", backgroundColor: SURFACE_SEL },
  customRow:   { borderWidth: 1, borderColor: BORDER },
  iconBox:     { width: 38, height: 38, borderRadius: 10, backgroundColor: BORDER, alignItems: "center", justifyContent: "center" },
  rowLabel:    { fontSize: 15, color: TEXT, fontWeight: "500" },
  customName:  { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  previewBtn:  { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginRight: 6 },
  hint:        { fontSize: 12, color: TEXT_SEC, textAlign: "center", marginTop: 24, lineHeight: 18 },
});
