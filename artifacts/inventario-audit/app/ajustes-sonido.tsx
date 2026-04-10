import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  getSystemCallName,
  getSystemCallUri,
  getSystemMsgName,
  getSystemMsgUri,
  getMsgTone,
  persistAudioFile,
  previewSound,
  setCallTone,
  setCustomCall,
  setCustomMsg,
  setMsgTone,
  setSystemCall,
  setSystemMsg,
  stopRingtone,
} from "@/utils/ringtone";

const BG          = "#0A0F1E";
const SURFACE     = "#111827";
const SURFACE_SEL = "#0D1B2A";
const BORDER      = "#1F2937";
const BORDER2     = "#2A3547";
const TEXT        = "#F0F4FF";
const TEXT_SEC    = "#8B98B8";
const TEXT_MUTED  = "#4B5563";
const PRIMARY     = "#00D4FF";
const GREEN       = "#22C55E";

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

const PKG = "com.auditstock.inventario";

async function recreateChannel(
  channelId: "llamadas" | "mensajes",
  soundUri: string | null
) {
  try {
    await Notifications.deleteNotificationChannelAsync(channelId);
  } catch {}

  if (channelId === "llamadas") {
    await Notifications.setNotificationChannelAsync("llamadas", {
      name: "Llamadas",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#8B5CF6",
      sound: soundUri ?? "default",
      enableVibrate: true,
    });
  } else {
    await Notifications.setNotificationChannelAsync("mensajes", {
      name: "Mensajes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D4FF",
      sound: soundUri ?? "default",
      enableVibrate: true,
    });
  }
}

