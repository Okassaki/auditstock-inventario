import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
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

type Tab = "faltantes" | "sobrantes" | "correctos" | "sin_contar";

interface ResumenItem {
  producto: ProductoInventario;
  estado: "faltante" | "sobrante" | "correcto" | "sin_contar";
  diff: number;
}

export default function ResumenScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { auditoriaActual, productos } = useDatabase();
  const [activeTab, setActiveTab] = useState<Tab>("faltantes");
  const [exporting, setExporting] = useState(false);

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
    {
      key: "sin_contar",
      label: "Sin Contar",
      count: resumen.sin_contar.length,
      color: C.textMuted,
    },
  ];

  const handleExport = async (tipo: "todos" | "faltantes" | "sobrantes") => {
    if (!auditoriaActual) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await exportarExcel(productos, tipo, auditoriaActual.nombre);
    } catch (e) {
      Alert.alert("Error al exportar", String(e));
    } finally {
      setExporting(false);
    }
  };

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

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
            <View
              key={t.key}
              style={[styles.statBox, { backgroundColor: `${t.color}18` }]}
            >
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
                onPress={() => handleExport("faltantes")}
                style={[styles.exportBtn, { backgroundColor: `${C.danger}18`, borderColor: C.danger + "40" }]}
              >
                <Feather name="download" size={13} color={C.danger} />
                <Text style={[styles.exportBtnText, { color: C.danger, fontFamily: "Inter_500Medium" }]}>
                  Faltantes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleExport("sobrantes")}
                style={[styles.exportBtn, { backgroundColor: `${C.warning}18`, borderColor: C.warning + "40" }]}
              >
                <Feather name="download" size={13} color={C.warning} />
                <Text style={[styles.exportBtnText, { color: C.warning, fontFamily: "Inter_500Medium" }]}>
                  Sobrantes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleExport("todos")}
                style={[styles.exportBtn, { backgroundColor: `${C.primary}18`, borderColor: C.primary + "40" }]}
              >
                <Feather name="download" size={13} color={C.primary} />
                <Text style={[styles.exportBtnText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                  Todo
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
              activeTab === t.key && {
                borderBottomWidth: 2,
                borderBottomColor: t.color,
              },
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
        renderItem={({ item }) => (
          <ResumenRow item={item} C={C} />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 120 }]}
        ListEmptyComponent={
          <View style={styles.listEmpty}>
            <Feather
              name={
                activeTab === "faltantes"
                  ? "check-circle"
                  : activeTab === "sobrantes"
                  ? "check-circle"
                  : activeTab === "correctos"
                  ? "check-circle"
                  : "clock"
              }
              size={48}
              color={C.textMuted}
            />
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
    <View
      style={[
        styles.row,
        {
          backgroundColor: C.surface,
          borderLeftColor: borderColor,
        },
      ]}
    >
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 2,
  },
  statNum: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  exportRow: {
    flexDirection: "row",
    gap: 8,
  },
  exportingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
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
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 5,
  },
  tabText: { fontSize: 12 },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 10 },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
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
});
