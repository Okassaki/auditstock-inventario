import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { obtenerProgresotienda, type ProductoSnapshot } from "@/utils/api";
import { exportarExcelBoss } from "@/utils/excel";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_EL = "#221C40";
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

function ProductoCard({ item, onPress }: { item: ProductoSnapshot; onPress: () => void }) {
  const estado = getEstado(item);
  const color = estadoColor(estado);
  const diff = item.stock_fisico !== null ? item.stock_fisico - item.stock_sistema : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.card, { borderLeftColor: color }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardCodigo}>{item.codigo}</Text>
          <Text style={styles.cardNombre} numberOfLines={2}>{item.nombre}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
          <Text style={[styles.badgeText, { color }]}>{estadoLabel(estado)}</Text>
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
          <Text style={[styles.stockVal, {
            color: item.stock_fisico === null
              ? TEXT_MUTED
              : diff === 0 ? SUCCESS
              : diff! > 0 ? WARNING : DANGER
          }]}>
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
          <Feather name="message-square" size={12} color={diff !== null && diff < 0 ? DANGER : WARNING} />
          <Text style={[styles.comentarioText, { color: diff !== null && diff < 0 ? DANGER : WARNING }]} numberOfLines={2}>
            {item.comentario}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Feather name="eye" size={12} color={TEXT_MUTED} />
        <Text style={styles.cardFooterText}>Toca para ver detalle</Text>
      </View>
    </TouchableOpacity>
  );
}

