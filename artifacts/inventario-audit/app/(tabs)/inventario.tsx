import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useStoreConfig } from "@/context/StoreConfigContext";
import {
  obtenerStockTienda,
  registrarMovimientoStock,
  type StockTiendaAPI,
} from "@/utils/api";

type MovTipo = "entrada" | "salida" | "ajuste";

export default function InventarioScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { storeConfig } = useStoreConfig();

  const [stock, setStock] = useState<StockTiendaAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [movModal, setMovModal] = useState(false);
  const [selectedProd, setSelectedProd] = useState<StockTiendaAPI | null>(null);
  const [movTipo, setMovTipo] = useState<MovTipo>("entrada");
  const [movCantidad, setMovCantidad] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchStock = useCallback(async (manual = false) => {
    if (!storeConfig) return;
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = await obtenerStockTienda(storeConfig.codigo);
      setStock(data);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeConfig]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  const filtrado = stock.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  function abrirMovimiento(prod: StockTiendaAPI, tipo: MovTipo) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProd(prod);
    setMovTipo(tipo);
    setMovCantidad("");
    setMovMotivo("");
    setMovModal(true);
  }

  async function confirmarMovimiento() {
    if (!storeConfig || !selectedProd) return;
    const cant = parseInt(movCantidad);
    if (isNaN(cant) || cant < 0) {
      Alert.alert("Cantidad inválida", "Ingresá un número válido mayor o igual a 0.");
      return;
    }
    setSaving(true);
    try {
      const res = await registrarMovimientoStock(storeConfig.codigo, {
        productoCodigo: selectedProd.codigo,
        tipo: movTipo,
        cantidad: cant,
        motivo: movMotivo.trim() || undefined,
      });
      setStock((prev) => prev.map((p) =>
        p.codigo === selectedProd.codigo ? { ...p, stockActual: res.stockActual } : p
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMovModal(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  function stockColor(prod: StockTiendaAPI) {
    if (prod.stockActual <= 0) return "#FF4757";
    if (prod.stockActual <= prod.stockMinimo) return "#FFB800";
    return C.primary;
  }

  if (!storeConfig) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Feather name="alert-circle" size={32} color={C.textMuted} />
        <Text style={[styles.emptyText, { color: C.textMuted }]}>Configurá la tienda primero</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, { borderBottomColor: C.surfaceBorder }]}>
        <Text style={[styles.title, { color: C.text }]}>Inventario</Text>
        <TouchableOpacity onPress={() => fetchStock(true)} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={C.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder }]}>
        <Feather name="search" size={15} color={C.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder="Buscar producto..."
          placeholderTextColor={C.textMuted}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda("")}>
            <Feather name="x" size={15} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={14} color="#FF4757" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtrado}
          keyExtractor={(p) => p.codigo}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStock(true)} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="package" size={40} color={C.textMuted} />
              <Text style={[styles.emptyText, { color: C.textMuted }]}>
                {busqueda ? "Sin resultados" : "No hay productos en el catálogo"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = stockColor(item);
            return (
              <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardNombre, { color: C.text }]} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={[styles.cardCodigo, { color: C.textSecondary }]}>{item.codigo}</Text>
                  </View>
                  <View style={[styles.stockBadge, { backgroundColor: `${color}18` }]}>
                    <Text style={[styles.stockNum, { color }]}>{item.stockActual}</Text>
                    <Text style={[styles.stockLabel, { color }]}>uds</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={[styles.precioText, { color: C.textSecondary }]}>
                    $ {parseFloat(item.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </Text>
                  {item.stockMinimo > 0 && (
                    <Text style={[styles.minText, { color: C.textMuted }]}>Mín: {item.stockMinimo}</Text>
                  )}
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.movBtn, { backgroundColor: `${"#00C896"}18`, borderColor: "#00C896" }]}
                      onPress={() => abrirMovimiento(item, "entrada")}
                    >
                      <Feather name="plus" size={13} color="#00C896" />
                      <Text style={[styles.movBtnText, { color: "#00C896" }]}>Entrada</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.movBtn, { backgroundColor: `${"#FF4757"}18`, borderColor: "#FF4757" }]}
                      onPress={() => abrirMovimiento(item, "salida")}
                    >
                      <Feather name="minus" size={13} color="#FF4757" />
                      <Text style={[styles.movBtnText, { color: "#FF4757" }]}>Salida</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.movBtn, { backgroundColor: `${C.primary}18`, borderColor: C.primary }]}
                      onPress={() => abrirMovimiento(item, "ajuste")}
                    >
                      <Feather name="edit-2" size={13} color={C.primary} />
                      <Text style={[styles.movBtnText, { color: C.primary }]}>Ajuste</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={movModal} transparent animationType="fade" onRequestClose={() => setMovModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {movTipo === "entrada" ? "Registrar Entrada" : movTipo === "salida" ? "Registrar Salida" : "Ajustar Stock"}
            </Text>
            {selectedProd && (
              <Text style={[styles.modalSub, { color: C.textSecondary }]}>{selectedProd.nombre}</Text>
            )}
            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>
              {movTipo === "ajuste" ? "Nuevo stock total" : "Cantidad"}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder, color: C.text }]}
              keyboardType="numeric"
              value={movCantidad}
              onChangeText={setMovCantidad}
              placeholder="0"
              placeholderTextColor={C.textMuted}
              autoFocus
            />
            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>Motivo (opcional)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder, color: C.text }]}
              value={movMotivo}
              onChangeText={setMovMotivo}
              placeholder="Ej: compra proveedor, devolución..."
              placeholderTextColor={C.textMuted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: C.surfaceBorder, borderWidth: 1 }]} onPress={() => setMovModal(false)}>
                <Text style={[styles.modalBtnText, { color: C.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.primary }, saving && { opacity: 0.5 }]}
                onPress={confirmarMovimiento}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.modalBtnText, { color: "#fff" }]}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  refreshBtn: { padding: 6 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, margin: 16, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#FF4757", flex: 1 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardInfo: { flex: 1, marginRight: 12 },
  cardNombre: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardCodigo: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  stockBadge: { alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  stockNum: { fontSize: 22, fontFamily: "Inter_700Bold" },
  stockLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  cardBottom: { gap: 8 },
  precioText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  minText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  btnRow: { flexDirection: "row", gap: 8 },
  movBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingVertical: 7 },
  movBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: "88%", borderRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -6 },
  modalLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
