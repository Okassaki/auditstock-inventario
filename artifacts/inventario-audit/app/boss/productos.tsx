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
import { obtenerProgresotienda, type ProductoSnapshot } from "@/utils/api";
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

type EstadoProducto = "correcto" | "sobrante" | "faltante" | "sin_contar";

function getEstado(p: ProductoSnapshot): EstadoProducto {
  if (p.stock_fisico === null) return "sin_contar";
  if (p.stock_fisico > p.stock_sistema) return "sobrante";
  if (p.stock_fisico < p.stock_sistema) return "faltante";
  return "correcto";
}

function estadoLabel(e: EstadoProducto) {
  switch (e) {
    case "correcto": return "Correcto";
    case "sobrante": return "Sobrante";
    case "faltante": return "Faltante";
    case "sin_contar": return "Sin contar";
  }
}

function estadoColor(e: EstadoProducto) {
  switch (e) {
    case "correcto": return SUCCESS;
    case "sobrante": return WARNING;
    case "faltante": return DANGER;
    case "sin_contar": return TEXT_MUTED;
  }
}

function ProductoRow({ item }: { item: ProductoSnapshot }) {
  const estado = getEstado(item);
  const color = estadoColor(estado);
  const diff = item.stock_fisico !== null ? item.stock_fisico - item.stock_sistema : null;

  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={styles.rowTop}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowNombre} numberOfLines={2}>{item.nombre}</Text>
          <Text style={styles.rowCodigo}>{item.codigo}</Text>
        </View>
        <View style={styles.rowRight}>
          <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
            <Text style={[styles.badgeText, { color }]}>{estadoLabel(estado)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.stockRow}>
        <View style={styles.stockItem}>
          <Text style={styles.stockLabel}>Sistema</Text>
          <Text style={styles.stockVal}>{item.stock_sistema}</Text>
        </View>
        <View style={styles.stockDivider} />
        <View style={styles.stockItem}>
          <Text style={styles.stockLabel}>Físico</Text>
          <Text style={[styles.stockVal, { color: item.stock_fisico === null ? TEXT_MUTED : TEXT }]}>
            {item.stock_fisico ?? "—"}
          </Text>
        </View>
        {diff !== null && (
          <>
            <View style={styles.stockDivider} />
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Dif.</Text>
              <Text style={[styles.stockVal, { color: diff === 0 ? SUCCESS : diff > 0 ? WARNING : DANGER }]}>
                {diff > 0 ? `+${diff}` : diff}
              </Text>
            </View>
          </>
        )}
      </View>

      {item.comentario ? (
        <View style={styles.comentarioWrap}>
          <Feather name="message-square" size={12} color={BOSS_COLOR} />
          <Text style={styles.comentarioText}>{item.comentario}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ProductosScreen() {
  const { codigo, auditoriaId, auditoriaNombre, tiendaNombre } = useLocalSearchParams<{
    codigo: string;
    auditoriaId: string;
    auditoriaNombre: string;
    tiendaNombre: string;
  }>();
  const router = useRouter();

  const [productos, setProductos] = useState<ProductoSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  async function handleExportar() {
    if (productos.length === 0) {
      Alert.alert("Sin datos", "No hay productos para exportar.");
      return;
    }
    try {
      setExporting(true);
      await exportarExcelBoss(
        productos,
        auditoriaNombre ?? "Auditoría",
        tiendaNombre ?? codigo
      );
    } catch (e: any) {
      Alert.alert("Error al exportar", e?.message ?? "Error desconocido");
    } finally {
      setExporting(false);
    }
  }

  const fetchProductos = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const progresos = await obtenerProgresotienda(codigo);
      const match = progresos.find((p) => p.auditoriaId === auditoriaId);
      if (match?.productosJson) {
        const parsed: ProductoSnapshot[] = JSON.parse(match.productosJson);
        setProductos(parsed);
        setLastUpdate(new Date(match.actualizadoAt).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        }));
      } else {
        setProductos([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [codigo, auditoriaId]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const contados = productos.filter((p) => p.stock_fisico !== null).length;
  const correctos = productos.filter((p) => getEstado(p) === "correcto").length;
  const faltantes = productos.filter((p) => getEstado(p) === "faltante").length;
  const sobrantes = productos.filter((p) => getEstado(p) === "sobrante").length;
  const sinContar = productos.filter((p) => getEstado(p) === "sin_contar").length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tiendaNombre ?? codigo}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{auditoriaNombre}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => fetchProductos(true)}
          disabled={refreshing}
        >
          <Feather name="refresh-cw" size={18} color={BOSS_COLOR} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
          onPress={handleExportar}
          disabled={exporting || productos.length === 0}
        >
          {exporting
            ? <ActivityIndicator size="small" color={BOSS_COLOR} />
            : <Feather name="download" size={18} color={productos.length > 0 ? BOSS_COLOR : TEXT_MUTED} />
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BOSS_COLOR} />
          <Text style={styles.loadingText}>Cargando productos...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchProductos()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : productos.length === 0 ? (
        <View style={styles.center}>
          <Feather name="package" size={40} color={TEXT_MUTED} />
          <Text style={styles.emptyText}>Sin datos aún</Text>
          <Text style={styles.emptyDesc}>
            La tienda enviará los datos cuando abra la app y tenga conexión.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { borderColor: `${SUCCESS}40` }]}>
              <Text style={[styles.statNum, { color: SUCCESS }]}>{correctos}</Text>
              <Text style={styles.statLabel}>Correct.</Text>
            </View>
            <View style={[styles.statBox, { borderColor: `${DANGER}40` }]}>
              <Text style={[styles.statNum, { color: DANGER }]}>{faltantes}</Text>
              <Text style={styles.statLabel}>Faltante</Text>
            </View>
            <View style={[styles.statBox, { borderColor: `${WARNING}40` }]}>
              <Text style={[styles.statNum, { color: WARNING }]}>{sobrantes}</Text>
              <Text style={styles.statLabel}>Sobrante</Text>
            </View>
            <View style={[styles.statBox, { borderColor: `${TEXT_MUTED}40` }]}>
              <Text style={[styles.statNum, { color: TEXT_MUTED }]}>{sinContar}</Text>
              <Text style={styles.statLabel}>Sin contar</Text>
            </View>
          </View>

          {lastUpdate && (
            <Text style={styles.updateNote}>Última actualización de la tienda: {lastUpdate}</Text>
          )}

          <FlatList
            data={productos}
            keyExtractor={(item) => item.codigo}
            renderItem={({ item }) => <ProductoRow item={item} />}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchProductos(true)}
                tintColor={BOSS_COLOR}
              />
            }
          />
        </>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE_BORDER,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED, marginTop: 2 },
  refreshBtn: { padding: 4 },
  exportBtn: { padding: 4 },
  exportBtnDisabled: { opacity: 0.4 },
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
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  statBox: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 2,
  },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  updateNote: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: TEXT_MUTED,
    paddingVertical: 6,
  },
  list: { padding: 14, gap: 10 },
  row: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  rowLeft: { flex: 1, gap: 2, marginRight: 10 },
  rowNombre: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: TEXT },
  rowCodigo: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  rowRight: { alignItems: "flex-end" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  stockItem: { flex: 1, alignItems: "center", gap: 2 },
  stockLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  stockVal: { fontSize: 16, fontFamily: "Inter_700Bold", color: TEXT },
  stockDivider: { width: 1, height: 32, backgroundColor: SURFACE_BORDER },
  comentarioWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: `${BOSS_COLOR}12`,
    borderRadius: 8,
    padding: 8,
  },
  comentarioText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_SEC },
});
