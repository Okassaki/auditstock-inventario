import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import {
  useDatabase,
  type ProductoInventario,
  getEstadoProducto,
  getDiferencia,
} from "@/context/DatabaseContext";
import { Badge } from "@/components/ui/Badge";
import { exportarExcel } from "@/utils/excel";
import { exportarPDF, getProductosFiltrados } from "@/utils/exportReport";
import { useColorScheme } from "@/hooks/useColorScheme";

type Tab = "faltantes" | "sobrantes" | "correctos" | "sin_contar";
type Filtro = "todos" | "faltantes" | "sobrantes";
type Formato = "excel" | "pdf" | "imagen";

interface ResumenItem {
  producto: ProductoInventario;
  estado: "faltante" | "sobrante" | "correcto" | "sin_contar";
  diff: number;
}

const FORMATOS: { key: Formato; icon: string; label: string; desc: string; color: string }[] = [
  { key: "excel", icon: "grid", label: "Excel", desc: "Compatible con PC y celular", color: "#22c55e" },
  { key: "pdf", icon: "file-text", label: "PDF", desc: "Ideal para imprimir y compartir", color: "#3b82f6" },
  { key: "imagen", icon: "image", label: "Imagen", desc: "Para enviar rápido por WhatsApp", color: "#a855f7" },
];

