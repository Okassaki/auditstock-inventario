import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
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
} from "@/context/DatabaseContext";
import { SearchBar } from "@/components/ui/SearchBar";
import { ProductoCard } from "@/components/ui/ProductoCard";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";

export default function ConteoScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const { auditoriaActual, productos, actualizarConteo } = useDatabase();
  const [query, setQuery] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<"search" | "imei">("search");

  const [selectedProduct, setSelectedProduct] = useState<ProductoInventario | null>(null);
  const [stockInput, setStockInput] = useState("");
  const [imeiInput, setImeiInput] = useState("");
  const [imeisList, setImeisList] = useState<string[]>([]);
  const [showImeiScanner, setShowImeiScanner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const productosFiltrados = useMemo(() => {
    if (!query.trim()) return productos;
    const q = query.toLowerCase();
    return productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        (p.imeis_sistema && p.imeis_sistema.toLowerCase().includes(q)) ||
        (p.imeis_fisicos && p.imeis_fisicos.toLowerCase().includes(q))
    );
  }, [productos, query]);

  const handleScanSearch = (value: string) => {
    setShowScanner(false);
    setQuery(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleSelectProducto = (p: ProductoInventario) => {
    setSelectedProduct(p);
    setStockInput(p.stock_fisico !== null ? String(p.stock_fisico) : "");
    const imeis = p.imeis_fisicos
      ? p.imeis_fisicos.split(",").map((i) => i.trim()).filter(Boolean)
      : [];
    setImeisList(imeis);
    setImeiInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleGuardar = async () => {
    if (!selectedProduct) return;
    const stock = parseInt(stockInput, 10);
    if (isNaN(stock) || stock < 0) {
      Alert.alert("Stock inválido", "Ingresa un número mayor o igual a 0.");
      return;
    }
    setIsSaving(true);
    try {
      await actualizarConteo(selectedProduct.id, stock, imeisList);
      setSelectedProduct(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddImei = (imei: string) => {
    const clean = imei.trim();
    if (!clean) return;
    if (imeisList.includes(clean)) {
      Alert.alert("IMEI duplicado", "Este IMEI ya fue agregado.");
      return;
    }
    setImeisList((prev) => [...prev, clean]);
    setImeiInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveImei = (imei: string) => {
    setImeisList((prev) => prev.filter((i) => i !== imei));
  };

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  if (!auditoriaActual) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.emptyState, { paddingTop: topPad + 40 }]}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={64} color={C.textMuted} />
          <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
            Sin auditoría activa
          </Text>
          <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Ve a Inicio y selecciona o crea una auditoría para comenzar el conteo.
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
          Conteo Físico
        </Text>
        <Text style={[styles.headerSub, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
          {auditoriaActual.nombre}
        </Text>
        <View style={styles.headerSearch}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onScanPress={() => {
              setScannerMode("search");
              setShowScanner(true);
            }}
          />
        </View>
      </View>

      <FlatList
        data={productosFiltrados}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductoCard producto={item} onPress={() => handleSelectProducto(item)} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: botPad + 120 },
        ]}
        ListEmptyComponent={
          <View style={styles.listEmpty}>
            <Feather name="package" size={48} color={C.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
              {query ? "Sin resultados" : "Sin productos"}
            </Text>
            <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {query
                ? "Intenta con otro código, nombre o IMEI"
                : "Importa un archivo Excel para comenzar"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanSearch}
        title="Escanear para buscar"
      />

      <Modal
        visible={!!selectedProduct}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedProduct(null)}
      >
        {selectedProduct && (
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalBox,
                { backgroundColor: C.surface, paddingBottom: botPad + 16 },
              ]}
            >
              <View style={styles.modalHandle} />

              <View style={[styles.productHeader, { backgroundColor: C.surfaceElevated, borderRadius: 12, padding: 14 }]}>
                <Text style={[styles.productCodigo, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {selectedProduct.codigo}
                </Text>
                <Text style={[styles.productNombre, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                  {selectedProduct.nombre}
                </Text>
                <View style={styles.productStocks}>
                  <View style={styles.productStockItem}>
                    <Text style={[styles.productStockLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                      Stock Sistema
                    </Text>
                    <Text style={[styles.productStockVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                      {selectedProduct.stock_sistema}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={C.textMuted} />
                  <View style={styles.productStockItem}>
                    <Text style={[styles.productStockLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                      Stock Físico
                    </Text>
                    <Text style={[styles.productStockVal, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
                      {stockInput || "—"}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
                STOCK FÍSICO CONTADO
              </Text>
              <View style={styles.stockInputRow}>
                <TouchableOpacity
                  onPress={() => {
                    const v = Math.max(0, (parseInt(stockInput) || 0) - 1);
                    setStockInput(String(v));
                  }}
                  style={[styles.stockBtn, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder }]}
                >
                  <Feather name="minus" size={20} color={C.text} />
                </TouchableOpacity>
                <TextInput
                  value={stockInput}
                  onChangeText={(t) => {
                    const n = t.replace(/[^0-9]/g, "");
                    setStockInput(n);
                  }}
                  style={[
                    styles.stockInputField,
                    {
                      backgroundColor: C.surfaceElevated,
                      borderColor: C.primary,
                      color: C.text,
                      fontFamily: "Inter_700Bold",
                    },
                  ]}
                  keyboardType="number-pad"
                  textAlign="center"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  onPress={() => {
                    const v = (parseInt(stockInput) || 0) + 1;
                    setStockInput(String(v));
                  }}
                  style={[styles.stockBtn, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder }]}
                >
                  <Feather name="plus" size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              {selectedProduct.imeis_sistema && (
                <View style={styles.imeiSection}>
                  <Text style={[styles.inputLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
                    IMEIs FÍSICOS ({imeisList.length})
                  </Text>
                  <View style={styles.imeiInputRow}>
                    <TextInput
                      value={imeiInput}
                      onChangeText={setImeiInput}
                      placeholder="Ingresa o escanea IMEI"
                      placeholderTextColor={C.textMuted}
                      style={[
                        styles.imeiInput,
                        {
                          backgroundColor: C.surfaceElevated,
                          borderColor: C.surfaceBorder,
                          color: C.text,
                          fontFamily: "Inter_400Regular",
                          flex: 1,
                        },
                      ]}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={() => handleAddImei(imeiInput)}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setScannerMode("imei");
                        setShowImeiScanner(true);
                      }}
                      style={[styles.imeiScanBtn, { backgroundColor: C.primary }]}
                    >
                      <Feather name="camera" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAddImei(imeiInput)}
                      style={[styles.imeiAddBtn, { backgroundColor: C.success }]}
                    >
                      <Feather name="plus" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {imeisList.map((imei) => (
                    <View
                      key={imei}
                      style={[styles.imeiChip, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder }]}
                    >
                      <Feather name="cpu" size={12} color={C.primary} />
                      <Text style={[styles.imeiChipText, { color: C.text, fontFamily: "Inter_400Regular" }]}>
                        {imei}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveImei(imei)}>
                        <Feather name="x" size={14} color={C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  onPress={() => setSelectedProduct(null)}
                  style={[styles.btnSecondary, { borderColor: C.surfaceBorder }]}
                >
                  <Text style={[styles.btnSecondaryText, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleGuardar}
                  disabled={isSaving || !stockInput}
                  style={[
                    styles.btnPrimary,
                    { backgroundColor: stockInput ? C.primary : C.textMuted },
                  ]}
                >
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>
                    {isSaving ? "Guardando..." : "Guardar conteo"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <BarcodeScannerModal
          visible={showImeiScanner}
          onClose={() => setShowImeiScanner(false)}
          onScan={(val) => {
            setShowImeiScanner(false);
            handleAddImei(val);
          }}
          title="Escanear IMEI"
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 4,
  },
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 13, marginBottom: 8 },
  headerSearch: {},
  listContent: { padding: 16 },
  listEmpty: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  emptyTitle: { fontSize: 18 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 4,
  },
  productHeader: { gap: 6 },
  productCodigo: { fontSize: 13 },
  productNombre: { fontSize: 17, lineHeight: 22 },
  productStocks: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  productStockItem: { alignItems: "center", gap: 2 },
  productStockLabel: { fontSize: 11 },
  productStockVal: { fontSize: 28 },
  inputLabel: { fontSize: 11, letterSpacing: 0.8 },
  stockInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stockBtn: {
    width: 48,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stockInputField: {
    width: 90,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 26,
  },
  imeiSection: { gap: 10 },
  imeiInputRow: { flexDirection: "row", gap: 8 },
  imeiInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  imeiScanBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  imeiAddBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  imeiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  imeiChipText: { flex: 1, fontSize: 13 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { fontSize: 15 },
  btnPrimary: {
    flex: 2,
    height: 50,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 15 },
});
