import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useDatabase, type Inconsistencia } from "@/context/DatabaseContext";
import { useColorScheme } from "@/hooks/useColorScheme";

const TIPO_CONFIG: Record<
  string,
  { color: keyof typeof Colors.dark; icon: string; iconLib: "feather" | "mci" }
> = {
  Faltante: { color: "danger", icon: "trending-down", iconLib: "feather" },
  Sobrante: { color: "warning", icon: "trending-up", iconLib: "feather" },
  "IMEI Duplicado": { color: "danger", icon: "cpu", iconLib: "feather" },
  Negativo: { color: "danger", icon: "minus-circle", iconLib: "feather" },
  "Sistema Negativo": { color: "warning", icon: "alert-triangle", iconLib: "feather" },
  default: { color: "warning", icon: "alert-circle", iconLib: "feather" },
};

function InconsistenciaCard({
  item,
  C,
}: {
  item: Inconsistencia;
  C: typeof Colors.dark;
}) {
  const config = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG.default;
  const color = C[config.color as keyof typeof C] as string;

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderLeftColor: color }]}>
      <View style={[styles.cardIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={config.icon as any} size={20} color={color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={[styles.tipoPill, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.tipoText, { color, fontFamily: "Inter_600SemiBold" }]}>
              {item.tipo}
            </Text>
          </View>
        </View>
        <Text style={[styles.desc, { color: C.text, fontFamily: "Inter_500Medium" }]}>
          {item.descripcion}
        </Text>
        <View style={styles.metaRow}>
          <Feather name="hash" size={11} color={C.textMuted} />
          <Text style={[styles.meta, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            {item.codigo}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Feather name="package" size={11} color={C.textMuted} />
          <Text
            style={[styles.meta, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}
            numberOfLines={2}
          >
            {item.nombre}
          </Text>
        </View>
      </View>
    </View>
  );
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function generarResumen(
  auditoriaActual: NonNullable<ReturnType<typeof useDatabase>["auditoriaActual"]>,
  inconsistencias: Inconsistencia[],
  byTipo: Record<string, Inconsistencia[]>
): string {
  const lineas: string[] = [];

  lineas.push("══════════════════════════════");
  lineas.push("   REPORTE DE INCONSISTENCIAS");
  lineas.push("══════════════════════════════");
  lineas.push("");
  lineas.push(`Auditoría : ${auditoriaActual.nombre}`);
  lineas.push(`Fecha     : ${formatFecha(auditoriaActual.fecha_modificacion)}`);

  const auditores = [auditoriaActual.auditor1, auditoriaActual.auditor2]
    .filter(Boolean)
    .join(" · ");
  if (auditores) lineas.push(`Auditores : ${auditores}`);

  lineas.push("");
  lineas.push("─── RESUMEN ───────────────────");

  if (inconsistencias.length === 0) {
    lineas.push("✓ Sin inconsistencias detectadas.");
  } else {
    lineas.push(`Total de inconsistencias: ${inconsistencias.length}`);
    for (const [tipo, items] of Object.entries(byTipo)) {
      const emoji =
        tipo === "Faltante" ? "📉" :
        tipo === "Sobrante" ? "📈" :
        tipo === "IMEI Duplicado" ? "🔁" :
        tipo === "Negativo" ? "❌" : "⚠️";
      lineas.push(`  ${emoji} ${tipo}: ${items.length}`);
    }
  }

  if (inconsistencias.length > 0) {
    for (const [tipo, items] of Object.entries(byTipo)) {
      lineas.push("");
      lineas.push(`─── ${tipo.toUpperCase()} (${items.length}) ───────────`);
      items.forEach((item, idx) => {
        lineas.push(`${idx + 1}. ${item.nombre}`);
        lineas.push(`   Código : ${item.codigo}`);
        lineas.push(`   Detalle: ${item.descripcion}`);
      });
    }
  }

  lineas.push("");
  lineas.push("══════════════════════════════");
  lineas.push(`Generado con AuditStock`);

  return lineas.join("\n");
}

export default function AlertasScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { auditoriaActual, inconsistencias } = useDatabase();

  const byTipo = useMemo(() => {
    const groups: Record<string, Inconsistencia[]> = {};
    for (const i of inconsistencias) {
      if (!groups[i.tipo]) groups[i.tipo] = [];
      groups[i.tipo].push(i);
    }
    return groups;
  }, [inconsistencias]);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const handleCompartir = async () => {
    if (!auditoriaActual) return;
    const texto = generarResumen(auditoriaActual, inconsistencias, byTipo);
    try {
      await Share.share({ message: texto, title: "Reporte de inconsistencias" });
    } catch (e) {
      Alert.alert("Error", "No se pudo abrir el menú de compartir.");
    }
  };

  if (!auditoriaActual) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.emptyState, { paddingTop: topPad + 40 }]}>
          <Feather name="shield" size={64} color={C.textMuted} />
          <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
            Sin auditoría activa
          </Text>
          <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Selecciona una auditoría para ver las inconsistencias detectadas.
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
          Inconsistencias
        </Text>

        <Text
          style={[styles.headerSub, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}
          numberOfLines={1}
        >
          {auditoriaActual.nombre}
        </Text>

        <View style={styles.summaryRow}>
          {Object.entries(byTipo).map(([tipo, items]) => {
            const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.default;
            const color = C[config.color as keyof typeof C] as string;
            return (
              <View key={tipo} style={[styles.summaryItem, { backgroundColor: `${color}12` }]}>
                <Text style={[styles.summaryCount, { color, fontFamily: "Inter_700Bold" }]}>
                  {items.length}
                </Text>
                <Text style={[styles.summaryLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  {tipo}
                </Text>
              </View>
            );
          })}

          <View style={{ flex: 1 }} />

          {inconsistencias.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: C.danger + "18" }]}>
              <Text style={[styles.countBadgeText, { color: C.danger, fontFamily: "Inter_700Bold" }]}>
                {inconsistencias.length}
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleCompartir}
            style={[styles.shareBtn, { backgroundColor: C.primary + "18", borderColor: C.primary + "30" }]}
          >
            <Feather name="share-2" size={18} color={C.primary} />
            <Text style={[styles.shareBtnText, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
              Exportar
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {inconsistencias.length === 0 ? (
        <View style={[styles.successState, { paddingTop: 60 }]}>
          <View style={[styles.successIcon, { backgroundColor: C.success + "18" }]}>
            <Feather name="shield" size={48} color={C.success} />
          </View>
          <Text style={[styles.successTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
            Sin inconsistencias
          </Text>
          <Text style={[styles.successDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            No se han detectado problemas en esta auditoría.{"\n"}Todo parece estar en orden.
          </Text>
          <View style={styles.checkList}>
            {[
              "Sin faltantes de stock",
              "Sin sobrantes de stock",
              "Sin IMEIs duplicados",
              "Sin stocks negativos",
            ].map((item) => (
              <View key={item} style={styles.checkItem}>
                <View style={[styles.checkDot, { backgroundColor: C.success }]} />
                <Text style={[styles.checkText, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          data={inconsistencias}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <InconsistenciaCard item={item} C={C} />}
          contentContainerStyle={[styles.list, { paddingBottom: botPad + 120 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            inconsistencias.length > 0 ? (
              <View style={[styles.warningBanner, { backgroundColor: C.danger + "12", borderColor: C.danger + "30" }]}>
                <Feather name="alert-triangle" size={16} color={C.danger} />
                <Text style={[styles.warningText, { color: C.danger, fontFamily: "Inter_500Medium" }]}>
                  Se detectaron {inconsistencias.length} inconsistencia
                  {inconsistencias.length > 1 ? "s" : ""} que requieren atención.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 13, marginTop: 2 },
  countBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { fontSize: 16 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareBtnText: { fontSize: 13 },
  summaryRow: { flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: 8 },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryCount: { fontSize: 16 },
  summaryLabel: { fontSize: 12 },
  list: { padding: 14, gap: 10 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  warningText: { flex: 1, fontSize: 13, lineHeight: 18 },
  card: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 6 },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  tipoPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tipoText: { fontSize: 11, letterSpacing: 0.3 },
  desc: { fontSize: 14, lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { fontSize: 12, flex: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  emptyTitle: { fontSize: 18 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  successState: { alignItems: "center", paddingHorizontal: 32, gap: 16 },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 22, textAlign: "center" },
  successDesc: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  checkList: { gap: 10, alignSelf: "stretch", marginTop: 8 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
  checkText: { fontSize: 14 },
});
