import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { obtenerProgreso, type ProgresoGeneralItem } from "@/utils/api";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const SUCCESS = "#00C896";
const WARNING = "#FFB800";
const DANGER = "#FF4757";

const REFRESH_INTERVAL = 30_000;

function pct(item: ProgresoGeneralItem) {
  const p = item.progresoActivo;
  if (!p || p.totalProductos === 0) return 0;
  return Math.round((p.totalContados / p.totalProductos) * 100);
}

function estadoColor(item: ProgresoGeneralItem) {
  const p = item.progresoActivo;
  if (!p) return TEXT_MUTED;
  if (p.estado === "archivada" || p.estado === "completada") return SUCCESS;
  const porcentaje = pct(item);
  if (porcentaje >= 80) return SUCCESS;
  if (porcentaje >= 40) return WARNING;
  return BOSS_COLOR;
}

function EstadoBadge({ item }: { item: ProgresoGeneralItem }) {
  const p = item.progresoActivo;
  if (!p) return (
    <View style={[badge.wrap, { backgroundColor: `${TEXT_MUTED}20` }]}>
      <Text style={[badge.text, { color: TEXT_MUTED }]}>Sin auditoría</Text>
    </View>
  );
  const label =
    p.estado === "activa" ? "En curso" :
    p.estado === "completada" ? "Completada" : "Archivada";
  const color = estadoColor(item);
  return (
    <View style={[badge.wrap, { backgroundColor: `${color}20` }]}>
      <View style={[badge.dot, { backgroundColor: color }]} />
      <Text style={[badge.text, { color }]}>{label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

function TiendaCard({ item, onPress }: { item: ProgresoGeneralItem; onPress?: () => void }) {
  const p = item.progresoActivo;
  const porcentaje = pct(item);
  const color = estadoColor(item);

  const lastUpdate = p
    ? new Date(p.actualizadoAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const hasProductos = !!(p?.productosJson);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color }]}
      onPress={hasProductos ? onPress : undefined}
      activeOpacity={hasProductos ? 0.75 : 1}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardNombre}>{item.tienda.nombre}</Text>
          <Text style={styles.cardCodigo}>{item.tienda.codigo}</Text>
        </View>
        <EstadoBadge item={item} />
      </View>

      {p ? (
        <>
          <Text style={styles.auditNombre} numberOfLines={1}>{p.auditoriaNombre}</Text>
          <View style={styles.barWrap}>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${porcentaje}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={[styles.pctText, { color }]}>{porcentaje}%</Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>{p.totalContados} / {p.totalProductos} productos</Text>
            {lastUpdate && <Text style={styles.timeText}>Actualizado {lastUpdate}</Text>}
          </View>
          {hasProductos && (
            <View style={styles.verProductosRow}>
              <Feather name="list" size={12} color={BOSS_COLOR} />
              <Text style={styles.verProductosText}>Ver productos y comentarios</Text>
              <Feather name="chevron-right" size={12} color={BOSS_COLOR} />
            </View>
          )}
        </>
      ) : (
        <Text style={styles.sinAuditoria}>No hay auditoría activa · {item.totalAuditorias} historial</Text>
      )}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<ProgresoGeneralItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  function irAProductos(item: ProgresoGeneralItem) {
    const p = item.progresoActivo;
    if (!p) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/boss/productos",
      params: {
        codigo: item.tienda.codigo,
        auditoriaId: p.auditoriaId,
        auditoriaNombre: p.auditoriaNombre,
        tiendaNombre: item.tienda.nombre,
      },
    });
  }

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const result = await obtenerProgreso();
      setData(result);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchData(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BOSS_COLOR} />
        <Text style={styles.loadingText}>Cargando dashboard...</Text>
      </View>
    );
  }

  const activas = data.filter((d) => d.progresoActivo?.estado === "activa").length;
  const sinAuditoria = data.filter((d) => !d.progresoActivo).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={styles.headerRight}>
          {lastRefresh && (
            <Text style={styles.lastRefreshText}>
              {lastRefresh.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={18} color={BOSS_COLOR} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { borderColor: `${BOSS_COLOR}40` }]}>
          <Text style={[styles.summaryNum, { color: BOSS_COLOR }]}>{data.length}</Text>
          <Text style={styles.summaryLabel}>Tiendas</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: `${WARNING}40` }]}>
          <Text style={[styles.summaryNum, { color: WARNING }]}>{activas}</Text>
          <Text style={styles.summaryLabel}>En auditoría</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: `${TEXT_MUTED}40` }]}>
          <Text style={[styles.summaryNum, { color: TEXT_MUTED }]}>{sinAuditoria}</Text>
          <Text style={styles.summaryLabel}>Sin auditoría</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={14} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.tienda.codigo}
        renderItem={({ item }) => <TiendaCard item={item} onPress={() => irAProductos(item)} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BOSS_COLOR}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>No hay tiendas registradas</Text>
            <Text style={styles.emptyDesc}>Andá a "Tiendas" para crear la primera</Text>
          </View>
        }
      />

      <Text style={styles.autoRefreshNote}>Se actualiza automáticamente cada 30 seg.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: TEXT_SEC, fontFamily: "Inter_400Regular", fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: TEXT },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  lastRefreshText: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  refreshBtn: { padding: 6 },
  summaryRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  summaryBox: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 2,
  },
  summaryNum: { fontSize: 24, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${DANGER}15`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER, flex: 1 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardLeft: { flex: 1, gap: 2, marginRight: 10 },
  cardNombre: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT },
  cardCodigo: { fontSize: 12, fontFamily: "Inter_500Medium", color: TEXT_MUTED, letterSpacing: 1 },
  auditNombre: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_SEC },
  barWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  barBg: { flex: 1, height: 6, backgroundColor: SURFACE_BORDER, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  pctText: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 38, textAlign: "right" },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  sinAuditoria: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  verProductosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${BOSS_COLOR}12`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verProductosText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: BOSS_COLOR },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  autoRefreshNote: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED, paddingBottom: 12 },
});
