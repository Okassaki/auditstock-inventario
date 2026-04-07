import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enviarMensaje, marcarMensajesLeidos, obtenerMensajesConversacion, type MensajeAPI } from "@/utils/api";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
const POLL = 5000;

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
function formatFecha(iso: string) {
  const d = new Date(iso), hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

type ListItem = { type: "fecha"; fecha: string } | { type: "msg"; msg: MensajeAPI };

function buildList(msgs: MensajeAPI[]): ListItem[] {
  const items: ListItem[] = [];
  let fechaActual = "";
  for (const m of msgs) {
    const f = formatFecha(m.creadoAt);
    if (f !== fechaActual) { fechaActual = f; items.push({ type: "fecha", fecha: f }); }
    items.push({ type: "msg", msg: m });
  }
  return items;
}

export default function ChatRoomScreen() {
  const { yo, con, conNombre } = useLocalSearchParams<{ yo: string; con: string; conNombre: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [msgs, setMsgs] = useState<MensajeAPI[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimoIdRef = useRef(0);

  const fetchMsgs = useCallback(async (inicial = false) => {
    if (!yo || !con) return;
    try {
      const desde = inicial ? 0 : ultimoIdRef.current;
      const nuevos = await obtenerMensajesConversacion(yo, con, desde);
      if (nuevos.length > 0) {
        ultimoIdRef.current = nuevos[nuevos.length - 1].id;
        if (inicial) setMsgs(nuevos);
        else setMsgs((prev) => [...prev, ...nuevos]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: !inicial }), 80);
      }
      setError(null);
    } catch (e: any) {
      if (inicial) setError(e?.message ?? "Error de conexión");
    } finally {
      if (inicial) setLoading(false);
    }
  }, [yo, con]);

  useEffect(() => {
    fetchMsgs(true);
    marcarMensajesLeidos(yo!, con!).catch(() => {});
    const interval = setInterval(() => fetchMsgs(false), POLL);
    return () => clearInterval(interval);
  }, [fetchMsgs, yo, con]);

  async function enviar() {
    if (!texto.trim() || enviando || !yo || !con) return;
    const txt = texto.trim();
    setTexto("");
    setEnviando(true);
    try {
      const nuevo = await enviarMensaje(yo, txt, con === "GENERAL" ? undefined : con);
      ultimoIdRef.current = nuevo.id;
      setMsgs((prev) => [...prev, nuevo]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      setError(e?.message ?? "Error al enviar");
      setTexto(txt);
    } finally {
      setEnviando(false);
    }
  }

  const listData = buildList(msgs);

  function renderItem({ item }: { item: ListItem }) {
    if (item.type === "fecha") {
      return (
        <View style={styles.fechaRow}>
          <View style={styles.fechaLine} />
          <Text style={styles.fechaText}>{item.fecha}</Text>
          <View style={styles.fechaLine} />
        </View>
      );
    }
    const { msg } = item;
    const esMio = msg.deTienda === yo;
    return (
      <View style={[styles.bubbleWrap, esMio ? styles.mioWrap : styles.ajenoWrap]}>
        {!esMio && <Text style={styles.senderName}>{msg.deTienda}</Text>}
        <View style={[styles.bubble, esMio ? styles.bubbleMio : styles.bubbleAjeno]}>
          <Text style={[styles.bubbleText, esMio && styles.bubbleTextMio]}>{msg.texto}</Text>
        </View>
        <Text style={[styles.hora, esMio ? styles.horaMio : styles.horaAjeno]}>
          {formatHora(msg.creadoAt)}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 90}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={[styles.avatar, { backgroundColor: C.primary + "30" }]}>
            <Feather name={con === "GENERAL" ? "hash" : "message-circle"} size={16} color={C.primary} />
          </View>
          <View>
            <Text style={styles.headerName}>{conNombre ?? con}</Text>
            <Text style={styles.headerSub}>{con === "GENERAL" ? "Visible para todas las tiendas" : "Chat privado"}</Text>
          </View>
        </View>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color="#FF4757" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={listData}
          keyExtractor={(item, i) => item.type === "fecha" ? `f-${i}` : `m-${item.msg.id}`}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: 8 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={36} color={C.tabIconDefault} />
              <Text style={styles.emptyText}>Aún no hay mensajes</Text>
              <Text style={styles.emptyDesc}>Sé el primero en escribir</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Escribí un mensaje..."
          placeholderTextColor={C.tabIconDefault}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={1000}
          editable={!enviando}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!texto.trim() || enviando) && styles.sendBtnOff]}
          onPress={enviar}
          disabled={!texto.trim() || enviando}
        >
          {enviando
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="send" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  backBtn: { padding: 4 },
  headerInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.textSecondary },
  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF475715", paddingHorizontal: 14, paddingVertical: 8,
    marginHorizontal: 12, marginTop: 8, borderRadius: 8,
  },
  errorText: { fontSize: 13, color: "#FF4757", fontFamily: "Inter_400Regular", flex: 1 },
  list: { padding: 12, gap: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.tabIconDefault },
  fechaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  fechaLine: { flex: 1, height: 1, backgroundColor: C.surfaceBorder },
  fechaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: C.textSecondary },
  bubbleWrap: { marginVertical: 2, maxWidth: "80%" },
  mioWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  ajenoWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMio: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleAjeno: { backgroundColor: C.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.surfaceBorder },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21, color: C.text },
  bubbleTextMio: { color: "#fff" },
  hora: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3, color: C.tabIconDefault },
  horaMio: { marginRight: 4 },
  horaAjeno: { marginLeft: 4 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: C.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: C.text, fontFamily: "Inter_400Regular", fontSize: 15,
    borderWidth: 1, borderColor: C.surfaceBorder,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  sendBtnOff: { opacity: 0.4 },
});
