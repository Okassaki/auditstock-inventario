import { Feather } from "@expo/vector-icons";
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
import { apiFetch } from "@/utils/api";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const DANGER = "#FF4757";
const POLL_INTERVAL = 5000;

interface Mensaje {
  id: number;
  deTienda: string;
  paraTienda: string | null;
  texto: string;
  leido: boolean;
  creadoAt: string;
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatFecha(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

const TIENDA_COLORS = [
  "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#3B82F6", "#84CC16", "#F97316", "#A855F7",
];
const colorMap: Record<string, string> = {};
let colorIdx = 0;
function colorParaTienda(codigo: string) {
  if (!colorMap[codigo]) {
    colorMap[codigo] = TIENDA_COLORS[colorIdx % TIENDA_COLORS.length];
    colorIdx++;
  }
  return colorMap[codigo];
}

export default function MensajesJefeScreen() {
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimoIdRef = useRef(0);

  const fetchMensajes = useCallback(async (inicial = false) => {
    try {
      const desde = inicial ? 0 : ultimoIdRef.current;
      const nuevos = await apiFetch<Mensaje[]>(`/mensajes?desde=${desde}`);
      if (nuevos.length > 0) {
        ultimoIdRef.current = nuevos[nuevos.length - 1].id;
        if (inicial) {
          setMensajes(nuevos.slice().reverse());
        } else {
          setMensajes((prev) => [...prev, ...nuevos]);
        }
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: !inicial }), 100);
      }
      setError(null);
    } catch (e: any) {
      if (inicial) setError(e?.message ?? "Error de conexión");
    } finally {
      if (inicial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMensajes(true);
    const interval = setInterval(() => fetchMensajes(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMensajes]);

  async function enviarATodos() {
    if (!texto.trim() || enviando) return;
    const txt = texto.trim();
    setTexto("");
    setEnviando(true);
    try {
      const nuevo = await apiFetch<Mensaje>("/mensajes", {
        method: "POST",
        body: JSON.stringify({ deTienda: "JEFE", texto: txt }),
      });
      ultimoIdRef.current = nuevo.id;
      setMensajes((prev) => [...prev, nuevo]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setError(e?.message ?? "Error al enviar");
      setTexto(txt);
    } finally {
      setEnviando(false);
    }
  }

  type ListItem =
    | { type: "fecha"; fecha: string }
    | { type: "msg"; msg: Mensaje };

  function buildList(): ListItem[] {
    const items: ListItem[] = [];
    let fechaActual = "";
    for (const m of mensajes) {
      const f = formatFecha(m.creadoAt);
      if (f !== fechaActual) { fechaActual = f; items.push({ type: "fecha", fecha: f }); }
      items.push({ type: "msg", msg: m });
    }
    return items;
  }

  const listData = buildList();

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
    const esJefe = msg.deTienda === "JEFE";
    const color = esJefe ? BOSS_COLOR : colorParaTienda(msg.deTienda);
    return (
      <View style={[styles.bubbleWrap, esJefe ? styles.bubbleMioWrap : styles.bubbleAjenoWrap]}>
        {!esJefe && (
          <Text style={[styles.senderName, { color }]}>{msg.deTienda}</Text>
        )}
        <View style={[
          styles.bubble,
          esJefe ? styles.bubbleMio : styles.bubbleAjeno,
          !esJefe && { borderColor: color + "40" },
        ]}>
          <Text style={[styles.bubbleText, esJefe ? styles.bubbleTextMio : { color: TEXT }]}>
            {msg.texto}
          </Text>
        </View>
        <Text style={[styles.hora, esJefe ? styles.horaMio : styles.horaAjeno]}>
          {formatHora(msg.creadoAt)}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BOSS_COLOR} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 90}
    >
      <View style={styles.header}>
        <Feather name="message-circle" size={18} color={BOSS_COLOR} />
        <Text style={styles.headerTitle}>Mensajes</Text>
        <Text style={styles.headerSub}>Todas las tiendas</Text>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        ref={flatRef}
        data={listData}
        keyExtractor={(item, i) => item.type === "fecha" ? `f-${i}` : `m-${item.msg.id}`}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 8 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={40} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>Sin mensajes</Text>
            <Text style={styles.emptyDesc}>Las tiendas no han enviado mensajes aún</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Escribir a todas las tiendas..."
          placeholderTextColor={TEXT_MUTED}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={1000}
          editable={!enviando}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!texto.trim() || enviando) && styles.sendBtnDisabled]}
          onPress={enviarATodos}
          disabled={!texto.trim() || enviando}
          activeOpacity={0.7}
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
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE_BORDER,
    backgroundColor: SURFACE,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT, flex: 1 },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${DANGER}15`,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: { fontSize: 13, color: DANGER, fontFamily: "Inter_400Regular", flex: 1 },
  list: { padding: 12, gap: 4 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  fechaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  fechaLine: { flex: 1, height: 1, backgroundColor: SURFACE_BORDER },
  fechaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: TEXT_SEC },
  bubbleWrap: { marginVertical: 3, maxWidth: "80%" },
  bubbleMioWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleAjenoWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMio: { backgroundColor: BOSS_COLOR, borderBottomRightRadius: 4 },
  bubbleAjeno: { backgroundColor: SURFACE, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: SURFACE_BORDER },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTextMio: { color: "#fff" },
  hora: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3, color: TEXT_MUTED },
  horaMio: { marginRight: 4 },
  horaAjeno: { marginLeft: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: SURFACE_BORDER,
    backgroundColor: SURFACE,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: TEXT,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BOSS_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