function DetalleModal({
  producto,
  onClose,
}: {
  producto: ProductoSnapshot | null;
  onClose: () => void;
}) {
  if (!producto) return null;
  const estado = getEstado(producto);
  const color = estadoColor(estado);
  const diff = producto.stock_fisico !== null ? producto.stock_fisico - producto.stock_sistema : null;

  return (
    <Modal
      visible={!!producto}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHandle} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>

            {/* Encabezado del producto */}
            <View style={[styles.detalleHeader, { borderLeftColor: color, borderLeftWidth: 3 }]}>
              <Text style={styles.detalleCodigo}>{producto.codigo}</Text>
              <Text style={styles.detalleNombre}>{producto.nombre}</Text>
              <View style={[styles.badge, { backgroundColor: `${color}20`, alignSelf: "flex-start", marginTop: 6 }]}>
                <Text style={[styles.badgeText, { color }]}>{estadoLabel(estado)}</Text>
              </View>
            </View>

            {/* Stocks */}
            <View style={styles.detalleStocks}>
              <View style={styles.detalleStockBox}>
                <Text style={styles.detalleStockLabel}>Stock Sistema</Text>
                <Text style={styles.detalleStockNum}>{producto.stock_sistema}</Text>
              </View>
              <Feather name="chevron-right" size={22} color={TEXT_MUTED} />
              <View style={styles.detalleStockBox}>
                <Text style={styles.detalleStockLabel}>Stock Físico</Text>
                <Text style={[styles.detalleStockNum, {
                  color: producto.stock_fisico === null
                    ? TEXT_MUTED
                    : diff === 0 ? SUCCESS
                    : diff! > 0 ? WARNING : DANGER
                }]}>
                  {producto.stock_fisico ?? "—"}
                </Text>
              </View>
              {diff !== null && (
                <>
                  <Feather name="chevron-right" size={22} color={TEXT_MUTED} />
                  <View style={styles.detalleStockBox}>
                    <Text style={styles.detalleStockLabel}>Diferencia</Text>
                    <Text style={[styles.detalleStockNum, { color: diff === 0 ? SUCCESS : diff > 0 ? WARNING : DANGER }]}>
                      {diff > 0 ? `+${diff}` : diff}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Resumen diferencia */}
            {diff !== null && diff !== 0 && (
              <View style={[styles.difBox, {
                backgroundColor: diff < 0 ? `${DANGER}15` : `${WARNING}15`,
                borderColor: diff < 0 ? `${DANGER}40` : `${WARNING}40`,
              }]}>
                <Feather
                  name={diff < 0 ? "trending-down" : "trending-up"}
                  size={18}
                  color={diff < 0 ? DANGER : WARNING}
                />
                <Text style={[styles.difText, { color: diff < 0 ? DANGER : WARNING }]}>
                  {diff < 0 ? "Faltante" : "Sobrante"} de {Math.abs(diff)} unidad{Math.abs(diff) !== 1 ? "es" : ""}
                </Text>
              </View>
            )}

            {/* Comentario */}
            {producto.comentario ? (
              <View>
                <Text style={styles.detalleSeccion}>COMENTARIO DEL AUDITOR</Text>
                <View style={[styles.comentarioBox, {
                  borderColor: diff !== null && diff < 0 ? `${DANGER}40` : `${WARNING}40`,
                  backgroundColor: diff !== null && diff < 0 ? `${DANGER}10` : `${WARNING}10`,
                }]}>
                  <Feather name="message-square" size={14} color={diff !== null && diff < 0 ? DANGER : WARNING} />
                  <Text style={[styles.comentarioFullText, { color: diff !== null && diff < 0 ? DANGER : WARNING }]}>
                    {producto.comentario}
                  </Text>
                </View>
              </View>
            ) : (
              diff !== null && diff !== 0 && (
                <View style={[styles.sinComentarioBox, { borderColor: `${TEXT_MUTED}30` }]}>
                  <Feather name="alert-circle" size={14} color={TEXT_MUTED} />
                  <Text style={styles.sinComentarioText}>Sin comentario del auditor</Text>
                </View>
              )
            )}

            {/* Indicador solo lectura */}
            <View style={styles.readonlyBadge}>
              <Feather name="lock" size={12} color={TEXT_MUTED} />
              <Text style={styles.readonlyText}>Vista de solo lectura — Boss Mode</Text>
            </View>

          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  const insets = useSafeAreaInsets();

  const [productos, setProductos] = useState<ProductoSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProductoSnapshot | null>(null);

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

  const productosFiltrados = useMemo(() => {
    if (!query.trim()) return productos;
    const q = query.toLowerCase();
    return productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q)
    );
  }, [productos, query]);

  const contados = productos.filter((p) => p.stock_fisico !== null).length;
  const correctos = productos.filter((p) => getEstado(p) === "correcto").length;
  const faltantes = productos.filter((p) => getEstado(p) === "faltante").length;
  const sobrantes = productos.filter((p) => getEstado(p) === "sobrante").length;
  const sinContar = productos.filter((p) => getEstado(p) === "sin_contar").length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tiendaNombre ?? codigo}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{auditoriaNombre}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => fetchProductos(true)}
          disabled={refreshing}
        >
          <Feather name="refresh-cw" size={18} color={BOSS_COLOR} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, (exporting || productos.length === 0) && { opacity: 0.35 }]}
          onPress={handleExportar}
          disabled={exporting || productos.length === 0}
        >
          {exporting
            ? <ActivityIndicator size="small" color={BOSS_COLOR} />
            : <Feather name="download" size={18} color={BOSS_COLOR} />
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
          {/* Resumen de estados */}
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

          {/* Barra de búsqueda */}
          <View style={styles.searchWrap}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={TEXT_MUTED} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por código o nombre..."
                placeholderTextColor={TEXT_MUTED}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Feather name="x" size={16} color={TEXT_MUTED} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {lastUpdate && (
            <Text style={styles.updateNote}>
              Última sync de la tienda: {lastUpdate} · {contados}/{productos.length} contados
            </Text>
          )}

          {/* Lista de productos */}
          <FlatList
            data={productosFiltrados}
            keyExtractor={(item) => item.codigo}
            renderItem={({ item }) => (
              <ProductoCard item={item} onPress={() => setSelected(item)} />
            )}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchProductos(true)}
                tintColor={BOSS_COLOR}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="search" size={32} color={TEXT_MUTED} />
                <Text style={styles.emptyText}>Sin resultados</Text>
                <Text style={styles.emptyDesc}>Intenta con otro código o nombre</Text>
              </View>
            }
          />
        </>
      )}

      <DetalleModal producto={selected} onClose={() => setSelected(null)} />
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
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED, marginTop: 1 },
  iconBtn: { padding: 6 },
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
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
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
  searchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    padding: 0,
  },
  updateNote: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: TEXT_MUTED,
    paddingVertical: 4,
  },
  list: { padding: 14, gap: 10 },

  // Product card
  card: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardLeft: { flex: 1, gap: 2 },
  cardCodigo: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: BOSS_COLOR },
  cardNombre: { fontSize: 14, fontFamily: "Inter_500Medium", color: TEXT, lineHeight: 19 },
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${DANGER}10`,
  },
  comentarioText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardFooterText: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },

  // Detail Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalBox: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: SURFACE_BORDER,
    alignSelf: "center",
    marginBottom: 4,
  },
  detalleHeader: {
    backgroundColor: SURFACE_EL,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  detalleCodigo: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: BOSS_COLOR },
  detalleNombre: { fontSize: 18, fontFamily: "Inter_700Bold", color: TEXT, lineHeight: 24 },
  detalleStocks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: SURFACE_EL,
    borderRadius: 12,
    padding: 16,
  },
  detalleStockBox: { flex: 1, alignItems: "center", gap: 4 },
  detalleStockLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  detalleStockNum: { fontSize: 32, fontFamily: "Inter_700Bold", color: TEXT },
  difBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  difText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  detalleSeccion: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED, letterSpacing: 0.8, marginBottom: 8 },
  comentarioBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  comentarioFullText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sinComentarioBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sinComentarioText: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  readonlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 4,
  },
  readonlyText: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  closeBtn: {
    backgroundColor: `${BOSS_COLOR}20`,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${BOSS_COLOR}50`,
  },
  closeBtnText: { color: BOSS_COLOR, fontFamily: "Inter_700Bold", fontSize: 15 },
});
