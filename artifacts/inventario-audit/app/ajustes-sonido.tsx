import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
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
  getCustomCallName,
  getCustomCallUri,
  getCustomMsgName,
  getCustomMsgUri,
  getMsgTone,
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
const SURFACE2    = "#161D2E";
const BORDER      = "#1F2937";
const BORDER2     = "#2A3547";
const TEXT        = "#F0F4FF";
const TEXT_SEC    = "#8B98B8";
const TEXT_MUTED  = "#4B5563";
const PRIMARY     = "#00D4FF";

// ── Rutas donde Android guarda sus tonos de sistema ────────────────────────
const SYSTEM_AUDIO_DIRS = [
  "file:///system/media/audio/ringtones",
  "file:///system/media/audio/notifications",
  "file:///system/media/audio/alarms",
  "file:///system/media/audio/ui",
];
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"]);

interface SystemTone {
  name: string;
  uri: string;
}

// ── Leer tonos del sistema ──────────────────────────────────────────────────
async function readSystemTones(): Promise<SystemTone[]> {
  const tones: SystemTone[] = [];
  for (const dir of SYSTEM_AUDIO_DIRS) {
    try {
      const files = await FileSystem.readDirectoryAsync(dir);
      for (const f of files) {
        const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          tones.push({ name: f.replace(/\.[^.]+$/, ""), uri: `${dir}/${f}` });
        }
      }
    } catch {
      // directorio no accesible en este dispositivo
    }
  }
  tones.sort((a, b) => a.name.localeCompare(b.name));
  return tones;
}

