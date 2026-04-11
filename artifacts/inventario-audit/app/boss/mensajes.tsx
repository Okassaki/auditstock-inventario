import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { obtenerConversaciones, obtenerTiendas, type ConversacionAPI, type TiendaAPI } from "@/utils/api";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const SURFACE_ELEV = "#221C40";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const DANGER = "#FF4757";
const POLL = 10000;
const YO = "JEFE";

function formatTime(iso: string) {
  const d = new Date(iso), hoy = new Date();
  if (d.toDateString() === hoy.toDateString())
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

interface ContactItem {
  id: string;
  nombre: string;
  icono: FeatherIconName;
  ultimoMensaje?: ConversacionAPI["ultimoMensaje"];
  noLeidos: number;
  fijo?: boolean;
}

export default function BossMensajesScreen() {
  const router = useRouter();
  const [tiendas, setTiendas] = useState<TiendaAPI[]>([]);
  const [conversaciones, setConversaciones] = useState<ConversacionAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async (manual = false, attempt = 0) => {
    if (manual) setRefreshing(true);
    try {
      const [ts, cs] = await Promise.all([
        obtenerTiendas(),
        obtenerConversaciones(YO),
      ]);
      setTiendas(ts);
      setConversaciones(cs);
      setError(null);
    } catch {
      if (attempt === 0 && !manual) {
        retryRef.current = setTimeout(() => fetchAll(false, 1), 3000);
      } else {
        setError("Sin conexión al servidor");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), POLL);
    const sub = DeviceEventEmitter.addListener("chatNewMessage", () => fetchAll());
    return () => {
      clearInterval(interval);
      sub.remove();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [fetchAll]);

  const convMap = new Map(conversaciones.map((c) => [c.contraparte, c]));

  const contactos: ContactItem[] = [];

  // General siempre primero
  const generalConv = convMap.get("GENERAL");
  contactos.push({
    id: "GENERAL",
    nombre: "General",
    icono: "hash",
    ultimoMensaje: generalConv?.ultimoMensaje,
    noLeidos: generalConv?.noLeidos ?? 0,
    fijo: true,
  });

  // Tiendas
  const tiendaItems = tiendas.map((t) => {
    const conv = convMap.get(t.codigo);
    return {
      id: t.codigo,
      nombre: t.nombre,
      icono: "map-pin",
      ultimoMensaje: conv?.ultimoMensaje,
      noLeidos: conv?.noLeidos ?? 0,
    } as ContactItem;
  });

  tiendaItems.sort((a, b) => {
    if (a.ultimoMensaje && b.ultimoMensaje) return b.ultimoMensaje.id - a.ultimoMensaje.id;
    if (a.ultimoMensaje) return -1;
    if (b.ultimoMensaje) return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  contactos.push(...tiendaItems);

  // Conversations not linked to known tiendas (other senders)
  const knownIds = new Set(["GENERAL", ...tiendas.map((t) => t.codigo)]);
  for (const c of conversaciones) {
    if (!knownIds.has(c.contraparte)) {
      contactos.push({
        id: c.contraparte,
        nombre: c.contraparte,
        icono: "user",
        ultimoMensaje: c.ultimoMensaje,
        noLeidos: c.noLeidos,
      });
    }
  }

  function abrirChat(item: ContactItem) {
    router.push({
      pathname: "/boss/chat-room",
      params: { con: item.id, conNombre: item.nombre },
    });
  }

  function renderItem({ item }: { item: ContactItem }) {
    const hasMsg = !!item.ultimoMensaje;
    const previewTxt = hasMsg
      ? (item.ultimoMensaje!.deTienda === YO ? `Vos: ${item.ultimoMensaje!.texto}` : `${item.ultimoMensaje!.deTienda}: ${item.ultimoMensaje!.texto}`)
      : "Sin mensajes aún";

    return (
      <TouchableOpacity style={styles.row} onPress={() => abrirChat(item)} activeOpacity={0.7}>
        <View style={[styles.avatar, item.fijo && { backgroundColor: `${BOSS_COLOR}25` }]}>
          <Feather name={item.icono} size={18} color={item.fijo ? BOSS_COLOR : TEXT_SEC} />
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowTop}>
            <Text style={styles.rowNombre} numberOfLines={1}>{item.nombre}</Text>
            {hasMsg && <Text style={styles.rowTime}>{formatTime(item.ultimoMensaje!.creadoAt)}</Text>}
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.rowPreview, !hasMsg && styles.rowPreviewEmpty]} numberOfLines={1}>
              {previewTxt}
            </Text>
            {item.noLeidos > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.noLeidos > 99 ? "99+" : item.noLeidos}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={BOSS_COLOR} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="message-circle" size={18} color={BOSS_COLOR} />
        <Text style={styles.headerTitle}>Mensajes</Text>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={contactos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} tintColor={BOSS_COLOR} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={40} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>No hay tiendas registradas</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: SURFACE_BORDER,
    backgroundColor: SURFACE,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: TEXT },
  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: `${DANGER}15`, paddingHorizontal: 14, paddingVertical: 8,
    marginHorizontal: 12, marginTop: 8, borderRadius: 8,
  },
  errorText: { fontSize: 13, color: DANGER, fontFamily: "Inter_400Regular", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: SURFACE_ELEV,
    alignItems: "center", justifyContent: "center",
  },
  rowInfo: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowNombre: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT, flex: 1, marginRight: 8 },
  rowTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowPreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_SEC, flex: 1, marginRight: 8 },
  rowPreviewEmpty: { color: TEXT_MUTED, fontStyle: "italic" },
  badge: {
    backgroundColor: BOSS_COLOR, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  separator: { height: 1, backgroundColor: SURFACE_BORDER, marginLeft: 74 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
});
