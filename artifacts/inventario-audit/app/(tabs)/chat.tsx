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
import { useStoreConfig } from "@/context/StoreConfigContext";
import { apiFetch } from "@/utils/api";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
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

function agruparPorFecha(msgs: Mensaje[]) {
  const grupos: { fecha: string; items: Mensaje[] }[] = [];
  let fechaActual = "";
  for (const m of msgs) {
    const f = formatFecha(m.creadoAt);
    if (f !== fechaActual) {
      fechaActual = f;
      grupos.push({ fecha: f, items: [] });
    }
    grupos[grupos.length - 1].items.push(m);
  }
  return grupos;
}

export default function ChatScreen() {
  const { storeConfig } = useStoreConfig();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimoIdRef = useRef(0);

  const fetchMensajes = useCallback(async (inicial = false) => {
    if (!storeConfig) return;
    try {
      const desde = inicial ? 0 : ultimoIdRef.current;
      const nuevos = await apiFetch<Mensaje[]>(
        `/mensajes?tienda=${encodeURIComponent(storeConfig.codigo)}&desde=${desde}`
      );
      if (nuevos.length > 0) {
        ultimoIdRef.current = nuevos[nuevos.length - 1].id;
        if (inicial) {
          setMensajes(nuevos);
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
  }, [storeConfig]);

  useEffect(() => {
    fetchMensajes(true);
    const interval = setInterval(() => fetchMensajes(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMensajes]);

  async function enviar() {
    if (!texto.trim() || !storeConfig || enviando) return;
    const txt = texto.trim();
    setTexto("");
    setEnviando(true);
    try {
      const nuevo = await apiFetch<Mensaje>("/mensajes", {
        method: "POST",
        body: JSON.stringify({ deTienda: storeConfig.codigo, texto: txt }),
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

  const grupos = agruparPorFecha(mensajes);
  const listData: ({ type: "fecha"; fecha: string } | { type: "msg"; msg: Mensaje })[] = [];
  for (const g of grupos) {
    listData.push({ type: "fecha", fecha: g.fecha });
    for (const m of g.items) listData.push({ type: "msg", msg: m });
  }

  function renderItem({ item }: { item: typeof listData[number] }) {
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
    const esMio = msg.deTienda === storeConfig?.codigo;
    const esBroadcast = msg.paraTienda === null;
    return (
      <View style={[styles.bubbleWrap, esMio ? styles.bubbleMioWrap : styles.bubbleAjenoWrap]}>
        {!esMio && (
          <Text style={styles.senderName}>{msg.deTienda}{esBroadcast ? " · Todos" : ""}</Text>
        )}
        <View style={[styles.bubble, esMio ? styles.bubbleMio : styles.bubbleAjeno]}>
          <Text style={[styles.bubbleText, esMio ? styles.bubbleTextMio : styles.bubbleTextAjeno]}>
            {msg.texto}
          </Text>
        </View>
        <Text style={[styles.hora, esMio ? styles.horaMio : styles.horaAjeno]}>
          {formatHora(msg.creadoAt)}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
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
        <Feather name="message-circle" size={18} color={C.primary} />
        <Text style={styles.headerTitle}>Chat de tiendas</Text>
        <Text style={styles.headerSub}>Mensajes visibles para todas las tiendas</Text>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color="#FF4757" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        ref={flatRef}
        data={listData}
        keyExtractor={(item, i) => item.type === "fecha" ? `f-${item.fecha}-${i}` : `m-${item.msg.id}`}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 8 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={40} color={C.tabIconDefault} />
            <Text style={styles.emptyText}>Aún no hay mensajes</Text>
            <Text style={styles.emptyDesc}>Sé el primero en escribir algo</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Escribí un mensaje..."
          placeholderTextColor={C.tabIconDefault}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={1000}
          returnKeyType="default"
          editable={!enviando}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!texto.trim() || enviando) && styles.sendBtnDisabled]}
          onPress={enviar}
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
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text, flex: 1 },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.textSecondary },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF475715",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: { fontSize: 13, color: "#FF4757", fontFamily: "Inter_400Regular", flex: 1 },
  list: { padding: 12, gap: 4 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.tabIconDefault },
  fechaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  fechaLine: { flex: 1, height: 1, backgroundColor: C.surfaceBorder },
  fechaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: C.textSecondary },
  bubbleWrap: { marginVertical: 3, maxWidth: "80%" },
  bubbleMioWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleAjenoWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMio: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleAjeno: { backgroundColor: C.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.surfaceBorder },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTextMio: { color: "#fff" },
  bubbleTextAjeno: { color: C.text },
  hora: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3, color: C.tabIconDefault },
  horaMio: { marginRight: 4 },
  horaAjeno: { marginLeft: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: C.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: C.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
