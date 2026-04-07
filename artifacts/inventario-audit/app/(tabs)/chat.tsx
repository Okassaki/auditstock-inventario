import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useStoreConfig } from "@/context/StoreConfigContext";
import { obtenerConversaciones, obtenerTiendas, type ConversacionAPI, type TiendaAPI } from "@/utils/api";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
const POLL = 10000;

function formatTime(iso: string) {
  const d = new Date(iso), hoy = new Date();
  if (d.toDateString() === hoy.toDateString())
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

interface ContactItem {
  id: string;
  nombre: string;
  icono: string;
  ultimoMensaje?: ConversacionAPI["ultimoMensaje"];
  noLeidos: number;
  fijo?: boolean;
}

export default function ChatListScreen() {
  const { storeConfig } = useStoreConfig();
  const router = useRouter();
  const [tiendas, setTiendas] = useState<TiendaAPI[]>([]);
  const [conversaciones, setConversaciones] = useState<ConversacionAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (manual = false) => {
    if (!storeConfig) return;
    if (manual) setRefreshing(true);
    try {
      const [ts, cs] = await Promise.all([
        obtenerTiendas(),
        obtenerConversaciones(storeConfig.codigo),
      ]);
      setTiendas(ts);
      setConversaciones(cs);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeConfig]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), POLL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const convMap = new Map(conversaciones.map((c) => [c.contraparte, c]));

  // Armar lista de contactos
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

  // JEFE
  const jefeConv = convMap.get("JEFE");
  contactos.push({
    id: "JEFE",
    nombre: "Jefe",
    icono: "shield",
    ultimoMensaje: jefeConv?.ultimoMensaje,
    noLeidos: jefeConv?.noLeidos ?? 0,
    fijo: true,
  });

  // Otras tiendas (excluir la propia)
  const otrasTiendas = tiendas.filter((t) => t.codigo !== storeConfig?.codigo);
  const tiendaConversaciones = otrasTiendas.map((t) => {
    const conv = convMap.get(t.codigo);
    return {
      id: t.codigo,
      nombre: t.nombre,
      icono: "map-pin",
      ultimoMensaje: conv?.ultimoMensaje,
      noLeidos: conv?.noLeidos ?? 0,
    } as ContactItem;
  });

  // Ordenar tiendas: primero con mensajes (más reciente), luego sin mensajes
  tiendaConversaciones.sort((a, b) => {
    if (a.ultimoMensaje && b.ultimoMensaje)
      return b.ultimoMensaje.id - a.ultimoMensaje.id;
    if (a.ultimoMensaje) return -1;
    if (b.ultimoMensaje) return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  contactos.push(...tiendaConversaciones);

  function abrirChat(item: ContactItem) {
    router.push({
      pathname: "/chat-room",
      params: { yo: storeConfig!.codigo, con: item.id, conNombre: item.nombre },
    });
  }

  function renderItem({ item }: { item: ContactItem }) {
    const hasMsg = !!item.ultimoMensaje;
    const previewTxt = hasMsg
      ? (item.ultimoMensaje!.deTienda === storeConfig?.codigo ? `Vos: ${item.ultimoMensaje!.texto}` : item.ultimoMensaje!.texto)
      : "Sin mensajes aún";

    return (
      <TouchableOpacity style={styles.row} onPress={() => abrirChat(item)} activeOpacity={0.7}>
        <View style={[styles.avatar, item.fijo && { backgroundColor: C.primary + "25" }]}>
          <Feather name={item.icono as any} size={18} color={item.fijo ? C.primary : C.textSecondary} />
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
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="message-circle" size={18} color={C.primary} />
        <Text style={styles.headerTitle}>Mensajes</Text>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color="#FF4757" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={contactos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} tintColor={C.primary} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={40} color={C.tabIconDefault} />
            <Text style={styles.emptyText}>No hay contactos</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.text },
  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF475715", paddingHorizontal: 14, paddingVertical: 8,
    marginHorizontal: 12, marginTop: 8, borderRadius: 8,
  },
  errorText: { fontSize: 13, color: "#FF4757", fontFamily: "Inter_400Regular", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  rowInfo: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowNombre: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.text, flex: 1, marginRight: 8 },
  rowTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textSecondary },
  rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowPreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textSecondary, flex: 1, marginRight: 8 },
  rowPreviewEmpty: { color: C.tabIconDefault, fontStyle: "italic" },
  badge: {
    backgroundColor: C.primary, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  separator: { height: 1, backgroundColor: C.surfaceBorder, marginLeft: 74 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.tabIconDefault },
});
