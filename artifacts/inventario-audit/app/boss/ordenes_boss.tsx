import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { obtenerTodasOrdenes, actualizarOrden, type OrdenTrabajoAPI } from "@/utils/api";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const DANGER = "#FF4757";

type EstadoOrden = OrdenTrabajoAPI["estado"];

const ESTADOS = [
  { value: "pendiente" as EstadoOrden, label: "Pendiente", color: "#FFB800" },
  { value: "en_proceso" as EstadoOrden, label: "En proceso", color: "#3B82F6" },
  { value: "listo" as EstadoOrden, label: "Listo", color: "#00C896" },
  { value: "entregado" as EstadoOrden, label: "Entregado", color: "#8B5CF6" },
  { value: "cancelado" as EstadoOrden, label: "Cancelado", color: "#FF4757" },
];

function estadoInfo(e: EstadoOrden) { return ESTADOS.find((s) => s.value === e) ?? ESTADOS[0]; }

export default function BossOrdenesScreen() {
  const insets = useSafeAreaInsets();
  const [ordenes, setOrdenes] = useState<OrdenTrabajoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoOrden | "todas">("todas");
  const [detalle, setDetalle] = useState<OrdenTrabajoAPI | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const fetchOrdenes = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = await obtenerTodasOrdenes();
      setOrdenes(data);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);

  async function cambiarEstado(orden: OrdenTrabajoAPI, estado: EstadoOrden) {
    setActualizando(true);
    try {
      const updated = await actualizarOrden(orden.tiendaCodigo, orden.id, { estado });
      setOrdenes((prev) => prev.map((o) => o.id === orden.id ? updated : o));
      setDetalle(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo actualizar");
    } finally {
      setActualizando(false);
    }
  }

  const ordenesFiltradas = filtro === "todas" ? ordenes : ordenes.filter((o) => o.estado === filtro);

  const porEstado: Record<string, number> = {};
  ordenes.forEach((o) => { porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1; });

  return (
    <View style={[styles.container, { paddingTop: 8 }]}>
      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchOrdenes(true)}><Feather name="refresh-cw" size={13} color={TEXT_MUTED} /></TouchableOpacity>
        </View>
      )}

      <View style={styles.statsRow}>
        {ESTADOS.map((e) => (
          <View key={e.value} style={[styles.statItem, { backgroundColor: `${e.color}15`, borderColor: `${e.color}30` }]}>
            <Text style={[styles.statNum, { color: e.color }]}>{porEstado[e.value] ?? 0}</Text>
            <Text style={[styles.statLabel, { color: e.color }]}>{e.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}>
        {[{ value: "todas", label: "Todas" }, ...ESTADOS.map((e) => ({ value: e.value, label: e.label }))].map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filtroBtn, { borderColor: filtro === f.value ? BOSS_COLOR : SURFACE_BORDER, backgroundColor: filtro === f.value ? `${BOSS_COLOR}18` : SURFACE }]}
            onPress={() => setFiltro(f.value as EstadoOrden | "todas")}
          >
            <Text style={[styles.filtroBtnText, { color: filtro === f.value ? BOSS_COLOR : TEXT_MUTED }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={BOSS_COLOR} /></View>
      ) : (
        <FlatList
          data={ordenesFiltradas}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrdenes(true)} tintColor={BOSS_COLOR} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="tool" size={40} color={TEXT_MUTED} />
              <Text style={styles.emptyText}>No hay órdenes de trabajo</Text>
            </View>
          }
          renderItem={({ item }) => {
            const eInfo = estadoInfo(item.estado);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetalle(item); }}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardNumero}>{item.numero}</Text>
                  <View style={styles.cardBadges}>
                    <View style={[styles.badge, { backgroundColor: `${eInfo.color}18` }]}>
                      <Text style={[styles.badgeText, { color: eInfo.color }]}>{eInfo.label}</Text>
                    </View>
                    <View style={styles.tiendaBadge}>
                      <Text style={styles.tiendaBadgeText}>{item.tiendaCodigo}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.cardCliente}>{item.clienteNombre}</Text>
                <Text style={styles.cardDesc} numberOfLines={1}>{item.descripcion}</Text>
                {item.tecnico && <Text style={styles.cardTecnico}><Feather name="user" size={11} /> {item.tecnico}</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!detalle} transparent animationType="slide" onRequestClose={() => setDetalle(null)}>
        {detalle && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{detalle.numero}</Text>
                <TouchableOpacity onPress={() => setDetalle(null)}><Feather name="x" size={22} color={TEXT_MUTED} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                <View style={styles.detalleBlock}>
                  <Text style={styles.detalleLabel}>Tienda</Text>
                  <Text style={styles.detalleVal}>{detalle.tiendaCodigo}</Text>
                </View>
                <View style={styles.detalleBlock}>
                  <Text style={styles.detalleLabel}>Cliente</Text>
                  <Text style={styles.detalleVal}>{detalle.clienteNombre}</Text>
                  {detalle.clienteContacto ? <Text style={[styles.detalleVal, { fontSize: 13, color: TEXT_SEC }]}>{detalle.clienteContacto}</Text> : null}
                </View>
                <View style={styles.detalleBlock}>
                  <Text style={styles.detalleLabel}>Descripción</Text>
                  <Text style={styles.detalleVal}>{detalle.descripcion}</Text>
                </View>
                {detalle.tecnico ? (
                  <View style={styles.detalleBlock}>
                    <Text style={styles.detalleLabel}>Técnico</Text>
                    <Text style={styles.detalleVal}>{detalle.tecnico}</Text>
                  </View>
                ) : null}
                {detalle.presupuesto ? (
                  <View style={styles.detalleBlock}>
                    <Text style={styles.detalleLabel}>Presupuesto</Text>
                    <Text style={[styles.detalleVal, { color: "#00C896" }]}>$ {parseFloat(detalle.presupuesto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Text>
                  </View>
                ) : null}
                <Text style={[styles.detalleLabel, { marginTop: 4 }]}>Cambiar estado</Text>
                {actualizando ? (
                  <ActivityIndicator size="small" color={BOSS_COLOR} />
                ) : (
                  <View style={styles.estadosRow}>
                    {ESTADOS.map((e) => (
                      <TouchableOpacity
                        key={e.value}
                        style={[styles.estadoBtn, { borderColor: detalle.estado === e.value ? e.color : SURFACE_BORDER, backgroundColor: detalle.estado === e.value ? `${e.color}18` : SURFACE }]}
                        onPress={() => cambiarEstado(detalle, e.value)}
                      >
                        <Text style={[styles.estadoBtnText, { color: detalle.estado === e.value ? e.color : TEXT_MUTED }]}>{e.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  statItem: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  filtroBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  filtroBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center" },
  card: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: SURFACE_BORDER, padding: 14, marginBottom: 10, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardBadges: { flexDirection: "row", gap: 6 },
  cardNumero: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  cardCliente: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_SEC },
  cardTecnico: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tiendaBadge: { backgroundColor: `${BOSS_COLOR}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tiendaBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: BOSS_COLOR },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: TEXT },
  detalleBlock: { backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: SURFACE_BORDER, padding: 12, gap: 4 },
  detalleLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  detalleVal: { fontSize: 15, fontFamily: "Inter_500Medium", color: TEXT },
  estadosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  estadoBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  estadoBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
