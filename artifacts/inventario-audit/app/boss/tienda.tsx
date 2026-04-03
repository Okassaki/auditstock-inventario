import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { obtenerProgresotienda, eliminarProgreso, type ProgresoAPI, type ProductoSnapshot } from "@/utils/api";
import { exportarExcelBoss } from "@/utils/excel";

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

function estadoInfo(p: ProgresoAPI): { label: string; color: string } {
  if (p.estado === "archivada") return { label: "Archivada", color: TEXT_MUTED };
  if (p.estado === "completada") return { label: "Completada", color: SUCCESS };
  const pct = p.totalProductos > 0 ? (p.totalContados / p.totalProductos) * 100 : 0;
  if (pct >= 100) return { label: "Completada", color: SUCCESS };
  if (pct >= 50) return { label: "En curso", color: WARNING };
  return { label: "En curso", color: BOSS_COLOR };
}

function calcPct(p: ProgresoAPI) {
  if (p.totalProductos === 0) return 0;
  return Math.min(100, Math.round((p.totalContados / p.totalProductos) * 100));
}

interface AuditoriaCardProps {
  progreso: ProgresoAPI;
  tiendaNombre: string;
  onVerProductos: () => void;
  onExportar: () => void;
  onEliminar: () => void;
  exporting: boolean;
}

