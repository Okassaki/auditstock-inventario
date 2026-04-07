import { Feather } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { obtenerTodasVentas, type VentaAPI } from "@/utils/api";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const SUCCESS = "#00C896";
const DANGER = "#FF4757";

const METODO_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", otro: "Otro" };

export default function BossVentasScreen() {
  const insets = useSafeAreaInsets();
  const [ventas, setVentas] = useState<VentaAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVentas = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = await obtenerTodasVentas();
      setVentas(data);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  const totalGeneral = ventas.reduce((acc, v) => acc + parseFloat(v.total), 0);

  const porTienda: Record<string, number> = {};
  ventas.forEach((v) => { porTienda[v.tiendaCodigo] = (porTienda[v.tiendaCodigo] ?? 0) + parseFloat(v.total); });

  return (
    <View style={[styles.container, { paddingTop: 8 }]}>
      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchVentas(true)}><Feather name="refresh-cw" size={13} color={TEXT_MUTED} /></TouchableOpacity>
        </View>
      )}

      <View style={styles.resumenCard}>
        <Text style={styles.resumenLabel}>Total vendido</Text>
        <Text style={styles.resumenTotal}>$ {totalGeneral.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Text>
        <Text style={styles.resumenSub}>{ventas.length} cobro{ventas.length !== 1 ? "s" : ""} registrado{ventas.length !== 1 ? "s" : ""}</Text>
      </View>

      {Object.keys(porTienda).length > 1 && (
        <View style={styles.tiendaResumenWrap}>
          {Object.entries(porTienda).map(([codigo, monto]) => (
            <View key={codigo} style={styles.tiendaResumenItem}>
              <Text style={styles.tiendaResumenCodigo}>{codigo}</Text>
              <Text style={styles.tiendaResumenMonto}>$ {monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Text>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={BOSS_COLOR} /></View>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchVentas(true)} tintColor={BOSS_COLOR} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="dollar-sign" size={40} color={TEXT_MUTED} />
              <Text style={styles.emptyText}>No hay cobros registrados</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTotal}>$ {parseFloat(item.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Text>
                  <Text style={styles.cardSub}>
                    {item.clienteNombre || "Sin cliente"} · {METODO_LABEL[item.metodoPago] ?? item.metodoPago}
                  </Text>
                  <Text style={styles.cardFecha}>
                    {new Date(item.creadoAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={styles.tiendaBadge}>
                  <Text style={styles.tiendaBadgeText}>{item.tiendaCodigo}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER },
  resumenCard: { margin: 16, marginBottom: 8, backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: SURFACE_BORDER, padding: 18, alignItems: "center" },
  resumenLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  resumenTotal: { fontSize: 32, fontFamily: "Inter_700Bold", color: SUCCESS, marginTop: 4 },
  resumenSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_SEC, marginTop: 4 },
  tiendaResumenWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  tiendaResumenItem: { backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: SURFACE_BORDER, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", gap: 8, alignItems: "center" },
  tiendaResumenCodigo: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
  tiendaResumenMonto: { fontSize: 14, fontFamily: "Inter_700Bold", color: SUCCESS },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center" },
  card: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: SURFACE_BORDER, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardTotal: { fontSize: 20, fontFamily: "Inter_700Bold", color: TEXT },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_SEC, marginTop: 2 },
  cardFecha: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED, marginTop: 2 },
  tiendaBadge: { backgroundColor: `${BOSS_COLOR}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tiendaBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: BOSS_COLOR },
});