export default function AjustesSonido() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [callTone,        setCallToneState]  = useState<CallTone>("ring1");
  const [msgTone,         setMsgToneState]   = useState<MsgTone>("ping");
  const [previewing,      setPreviewing]     = useState<string | null>(null);
  const [customCallName,  setCustomCallName] = useState<string | null>(null);
  const [customMsgName,   setCustomMsgName]  = useState<string | null>(null);
  const [systemCallName,  setSystemCallName] = useState<string | null>(null);
  const [systemMsgName,   setSystemMsgName]  = useState<string | null>(null);
  const [pickingCall,     setPickingCall]    = useState(false);
  const [pickingMsg,      setPickingMsg]     = useState(false);
  const [pickingSysCall,  setPickingSysCall] = useState(false);
  const [pickingSysMsg,   setPickingSysMsg]  = useState(false);

  useEffect(() => {
    async function load() {
      const [ct, mt, ccn, cmn, scn, smn] = await Promise.all([
        getCallTone(), getMsgTone(),
        getCustomCallName(), getCustomMsgName(),
        getSystemCallName(), getSystemMsgName(),
      ]);
      setCallToneState(ct);
      setMsgToneState(mt);
      setCustomCallName(ccn);
      setCustomMsgName(cmn);
      setSystemCallName(scn);
      setSystemMsgName(smn);
    }
    load();
    return () => { stopRingtone().catch(() => {}); };
  }, []);

  async function selectCallTone(v: CallTone) {
    setCallToneState(v);
    await setCallTone(v);
    if (v !== "silent" && v !== "custom" && v !== "system") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 3500);
    }
  }

  async function selectMsgTone(v: MsgTone) {
    setMsgToneState(v);
    await setMsgTone(v);
    if (v !== "silent" && v !== "custom" && v !== "system") {
      setPreviewing(v);
      await previewSound(v);
      setTimeout(() => setPreviewing(null), 2000);
    }
  }

  // ── Sistema: picker nativo de Android ────────────────────────────────────

  async function pickSystemCallTone() {
    if (Platform.OS !== "android") return;
    setPickingSysCall(true);
    try {
      const result = await IntentLauncher.startActivityAsync(
        "android.intent.action.RINGTONE_PICKER",
        {
          extra: {
            "android.intent.extra.RINGTONE_TYPE": 1,        // TYPE_RINGTONE
            "android.intent.extra.RINGTONE_SHOW_SILENT": true,
            "android.intent.extra.RINGTONE_SHOW_DEFAULT": true,
            "android.intent.extra.RINGTONE_TITLE": "Tono de llamada",
          },
        }
      );
      if (result.resultCode === -1) {
        const uri: string | undefined = result.extra?.["android.intent.extra.RINGTONE_URI"];
        const name: string = uri
          ? (uri.split("/").pop() ?? "Tono del sistema")
          : "Silencio";
        const finalUri = uri ?? "silent";
        await setSystemCall(finalUri, name);
        await setCallTone("system");
        setSystemCallName(name);
        setCallToneState("system");
        if (uri) {
          setPreviewing("system_call");
          await previewSound("system", uri);
          setTimeout(() => setPreviewing(null), 4000);
        }
        await recreateChannel("llamadas", uri ?? null);
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo abrir el selector de tonos del sistema.");
    } finally {
      setPickingSysCall(false);
    }
  }

  async function pickSystemMsgTone() {
    if (Platform.OS !== "android") return;
    setPickingSysMsg(true);
    try {
      const result = await IntentLauncher.startActivityAsync(
        "android.intent.action.RINGTONE_PICKER",
        {
          extra: {
            "android.intent.extra.RINGTONE_TYPE": 2,        // TYPE_NOTIFICATION
            "android.intent.extra.RINGTONE_SHOW_SILENT": true,
            "android.intent.extra.RINGTONE_SHOW_DEFAULT": true,
            "android.intent.extra.RINGTONE_TITLE": "Tono de notificación",
          },
        }
      );
      if (result.resultCode === -1) {
        const uri: string | undefined = result.extra?.["android.intent.extra.RINGTONE_URI"];
        const name: string = uri
          ? (uri.split("/").pop() ?? "Tono del sistema")
          : "Silencio";
        const finalUri = uri ?? "silent";
        await setSystemMsg(finalUri, name);
        await setMsgTone("system");
        setSystemMsgName(name);
        setMsgToneState("system");
        if (uri) {
          setPreviewing("system_msg");
          await previewSound("system", uri);
          setTimeout(() => setPreviewing(null), 3000);
        }
        await recreateChannel("mensajes", uri ?? null);
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo abrir el selector de tonos del sistema.");
    } finally {
      setPickingSysMsg(false);
    }
  }

  // ── Archivo personalizado ─────────────────────────────────────────────────

  async function pickCallAudio() {
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
      setPreviewing("custom_call");
      await previewSound("custom", uri);
      setTimeout(() => setPreviewing(null), 4000);
    } catch {
      // cancelado o error
    } finally {
      setPickingCall(false);
    }
  }

  async function pickMsgAudio() {
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
      setPreviewing("custom_msg");
      await previewSound("custom", uri);
      setTimeout(() => setPreviewing(null), 4000);
    } catch {
      // cancelado o error
    } finally {
      setPickingMsg(false);
    }
  }

  // ── Previsualización de tonos guardados ───────────────────────────────────

  async function previewSystemCall() {
    const uri = await getSystemCallUri();
    if (!uri || uri === "silent") return;
    setPreviewing("system_call");
    await previewSound("system", uri);
    setTimeout(() => setPreviewing(null), 4000);
  }

  async function previewSystemMsg() {
    const uri = await getSystemMsgUri();
    if (!uri || uri === "silent") return;
    setPreviewing("system_msg");
    await previewSound("system", uri);
    setTimeout(() => setPreviewing(null), 3000);
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

  // ── Ajustes del sistema Android ───────────────────────────────────────────

  async function openChannelSettings(channelId: "llamadas" | "mensajes") {
    if (Platform.OS !== "android") return;
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.CHANNEL_NOTIFICATION_SETTINGS",
        {
          data: `package:${PKG}`,
          extra: {
            "android.provider.extra.APP_PACKAGE": PKG,
            "android.provider.extra.CHANNEL_ID": channelId,
          },
        }
      );
    } catch {
      await Linking.openSettings();
    }
  }

  async function openBatterySettings() {
    if (Platform.OS !== "android") return;
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        { data: `package:${PKG}` }
      );
    } catch {
      try {
        await Linking.openURL("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
      } catch {
        await Linking.openSettings();
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.title}>Ajustes de sonido</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ══ TONO DE LLAMADA ══════════════════════════════════════════════ */}
        <Text style={s.section}>TONO DE LLAMADA ENTRANTE</Text>

        {/* Sistema — picker nativo al estilo WhatsApp */}
        {Platform.OS === "android" && (
          <TouchableOpacity
            style={[s.row, s.systemRow, callTone === "system" && s.rowActive]}
            onPress={pickSystemCallTone}
            disabled={pickingSysCall}
          >
            <View style={[s.iconBox, callTone === "system" && { backgroundColor: GREEN + "25" }]}>
              {pickingSysCall
                ? <ActivityIndicator size={18} color={GREEN} />
                : <Feather name="smartphone" size={18} color={callTone === "system" ? GREEN : TEXT_SEC} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, callTone === "system" && { color: GREEN }]}>
                Tonos del sistema
              </Text>
              {systemCallName && callTone === "system"
                ? <Text style={s.subLabel} numberOfLines={1}>{systemCallName}</Text>
                : <Text style={s.subHint}>Ringtones instalados en el dispositivo</Text>
              }
            </View>
            {callTone === "system" && !pickingSysCall && previewing !== "system_call" && (
              <TouchableOpacity onPress={previewSystemCall} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="play" size={15} color={GREEN} />
              </TouchableOpacity>
            )}
            {previewing === "system_call" && <Feather name="volume-2" size={15} color={GREEN} style={{ marginRight: 8 }} />}
            {callTone === "system"
              ? <Feather name="check-circle" size={20} color={GREEN} />
              : <Feather name="chevron-right" size={18} color={TEXT_SEC} />}
          </TouchableOpacity>
        )}

        {/* Tonos bundled */}
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

        {/* Archivo del dispositivo — llamada */}
        <TouchableOpacity
          style={[s.row, s.customRow, callTone === "custom" && s.rowActive]}
          onPress={pickCallAudio}
          disabled={pickingCall}
        >
          <View style={[s.iconBox, callTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
            {pickingCall
              ? <ActivityIndicator size={18} color={PRIMARY} />
              : <Feather name="folder" size={18} color={callTone === "custom" ? PRIMARY : TEXT_SEC} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, callTone === "custom" && { color: PRIMARY }]}>
              Elegir archivo de audio
            </Text>
            {customCallName && callTone === "custom"
              ? <Text style={s.subLabel} numberOfLines={1}>{customCallName}</Text>
              : <Text style={s.subHint}>MP3, AAC, WAV, OGG…</Text>
            }
          </View>
          {callTone === "custom" && !pickingCall && previewing !== "custom_call" && (
            <TouchableOpacity onPress={previewCustomCall} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="play" size={15} color={PRIMARY} />
            </TouchableOpacity>
          )}
          {previewing === "custom_call" && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
          {callTone === "custom"
            ? <Feather name="check-circle" size={20} color={PRIMARY} />
            : <Feather name="chevron-right" size={18} color={TEXT_SEC} />
          }
        </TouchableOpacity>

        {/* ══ TONO DE MENSAJES ═════════════════════════════════════════════ */}
        <Text style={[s.section, { marginTop: 28 }]}>TONO DE NOTIFICACIÓN DE MENSAJES</Text>

        {/* Sistema — picker nativo al estilo WhatsApp */}
        {Platform.OS === "android" && (
          <TouchableOpacity
            style={[s.row, s.systemRow, msgTone === "system" && s.rowActive]}
            onPress={pickSystemMsgTone}
            disabled={pickingSysMsg}
          >
            <View style={[s.iconBox, msgTone === "system" && { backgroundColor: GREEN + "25" }]}>
              {pickingSysMsg
                ? <ActivityIndicator size={18} color={GREEN} />
                : <Feather name="smartphone" size={18} color={msgTone === "system" ? GREEN : TEXT_SEC} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, msgTone === "system" && { color: GREEN }]}>
                Tonos del sistema
              </Text>
              {systemMsgName && msgTone === "system"
                ? <Text style={s.subLabel} numberOfLines={1}>{systemMsgName}</Text>
                : <Text style={s.subHint}>Notificaciones instaladas en el dispositivo</Text>
              }
            </View>
            {msgTone === "system" && !pickingSysMsg && previewing !== "system_msg" && (
              <TouchableOpacity onPress={previewSystemMsg} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="play" size={15} color={GREEN} />
              </TouchableOpacity>
            )}
            {previewing === "system_msg" && <Feather name="volume-2" size={15} color={GREEN} style={{ marginRight: 8 }} />}
            {msgTone === "system"
              ? <Feather name="check-circle" size={20} color={GREEN} />
              : <Feather name="chevron-right" size={18} color={TEXT_SEC} />}
          </TouchableOpacity>
        )}

        {/* Tonos bundled */}
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

        {/* Archivo del dispositivo — mensaje */}
        <TouchableOpacity
          style={[s.row, s.customRow, msgTone === "custom" && s.rowActive]}
          onPress={pickMsgAudio}
          disabled={pickingMsg}
        >
          <View style={[s.iconBox, msgTone === "custom" && { backgroundColor: PRIMARY + "25" }]}>
            {pickingMsg
              ? <ActivityIndicator size={18} color={PRIMARY} />
              : <Feather name="folder" size={18} color={msgTone === "custom" ? PRIMARY : TEXT_SEC} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, msgTone === "custom" && { color: PRIMARY }]}>
              Elegir archivo de audio
            </Text>
            {customMsgName && msgTone === "custom"
              ? <Text style={s.subLabel} numberOfLines={1}>{customMsgName}</Text>
              : <Text style={s.subHint}>MP3, AAC, WAV, OGG…</Text>
            }
          </View>
          {msgTone === "custom" && !pickingMsg && previewing !== "custom_msg" && (
            <TouchableOpacity onPress={previewCustomMsg} style={s.playBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="play" size={15} color={PRIMARY} />
            </TouchableOpacity>
          )}
          {previewing === "custom_msg" && <Feather name="volume-2" size={15} color={PRIMARY} style={{ marginRight: 8 }} />}
          {msgTone === "custom"
            ? <Feather name="check-circle" size={20} color={PRIMARY} />
            : <Feather name="chevron-right" size={18} color={TEXT_SEC} />
          }
        </TouchableOpacity>

        {/* ══ CONFIGURACIÓN DEL SISTEMA ANDROID ═══════════════════════════ */}
        {Platform.OS === "android" && (
          <>
            <Text style={[s.section, { marginTop: 32 }]}>CONFIGURACIÓN DEL SISTEMA</Text>

            <TouchableOpacity style={s.row} onPress={() => openChannelSettings("llamadas")}>
              <View style={s.iconBox}>
                <Feather name="bell" size={18} color={TEXT_SEC} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Canal: Llamadas</Text>
                <Text style={s.subLabel}>Vibración, LED y sonido cuando la app está cerrada</Text>
              </View>
              <Feather name="external-link" size={16} color={TEXT_SEC} />
            </TouchableOpacity>

            <TouchableOpacity style={s.row} onPress={() => openChannelSettings("mensajes")}>
              <View style={s.iconBox}>
                <Feather name="message-circle" size={18} color={TEXT_SEC} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Canal: Mensajes</Text>
                <Text style={s.subLabel}>Vibración, LED y sonido cuando la app está cerrada</Text>
              </View>
              <Feather name="external-link" size={16} color={TEXT_SEC} />
            </TouchableOpacity>

            <TouchableOpacity style={[s.row, { marginTop: 8 }]} onPress={openBatterySettings}>
              <View style={s.iconBox}>
                <Feather name="battery-charging" size={18} color={TEXT_SEC} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Notificaciones en segundo plano</Text>
                <Text style={s.subLabel}>Desactivar optimización de batería</Text>
              </View>
              <Feather name="external-link" size={16} color={TEXT_SEC} />
            </TouchableOpacity>

            <View style={[s.tipBox, { marginTop: 12 }]}>
              <Feather name="info" size={14} color={PRIMARY} style={{ marginTop: 1 }} />
              <Text style={s.tipText}>
                El tono del sistema se usa cuando la app está <Text style={{ fontWeight: "700" }}>abierta</Text>. Para cambiar el sonido de las notificaciones push (app cerrada), usá los botones de canal de arriba.
              </Text>
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  header:     { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER },
  title:      { fontSize: 17, fontWeight: "600", color: TEXT },
  scroll:     { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 20 },
  section:    { fontSize: 11, fontWeight: "700", color: TEXT_SEC, letterSpacing: 1.2, marginBottom: 10 },
  row:        { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8 },
  rowActive:  { borderWidth: 1, borderColor: PRIMARY + "60", backgroundColor: SURFACE_SEL },
  systemRow:  { borderWidth: 1, borderColor: GREEN + "40" },
  customRow:  { borderWidth: 1, borderColor: BORDER2 },
  iconBox:    { width: 38, height: 38, borderRadius: 10, backgroundColor: BORDER, alignItems: "center", justifyContent: "center" },
  rowLabel:   { fontSize: 15, color: TEXT, fontWeight: "500" },
  subLabel:   { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  subHint:    { fontSize: 11, color: TEXT_MUTED, marginTop: 2, fontStyle: "italic" },
  playBtn:    { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginRight: 4 },
  tipBox:     { flexDirection: "row", gap: 8, backgroundColor: `${PRIMARY}10`, borderRadius: 10, padding: 12, marginTop: 20, borderWidth: 1, borderColor: `${PRIMARY}25` },
  tipText:    { flex: 1, fontSize: 12, color: TEXT_SEC, lineHeight: 18 },
});