// ── Tipos de tonos integrados ───────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// Modal de selección de tono del sistema
// ═══════════════════════════════════════════════════════════════════════════
function SystemTonePicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (tone: SystemTone) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tones,     setTones]     = useState<SystemTone[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [previewing,setPreviewing]= useState<string | null>(null);
  const [selected,  setSelected]  = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    readSystemTones().then((t) => { setTones(t); setLoading(false); });
    return () => { stopRingtone().catch(() => {}); };
  }, [visible]);

  async function preview(tone: SystemTone) {
    if (previewing === tone.uri) {
      await stopRingtone();
      setPreviewing(null);
      return;
    }
    setPreviewing(tone.uri);
    await previewSound("custom", tone.uri);
    setTimeout(() => setPreviewing((p) => p === tone.uri ? null : p), 5000);
  }

  function confirmSelect() {
    const tone = tones.find((t) => t.uri === selected);
    if (tone) onSelect(tone);
    stopRingtone().catch(() => {});
  }

  function handleClose() {
    stopRingtone().catch(() => {});
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={p.overlay}>
        <View style={[p.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={p.handle} />
          <View style={p.titleRow}>
            <Text style={p.title}>Tonos del sistema</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={TEXT_SEC} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={p.center}>
              <ActivityIndicator color={PRIMARY} size="large" />
              <Text style={p.loadingText}>Leyendo tonos del sistema…</Text>
            </View>
          ) : tones.length === 0 ? (
            <View style={p.center}>
              <Feather name="alert-circle" size={32} color={TEXT_MUTED} />
              <Text style={p.emptyText}>No se encontraron tonos del sistema en este dispositivo.</Text>
            </View>
          ) : (
            <FlatList
              data={tones}
              keyExtractor={(t) => t.uri}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: BORDER }} />}
              renderItem={({ item }) => {
                const isSelected = selected === item.uri;
                const isPrev     = previewing === item.uri;
                return (
                  <TouchableOpacity
                    style={[p.toneRow, isSelected && p.toneRowSel]}
                    onPress={() => setSelected(item.uri)}
                    activeOpacity={0.7}
                  >
                    <Text style={[p.toneName, isSelected && { color: PRIMARY }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => preview(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={p.previewBtn}
                    >
                      <Feather
                        name={isPrev ? "volume-2" : "play"}
                        size={16}
                        color={isPrev ? PRIMARY : TEXT_SEC}
                      />
                    </TouchableOpacity>
                    {isSelected && <Feather name="check-circle" size={18} color={PRIMARY} style={{ marginLeft: 6 }} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {!loading && tones.length > 0 && (
            <TouchableOpacity
              style={[p.confirmBtn, !selected && { opacity: 0.4 }]}
              onPress={confirmSelect}
              disabled={!selected}
            >
              <Text style={p.confirmText}>Usar este tono</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const p = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet:       { backgroundColor: SURFACE2, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", minHeight: 300 },
  handle:      { width: 36, height: 4, backgroundColor: BORDER2, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8 },
  titleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  title:       { fontSize: 17, fontWeight: "700", color: TEXT },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  loadingText: { fontSize: 13, color: TEXT_SEC, marginTop: 8 },
  emptyText:   { fontSize: 14, color: TEXT_MUTED, textAlign: "center", lineHeight: 20 },
  toneRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 4 },
  toneRowSel:  { backgroundColor: `${PRIMARY}12`, marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 8 },
  toneName:    { flex: 1, fontSize: 14, color: TEXT, fontWeight: "500" },
  previewBtn:  { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  confirmBtn:  { marginHorizontal: 16, marginTop: 12, backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmText: { fontSize: 15, fontWeight: "700", color: "#000" },
});

// ═══════════════════════════════════════════════════════════════════════════
// Pantalla principal
// ═══════════════════════════════════════════════════════════════════════════
export default function AjustesSonido() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [callTone,       setCallToneState] = useState<CallTone>("ring1");
  const [msgTone,        setMsgToneState]  = useState<MsgTone>("ping");
  const [previewing,     setPreviewing]    = useState<string | null>(null);
  const [customCallName, setCustomCallName]= useState<string | null>(null);
  const [customMsgName,  setCustomMsgName] = useState<string | null>(null);

  // Picker modal state
  const [showCallPicker, setShowCallPicker] = useState(false);
  const [showMsgPicker,  setShowMsgPicker]  = useState(false);

  useEffect(() => {
    async function load() {
      const [ct, mt, ccn, cmn] = await Promise.all([
        getCallTone(), getMsgTone(),
        getCustomCallName(), getCustomMsgName(),
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

  const handleCallSystemTone = useCallback(async (tone: SystemTone) => {
    setShowCallPicker(false);
    // Intentar copiar al storage interno si es un path de sistema (más confiable)
    let uri = tone.uri;
    try {
      uri = await persistAudioFile(tone.uri, tone.name + ".ogg", "call");
    } catch { /* usar URI directo */ }
    await setCustomCall(uri, tone.name);
    await setCallTone("custom");
    setCustomCallName(tone.name);
    setCallToneState("custom");
  }, []);

  const handleMsgSystemTone = useCallback(async (tone: SystemTone) => {
    setShowMsgPicker(false);
    let uri = tone.uri;
    try {
      uri = await persistAudioFile(tone.uri, tone.name + ".ogg", "msg");
    } catch { /* usar URI directo */ }
    await setCustomMsg(uri, tone.name);
    await setMsgTone("custom");
    setCustomMsgName(tone.name);
    setMsgToneState("custom");
  }, []);

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

        {/* ── Tono de llamada ─────────────────────────────────────────── */}
        <Text style={s.section}>TONO DE LLAMADA ENTRANTE</Text>

        {CALL_TONES.map((t) => {
          const active = callTone === t.value;
          return (
            <TouchableOpacity key={t.value} style={[s.row, active && s.rowActive]} onPress={() => selectCallTone(t.value)}>
              <View style={[s.iconBox, active && { backgroundColor: PRIMARY + "25" }]}>
                <Feather name={t.icon as any} size={18} color={active ? PRIMARY : TEXT_SEC} />
              </View>
              <Text style={[s.rowLabel, active && { color: PRIMARY }]}>{t.label}</Text>
              <View style={{ flex: 1 }} />
              {previewing === t.value && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
              {active && <Feather name="check-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
          );
        })}

        {/* Tonos del sistema — llamada */}
        {Platform.OS === "android" && (
          <TouchableOpacity style={[s.row, s.sysRow, callTone === "custom" && s.rowActive]} onPress={() => setShowCallPicker(true)}>
            <View style={[s.iconBox, callTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
              <Feather name="smartphone" size={18} color={callTone === "custom" ? PRIMARY : TEXT_SEC} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, callTone === "custom" && { color: PRIMARY }]}>Tono del sistema</Text>
              {customCallName && callTone === "custom" && (
                <Text style={s.subLabel} numberOfLines={1}>{customCallName}</Text>
              )}
            </View>
            {callTone === "custom" && previewing !== "custom_call" && (
              <TouchableOpacity onPress={previewCustomCall} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="play" size={15} color={PRIMARY} />
              </TouchableOpacity>
            )}
            {previewing === "custom_call" && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
            {callTone === "custom" ? (
              <Feather name="check-circle" size={20} color={PRIMARY} />
            ) : (
              <Feather name="chevron-right" size={18} color={TEXT_SEC} />
            )}
          </TouchableOpacity>
        )}

        {/* ── Tono de mensajes ─────────────────────────────────────────── */}
        <Text style={[s.section, { marginTop: 28 }]}>TONO DE NOTIFICACIÓN DE MENSAJES</Text>

        {MSG_TONES.map((t) => {
          const active = msgTone === t.value;
          return (
            <TouchableOpacity key={t.value} style={[s.row, active && s.rowActive]} onPress={() => selectMsgTone(t.value)}>
              <View style={[s.iconBox, active && { backgroundColor: PRIMARY + "25" }]}>
                <Feather name={t.icon as any} size={18} color={active ? PRIMARY : TEXT_SEC} />
              </View>
              <Text style={[s.rowLabel, active && { color: PRIMARY }]}>{t.label}</Text>
              <View style={{ flex: 1 }} />
              {previewing === t.value && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
              {active && <Feather name="check-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
          );
        })}

        {/* Tonos del sistema — mensaje */}
        {Platform.OS === "android" && (
          <TouchableOpacity style={[s.row, s.sysRow, msgTone === "custom" && s.rowActive]} onPress={() => setShowMsgPicker(true)}>
            <View style={[s.iconBox, msgTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
              <Feather name="smartphone" size={18} color={msgTone === "custom" ? PRIMARY : TEXT_SEC} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, msgTone === "custom" && { color: PRIMARY }]}>Tono del sistema</Text>
              {customMsgName && msgTone === "custom" && (
                <Text style={s.subLabel} numberOfLines={1}>{customMsgName}</Text>
              )}
            </View>
            {msgTone === "custom" && previewing !== "custom_msg" && (
              <TouchableOpacity onPress={previewCustomMsg} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="play" size={15} color={PRIMARY} />
              </TouchableOpacity>
            )}
            {previewing === "custom_msg" && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
            {msgTone === "custom" ? (
              <Feather name="check-circle" size={20} color={PRIMARY} />
            ) : (
              <Feather name="chevron-right" size={18} color={TEXT_SEC} />
            )}
          </TouchableOpacity>
        )}

        <Text style={s.hint}>
          Al seleccionar un tono integrado se reproduce una vista previa.
        </Text>
      </ScrollView>

      <SystemTonePicker
        visible={showCallPicker}
        onClose={() => setShowCallPicker(false)}
        onSelect={handleCallSystemTone}
      />
      <SystemTonePicker
        visible={showMsgPicker}
        onClose={() => setShowMsgPicker(false)}
        onSelect={handleMsgSystemTone}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: BG },
  header:    { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER },
  title:     { fontSize: 17, fontWeight: "600", color: TEXT },
  scroll:    { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 20 },
  section:   { fontSize: 11, fontWeight: "700", color: TEXT_SEC, letterSpacing: 1.2, marginBottom: 10 },
  row:       { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8 },
  rowActive: { borderWidth: 1, borderColor: PRIMARY + "60", backgroundColor: SURFACE_SEL },
  sysRow:    { borderWidth: 1, borderColor: BORDER2 },
  iconBox:   { width: 38, height: 38, borderRadius: 10, backgroundColor: BORDER, alignItems: "center", justifyContent: "center" },
  rowLabel:  { fontSize: 15, color: TEXT, fontWeight: "500" },
  subLabel:  { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  playBtn:   { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginRight: 4 },
  hint:      { fontSize: 12, color: TEXT_SEC, textAlign: "center", marginTop: 24 },
});