export default function ResumenScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { auditoriaActual, productos } = useDatabase();
  const [activeTab, setActiveTab] = useState<Tab>("faltantes");
  const [exporting, setExporting] = useState(false);

  const [formatModal, setFormatModal] = useState(false);
  const [pendingFiltro, setPendingFiltro] = useState<Filtro | null>(null);

  const [capturandoImagen, setCapturandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(false);
  const reporteImagenRef = useRef<View>(null);
  const pendingFiltroRef = useRef<Filtro>("todos");

  const resumen = useMemo(() => {
    const faltantes: ResumenItem[] = [];
    const sobrantes: ResumenItem[] = [];
    const correctos: ResumenItem[] = [];
    const sin_contar: ResumenItem[] = [];

    for (const p of productos) {
      const estado = getEstadoProducto(p);
      const diff = getDiferencia(p);
      const item: ResumenItem = { producto: p, estado, diff };
      if (estado === "faltante") faltantes.push(item);
      else if (estado === "sobrante") sobrantes.push(item);
      else if (estado === "correcto") correctos.push(item);
      else sin_contar.push(item);
    }

    return { faltantes, sobrantes, correctos, sin_contar };
  }, [productos]);

  const listaActiva: ResumenItem[] = resumen[activeTab];

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: "faltantes", label: "Faltantes", count: resumen.faltantes.length, color: C.danger },
    { key: "sobrantes", label: "Sobrantes", count: resumen.sobrantes.length, color: C.warning },
    { key: "correctos", label: "Correctos", count: resumen.correctos.length, color: C.success },
    { key: "sin_contar", label: "Sin Contar", count: resumen.sin_contar.length, color: C.textMuted },
  ];

  const abrirSelectorFormato = (filtro: Filtro) => {
    setPendingFiltro(filtro);
    pendingFiltroRef.current = filtro;
    setFormatModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleExportar = async (formato: Formato) => {
    const filtro = pendingFiltroRef.current;
    setFormatModal(false);

    if (formato === "imagen") {
      setCapturandoImagen(true);
      return;
    }

    if (!auditoriaActual) return;
    setExporting(true);
    try {
      if (formato === "excel") {
        await exportarExcel(productos, filtro, auditoriaActual.nombre);
      } else if (formato === "pdf") {
        await exportarPDF(productos, filtro, auditoriaActual.nombre);
      }
    } catch (e) {
      Alert.alert("Error al exportar", String(e));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (imagenLista && capturandoImagen && reporteImagenRef.current) {
      captureRef(reporteImagenRef, { format: "png", quality: 0.95, result: "tmpfile" })
        .then(async (uri) => {
          setCapturandoImagen(false);
          setImagenLista(false);
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: `Exportar Imagen — ${auditoriaActual?.nombre ?? ""}`,
            UTI: "public.png",
          });
        })
        .catch((err) => {
          setCapturandoImagen(false);
          setImagenLista(false);
          Alert.alert("Error al exportar imagen", String(err));
        });
    }
  }, [imagenLista, capturandoImagen]);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const productosParaImagen = useMemo(
    () => getProductosFiltrados(productos, pendingFiltroRef.current),
    [productos, capturandoImagen]
  );

  if (!auditoriaActual) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.emptyState, { paddingTop: topPad + 40 }]}>
          <MaterialCommunityIcons name="chart-bar-stacked" size={64} color={C.textMuted} />
          <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
            Sin auditoría activa
          </Text>
          <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Ve a Inicio y selecciona una auditoría para ver el resumen.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: C.surface,
            borderBottomColor: C.surfaceBorder,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
          Resumen Final
        </Text>
        <Text style={[styles.headerSub, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
          {auditoriaActual.nombre}
        </Text>

        <View style={styles.statsRow}>
          {tabs.map((t) => (
            <View key={t.key} style={[styles.statBox, { backgroundColor: `${t.color}18` }]}>
              <Text style={[styles.statNum, { color: t.color, fontFamily: "Inter_700Bold" }]}>
                {t.count}
              </Text>
              <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.exportRow}>
          {exporting ? (
            <View style={styles.exportingRow}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={[styles.exportingText, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                Exportando...
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => abrirSelectorFormato("faltantes")}
                style={[styles.exportBtn, { backgroundColor: `${C.danger}18`, borderColor: C.danger + "40" }]}
              >
                <Feather name="download" size={13} color={C.danger} />
                <Text style={[styles.exportBtnText, { color: C.danger, fontFamily: "Inter_500Medium" }]}>
                  Faltantes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => abrirSelectorFormato("sobrantes")}
                style={[styles.exportBtn, { backgroundColor: `${C.warning}18`, borderColor: C.warning + "40" }]}
              >
                <Feather name="download" size={13} color={C.warning} />
                <Text style={[styles.exportBtnText, { color: C.warning, fontFamily: "Inter_500Medium" }]}>
                  Sobrantes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => abrirSelectorFormato("todos")}
                style={[styles.exportBtn, { backgroundColor: `${C.primary}18`, borderColor: C.primary + "40" }]}
              >
                <Feather name="download" size={13} color={C.primary} />
                <Text style={[styles.exportBtnText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                  Completo
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: C.surface, borderBottomColor: C.surfaceBorder }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => {
              setActiveTab(t.key);
              Haptics.selectionAsync();
            }}
            style={[
              styles.tab,
              activeTab === t.key && { borderBottomWidth: 2, borderBottomColor: t.color },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === t.key ? t.color : C.textSecondary,
                  fontFamily: activeTab === t.key ? "Inter_600SemiBold" : "Inter_400Regular",
                },
              ]}
            >
              {t.label}
            </Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: t.color }]}>
                <Text style={[styles.tabBadgeText, { fontFamily: "Inter_700Bold" }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={listaActiva}
        keyExtractor={(item) => String(item.producto.id)}
        renderItem={({ item }) => <ResumenRow item={item} C={C} />}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 120 }]}
        ListEmptyComponent={
          <View style={styles.listEmpty}>
            <Feather name="check-circle" size={48} color={C.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
              Sin registros
            </Text>
            <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              No hay productos en esta categoría.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Vista oculta para captura de imagen */}
      {capturandoImagen && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ScrollView>
            <View
              ref={reporteImagenRef}
              style={styles.imagenReporte}
              onLayout={() => setImagenLista(true)}
            >
              <ReporteImagenContenido
                productos={productosParaImagen}
                filtro={pendingFiltroRef.current}
                nombre={auditoriaActual.nombre}
                resumen={{
                  faltantes: resumen.faltantes.length,
                  sobrantes: resumen.sobrantes.length,
                  correctos: resumen.correctos.length,
                  sinContar: resumen.sin_contar.length,
                }}
              />
            </View>
          </ScrollView>
          <View style={styles.capturando}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.capturandoText}>Generando imagen...</Text>
          </View>
        </View>
      )}

      {/* Modal selector de formato */}
      <Modal
        visible={formatModal}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFormatModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: C.surface }]}>
                <Text style={[styles.modalTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                  ¿En qué formato?
                </Text>
                <Text style={[styles.modalSub, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Elige cómo quieres exportar el reporte
                </Text>
                <View style={styles.formatoGrid}>
                  {FORMATOS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => handleExportar(f.key)}
                      style={[
                        styles.formatoItem,
                        { backgroundColor: `${f.color}12`, borderColor: `${f.color}30` },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.formatoIconWrap, { backgroundColor: `${f.color}22` }]}>
                        <Feather name={f.icon as any} size={26} color={f.color} />
                      </View>
                      <Text style={[styles.formatoLabel, { color: f.color, fontFamily: "Inter_700Bold" }]}>
                        {f.label}
                      </Text>
                      <Text style={[styles.formatoDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        {f.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => setFormatModal(false)}
                  style={[styles.cancelBtn, { borderColor: C.surfaceBorder }]}
                >
                  <Text style={[styles.cancelText, { color: C.textSecondary, fontFamily: "Inter_500Medium" }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function ReporteImagenContenido({
  productos,
  filtro,
  nombre,
  resumen,
}: {
  productos: ProductoInventario[];
  filtro: Filtro;
  nombre: string;
  resumen: { faltantes: number; sobrantes: number; correctos: number; sinContar: number };
}) {
  const titulo =
    filtro === "faltantes"
      ? "Productos Faltantes"
      : filtro === "sobrantes"
      ? "Productos Sobrantes"
      : "Reporte Completo";

  const fecha = new Date().toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={img.root}>
      <View style={img.headerCard}>
        <Text style={img.auditNombre}>{nombre}</Text>
        <Text style={img.auditSub}>{titulo} · {fecha}</Text>
        <View style={img.statsRow}>
          <View style={[img.stat, { backgroundColor: "#fee2e2" }]}>
            <Text style={[img.statNum, { color: "#ef4444" }]}>{resumen.faltantes}</Text>
            <Text style={[img.statLbl, { color: "#ef4444" }]}>Faltantes</Text>
          </View>
          <View style={[img.stat, { backgroundColor: "#fef3c7" }]}>
            <Text style={[img.statNum, { color: "#f59e0b" }]}>{resumen.sobrantes}</Text>
            <Text style={[img.statLbl, { color: "#f59e0b" }]}>Sobrantes</Text>
          </View>
          <View style={[img.stat, { backgroundColor: "#dcfce7" }]}>
            <Text style={[img.statNum, { color: "#22c55e" }]}>{resumen.correctos}</Text>
            <Text style={[img.statLbl, { color: "#22c55e" }]}>Correctos</Text>
          </View>
          <View style={[img.stat, { backgroundColor: "#f1f5f9" }]}>
            <Text style={[img.statNum, { color: "#64748b" }]}>{resumen.sinContar}</Text>
            <Text style={[img.statLbl, { color: "#64748b" }]}>Sin Contar</Text>
          </View>
        </View>
      </View>

      <View style={img.tableCard}>
        <View style={img.tableHeader}>
          <Text style={[img.th, { flex: 1.2 }]}>Código</Text>
          <Text style={[img.th, { flex: 2.5 }]}>Nombre</Text>
          <Text style={[img.th, { width: 44, textAlign: "center" }]}>Sis.</Text>
          <Text style={[img.th, { width: 44, textAlign: "center" }]}>Fís.</Text>
          <Text style={[img.th, { width: 44, textAlign: "center" }]}>Dif.</Text>
          <Text style={[img.th, { width: 70, textAlign: "center" }]}>Estado</Text>
        </View>
        {productos.map((p, i) => {
          const estado = getEstadoProducto(p);
          const diff = p.stock_fisico !== null ? getDiferencia(p) : null;
          const color =
            estado === "correcto" ? "#22c55e" : estado === "sobrante" ? "#f59e0b" : estado === "faltante" ? "#ef4444" : "#64748b";
          const etiqueta =
            estado === "correcto" ? "✓" : estado === "sobrante" ? "↑" : estado === "faltante" ? "↓" : "—";
          const diffText = diff === null ? "—" : diff > 0 ? `+${diff}` : String(diff);
          const diffColor = diff === null ? "#64748b" : diff === 0 ? "#22c55e" : diff > 0 ? "#f59e0b" : "#ef4444";

          return (
            <View key={p.id} style={[img.tableRow, i % 2 === 0 ? {} : { backgroundColor: "#f8fafc" }]}>
              <Text style={[img.td, { flex: 1.2, color: "#3b82f6", fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                {p.codigo}
              </Text>
              <Text style={[img.td, { flex: 2.5 }]} numberOfLines={2}>
                {p.nombre}
              </Text>
              <Text style={[img.td, { width: 44, textAlign: "center" }]}>{p.stock_sistema}</Text>
              <Text style={[img.td, { width: 44, textAlign: "center" }]}>{p.stock_fisico ?? "—"}</Text>
              <Text style={[img.td, { width: 44, textAlign: "center", color: diffColor, fontFamily: "Inter_700Bold" }]}>
                {diffText}
              </Text>
              <View style={[img.estadoBadge, { width: 70, backgroundColor: `${color}20` }]}>
                <Text style={[img.estadoText, { color }]}>{etiqueta}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={img.footer}>Generado con Auditoría de Inventario</Text>
    </View>
  );
}

function ResumenRow({ item, C }: { item: ResumenItem; C: typeof Colors.dark }) {
  const { producto, estado, diff } = item;
  const borderColor =
    estado === "correcto"
      ? C.success
      : estado === "sobrante"
      ? C.warning
      : estado === "faltante"
      ? C.danger
      : C.textMuted;

  return (
    <View style={[styles.row, { backgroundColor: C.surface, borderLeftColor: borderColor }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowCodigo, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
          {producto.codigo}
        </Text>
        <Text style={[styles.rowNombre, { color: C.text, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>
          {producto.nombre}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={styles.rowNumbers}>
          <View style={styles.rowNum}>
            <Text style={[styles.rowNumLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Sis.
            </Text>
            <Text style={[styles.rowNumVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {producto.stock_sistema}
            </Text>
          </View>
          <Feather name="arrow-right" size={12} color={C.textMuted} />
          <View style={styles.rowNum}>
            <Text style={[styles.rowNumLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Fís.
            </Text>
            <Text style={[styles.rowNumVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {producto.stock_fisico ?? "—"}
            </Text>
          </View>
          {producto.stock_fisico !== null && (
            <>
              <Feather name="arrow-right" size={12} color={C.textMuted} />
              <View style={styles.rowNum}>
                <Text style={[styles.rowNumLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Dif.
                </Text>
                <Text
                  style={[
                    styles.rowNumVal,
                    {
                      color: diff === 0 ? C.success : diff > 0 ? C.warning : C.danger,
                      fontFamily: "Inter_700Bold",
                    },
                  ]}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, gap: 2 },
  statNum: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  exportRow: { flexDirection: "row", gap: 8 },
  exportingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  exportingText: { fontSize: 14 },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 13 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 5,
  },
  tabText: { fontSize: 12 },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { color: "#fff", fontSize: 10 },
  list: { padding: 12, gap: 8 },
  row: { flexDirection: "row", borderRadius: 10, padding: 12, borderLeftWidth: 3, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  rowLeft: { flex: 1, gap: 3 },
  rowCodigo: { fontSize: 12 },
  rowNombre: { fontSize: 14, lineHeight: 18 },
  rowRight: { justifyContent: "center" },
  rowNumbers: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowNum: { alignItems: "center", gap: 1 },
  rowNumLabel: { fontSize: 10 },
  rowNumVal: { fontSize: 18 },
  listEmpty: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  emptyTitle: { fontSize: 18 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", borderRadius: 20, padding: 24, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  modalTitle: { fontSize: 20 },
  modalSub: { fontSize: 14, marginTop: -8 },
  formatoGrid: { flexDirection: "row", gap: 10 },
  formatoItem: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 6 },
  formatoIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  formatoLabel: { fontSize: 15 },
  formatoDesc: { fontSize: 10, textAlign: "center", lineHeight: 14 },
  cancelBtn: { borderTopWidth: 1, paddingTop: 16, alignItems: "center" },
  cancelText: { fontSize: 15 },
  imagenReporte: { width: 400, backgroundColor: "#f8fafc", padding: 16 },
  capturando: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", gap: 12 },
  capturandoText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

const img = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 14 },
  headerCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  auditNombre: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#0f172a" },
  auditSub: { fontSize: 12, color: "#64748b", fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderRadius: 10, padding: 10, alignItems: "center", gap: 2 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLbl: { fontSize: 10, fontFamily: "Inter_400Regular" },
  tableCard: { backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 4 },
  th: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  tableRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  td: { color: "#1e293b", fontSize: 10, fontFamily: "Inter_400Regular" },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 4, paddingVertical: 3, alignItems: "center", justifyContent: "center" },
  estadoText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  footer: { textAlign: "center", fontSize: 10, color: "#94a3b8", fontFamily: "Inter_400Regular", paddingBottom: 8 },
});