function AuditoriaCard({ progreso, tiendaNombre, onVerProductos, onExportar, onEliminar, exporting }: AuditoriaCardProps) {
  const { label, color } = estadoInfo(progreso);
  const porcentaje = calcPct(progreso);
  const hasProductos = !!progreso.productosJson;

  const fecha = new Date(progreso.actualizadoAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const hora = new Date(progreso.actualizadoAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {/* Cabecera de la auditoría */}
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardNombre} numberOfLines={2}>{progreso.auditoriaNombre}</Text>
          <Text style={styles.cardFecha}>{fecha} · {hora}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
          {progreso.estado === "activa" && (
            <View style={[styles.badgeDot, { backgroundColor: color }]} />
          )}
          <Text style={[styles.badgeText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Barra de progreso */}
      <View style={styles.barWrap}>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${porcentaje}%` as any, backgroundColor: color }]} />
        </View>
        <Text style={[styles.pctText, { color }]}>{porcentaje}%</Text>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statText}>
          {progreso.totalContados} / {progreso.totalProductos} productos contados
        </Text>
        {progreso.totalContados === progreso.totalProductos && progreso.totalProductos > 0 && (
          <View style={styles.completoPill}>
            <Feather name="check" size={10} color={SUCCESS} />
            <Text style={styles.completoPillText}>Completo</Text>
          </View>
        )}
      </View>

      {/* Botón ver productos — siempre visible, activo solo si hay datos */}
      <TouchableOpacity
        onPress={hasProductos ? onVerProductos : undefined}
        activeOpacity={hasProductos ? 0.75 : 1}
        style={[
          styles.verBtn,
          hasProductos
            ? { backgroundColor: `${BOSS_COLOR}15`, borderColor: `${BOSS_COLOR}40` }
            : { backgroundColor: `${TEXT_MUTED}10`, borderColor: `${TEXT_MUTED}25` },
        ]}
      >
        <Feather
          name={hasProductos ? "list" : "clock"}
          size={14}
          color={hasProductos ? BOSS_COLOR : TEXT_MUTED}
        />
        <Text style={[styles.verBtnText, { color: hasProductos ? BOSS_COLOR : TEXT_MUTED }]}>
          {hasProductos
            ? "Ver productos del conteo"
            : "Sin datos de productos aún"}
        </Text>
        {hasProductos && <Feather name="chevron-right" size={14} color={BOSS_COLOR} />}
      </TouchableOpacity>

      {/* Acciones: exportar y eliminar */}
      <View style={[styles.actionsRow, { borderTopColor: SURFACE_BORDER }]}>
        <TouchableOpacity
          onPress={hasProductos ? onExportar : undefined}
          disabled={exporting || !hasProductos}
          style={[styles.actionBtn, (!hasProductos || exporting) && { opacity: 0.35 }]}
        >
          {exporting
            ? <ActivityIndicator size="small" color={SUCCESS} />
            : <Feather name="download" size={15} color={SUCCESS} />
          }
          <Text style={[styles.actionBtnText, { color: SUCCESS }]}>Exportar Excel</Text>
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity
          onPress={onEliminar}
          style={styles.actionBtn}
        >
          <Feather name="trash-2" size={15} color={DANGER} />
          <Text style={[styles.actionBtnText, { color: DANGER }]}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TiendaScreen() {
  const { codigo, tiendaNombre } = useLocalSearchParams<{
    codigo: string;
    tiendaNombre: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [progresos, setProgresos] = useState<ProgresoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = await obtenerProgresotienda(codigo);
      const ordenado = [...data].sort((a, b) => {
        if (a.estado === "activa" && b.estado !== "activa") return -1;
        if (b.estado === "activa" && a.estado !== "activa") return 1;
        return new Date(b.actualizadoAt).getTime() - new Date(a.actualizadoAt).getTime();
      });
      setProgresos(ordenado);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [codigo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function irAProductos(p: ProgresoAPI) {
    router.push({
      pathname: "/boss/productos",
      params: {
        codigo,
        auditoriaId: p.auditoriaId,
        auditoriaNombre: p.auditoriaNombre,
        tiendaNombre: tiendaNombre ?? codigo,
      },
    });
  }

  async function handleExportar(p: ProgresoAPI) {
    if (!p.productosJson) return;
    try {
      setExportingId(p.auditoriaId);
      const productos: ProductoSnapshot[] = JSON.parse(p.productosJson);
      await exportarExcelBoss(productos, p.auditoriaNombre, tiendaNombre ?? codigo);
    } catch (e: any) {
      Alert.alert("Error al exportar", e?.message ?? "Error desconocido");
    } finally {
      setExportingId(null);
    }
  }

  function handleEliminar(p: ProgresoAPI) {
    Alert.alert(
      "Eliminar auditoría",
      `¿Eliminar "${p.auditoriaNombre}"?\n\nEsto borrará el progreso y los datos del servidor. No afecta la app de la tienda.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await eliminarProgreso(codigo, p.auditoriaId);
              setProgresos((prev) => prev.filter((x) => x.auditoriaId !== p.auditoriaId));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "No se pudo eliminar");
            }
          },
        },
      ]
    );
  }

  const activas = progresos.filter((p) => p.estado === "activa").length;
  const archivadas = progresos.filter((p) => p.estado === "archivada").length;
  const conDatos = progresos.filter((p) => !!p.productosJson).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tiendaNombre ?? codigo}</Text>
          <Text style={styles.headerSub}>
            {codigo} · {progresos.length} auditoría{progresos.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => fetchData(true)} disabled={refreshing}>
          <Feather name="refresh-cw" size={18} color={BOSS_COLOR} />
        </TouchableOpacity>
      </View>

      {/* Chips resumen */}
      {!loading && progresos.length > 0 && (
        <View style={styles.chipsRow}>
          {activas > 0 && (
            <View style={[styles.chip, { borderColor: `${WARNING}50` }]}>
              <View style={[styles.chipDot, { backgroundColor: WARNING }]} />
              <Text style={[styles.chipText, { color: WARNING }]}>{activas} en curso</Text>
            </View>
          )}
          {archivadas > 0 && (
            <View style={[styles.chip, { borderColor: `${TEXT_MUTED}50` }]}>
              <Feather name="archive" size={10} color={TEXT_MUTED} />
              <Text style={[styles.chipText, { color: TEXT_MUTED }]}>
                {archivadas} archivada{archivadas !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {conDatos > 0 && (
            <View style={[styles.chip, { borderColor: `${BOSS_COLOR}50` }]}>
              <Feather name="list" size={10} color={BOSS_COLOR} />
              <Text style={[styles.chipText, { color: BOSS_COLOR }]}>{conDatos} con productos</Text>
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BOSS_COLOR} />
          <Text style={styles.loadingText}>Cargando auditorías...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : progresos.length === 0 ? (
        <View style={styles.center}>
          <Feather name="clipboard" size={40} color={TEXT_MUTED} />
          <Text style={styles.emptyText}>Sin auditorías</Text>
          <Text style={styles.emptyDesc}>
            Esta tienda todavía no reportó ninguna auditoría al servidor.
          </Text>
        </View>
      ) : (
        <FlatList
          data={progresos}
          keyExtractor={(item) => item.auditoriaId}
          renderItem={({ item }) => (
            <AuditoriaCard
              progreso={item}
              tiendaNombre={tiendaNombre ?? codigo}
              onVerProductos={() => irAProductos(item)}
              onExportar={() => handleExportar(item)}
              onEliminar={() => handleEliminar(item)}
              exporting={exportingId === item.auditoriaId}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={BOSS_COLOR}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE_BORDER,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: TEXT },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED, marginTop: 1 },
  iconBtn: { padding: 6 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: SURFACE,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  loadingText: { color: TEXT_SEC, fontFamily: "Inter_400Regular", fontSize: 14 },
  errorText: { color: DANGER, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: `${BOSS_COLOR}20`,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${BOSS_COLOR}40`,
  },
  retryText: { color: BOSS_COLOR, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center" },
  list: { padding: 14, gap: 12 },

  // Card
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    padding: 16,
    paddingBottom: 10,
  },
  cardLeft: { flex: 1, gap: 3 },
  cardNombre: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT, lineHeight: 20 },
  cardFecha: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  barWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  barBg: { flex: 1, height: 6, backgroundColor: SURFACE_BORDER, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  pctText: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 38, textAlign: "right" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  completoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${SUCCESS}20`,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completoPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: SUCCESS },

  // Botón ver productos
  verBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  verBtnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },

  // Fila de acciones
  actionsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionDivider: { width: 1, backgroundColor: SURFACE_BORDER },
});
