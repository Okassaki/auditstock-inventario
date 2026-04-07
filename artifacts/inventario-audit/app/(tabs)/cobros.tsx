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
  ScrollView,
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
  obtenerVentas,
  crearVenta,
  eliminarVenta,
  obtenerProductos,
  type VentaAPI,
  type ProductoAPI,
} from "@/utils/api";

interface ItemCarrito {
  productoCodigo: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: string;
}

const METODOS = ["efectivo", "tarjeta", "transferencia", "otro"] as const;
const METODO_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", otro: "Otro" };

export default function CobrosScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { storeConfig } = useStoreConfig();

  const [ventas, setVentas] = useState<VentaAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalNueva, setModalNueva] = useState(false);
  const [modalProd, setModalProd] = useState(false);
  const [productos, setProductos] = useState<ProductoAPI[]>([]);
  const [busqProd, setBusqProd] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [metodo, setMetodo] = useState<typeof METODOS[number]>("efectivo");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchVentas = useCallback(async (manual = false) => {
    if (!storeConfig) return;
    if (manual) setRefreshing(true);
    try {
      const data = await obtenerVentas(storeConfig.codigo);
      setVentas(data);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, [storeConfig]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  async function abrirNueva() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCarrito([]); setCliente(""); setContacto(""); setMetodo("efectivo"); setNotas("");
    try {
      const ps = await obtenerProductos();
      setProductos(ps);
    } catch {
      Alert.alert("Sin conexión", "No se pudo cargar el catálogo de productos. Podés ingresar los datos manualmente.");
      setProductos([]);
    }
    setModalNueva(true);
  }

  function agregarAlCarrito(prod: ProductoAPI) {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.productoCodigo === prod.codigo);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], cantidad: updated[idx].cantidad + 1 };
        return updated;
      }
      return [...prev, { productoCodigo: prod.codigo, productoNombre: prod.nombre, cantidad: 1, precioUnitario: prod.precio }];
    });
    setModalProd(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function cambiarCantidad(idx: number, delta: number) {
    setCarrito((prev) => {
      const updated = [...prev];
      const nueva = updated[idx].cantidad + delta;
      if (nueva <= 0) { updated.splice(idx, 1); return updated; }
      updated[idx] = { ...updated[idx], cantidad: nueva };
      return updated;
    });
  }

  const total = carrito.reduce((acc, i) => acc + parseFloat(i.precioUnitario) * i.cantidad, 0);

  async function confirmarVenta() {
    if (!storeConfig) return;
    if (carrito.length === 0) { Alert.alert("Carrito vacío", "Agregá al menos un producto."); return; }
    setSaving(true);
    try {
      const venta = await crearVenta(storeConfig.codigo, {
        clienteNombre: cliente.trim() || undefined,
        clienteContacto: contacto.trim() || undefined,
        metodoPago: metodo,
        notas: notas.trim() || undefined,
        items: carrito,
      });
      setVentas((prev) => [venta, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalNueva(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo registrar la venta");
    } finally {
      setSaving(false);
    }
  }

  function eliminar(venta: VentaAPI) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Eliminar cobro", `¿Eliminar el cobro #${venta.id}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: async () => {
          if (!storeConfig) return;
          try {
            await eliminarVenta(storeConfig.codigo, venta.id);
            setVentas((prev) => prev.filter((v) => v.id !== venta.id));
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? "No se pudo eliminar");
          }
        }
      },
    ]);
  }

  const prodFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqProd.toLowerCase()) || p.codigo.toLowerCase().includes(busqProd.toLowerCase())
  );

  if (!storeConfig) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Text style={{ color: C.textMuted }}>Configurá la tienda primero</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, { borderBottomColor: C.surfaceBorder }]}>
        <Text style={[styles.title, { color: C.text }]}>Cobros</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: C.primary }]} onPress={abrirNueva}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Nuevo cobro</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchVentas(true)} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="dollar-sign" size={40} color={C.textMuted} />
              <Text style={[styles.emptyText, { color: C.textMuted }]}>No hay cobros registrados</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTotal, { color: C.text }]}>
                    $ {parseFloat(item.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.cardSub, { color: C.textSecondary }]}>
                    {item.clienteNombre || "Cliente no especificado"} · {METODO_LABEL[item.metodoPago] ?? item.metodoPago}
                  </Text>
                  <Text style={[styles.cardFecha, { color: C.textMuted }]}>
                    {new Date(item.creadoAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => eliminar(item)} style={styles.deleteBtn}>
                  <Feather name="trash-2" size={16} color="#FF4757" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalNueva} transparent animationType="slide" onRequestClose={() => setModalNueva(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={{ width: "100%" }}>
            <View style={[styles.modalBox, { backgroundColor: C.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: C.text }]}>Nuevo Cobro</Text>
                <TouchableOpacity onPress={() => setModalNueva(false)}><Feather name="x" size={22} color={C.textMuted} /></TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                <View style={styles.seccion}>
                  <Text style={[styles.secLabel, { color: C.textSecondary }]}>Productos</Text>
                  {carrito.map((item, idx) => (
                    <View key={item.productoCodigo} style={[styles.carritoItem, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.carritoNombre, { color: C.text }]} numberOfLines={1}>{item.productoNombre}</Text>
                        <Text style={[styles.carritoPrecio, { color: C.textSecondary }]}>
                          $ {(parseFloat(item.precioUnitario) * item.cantidad).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                      <View style={styles.cantRow}>
                        <TouchableOpacity onPress={() => cambiarCantidad(idx, -1)} style={styles.cantBtn}>
                          <Feather name="minus" size={14} color={C.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.cantNum, { color: C.text }]}>{item.cantidad}</Text>
                        <TouchableOpacity onPress={() => cambiarCantidad(idx, 1)} style={styles.cantBtn}>
                          <Feather name="plus" size={14} color={C.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.addProdBtn, { borderColor: C.primary }]}
                    onPress={() => { setBusqProd(""); setModalProd(true); }}
                  >
                    <Feather name="plus" size={15} color={C.primary} />
                    <Text style={[styles.addProdText, { color: C.primary }]}>Agregar producto</Text>
                  </TouchableOpacity>
                  {carrito.length > 0 && (
                    <View style={[styles.totalRow, { borderTopColor: C.surfaceBorder }]}>
                      <Text style={[styles.totalLabel, { color: C.textSecondary }]}>Total</Text>
                      <Text style={[styles.totalNum, { color: C.text }]}>
                        $ {total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}
                </View>

                <TextInput style={[styles.input, { backgroundColor: C.surface, borderColor: C.surfaceBorder, color: C.text }]}
                  placeholder="Nombre del cliente (opcional)" placeholderTextColor={C.textMuted}
                  value={cliente} onChangeText={setCliente} />
                <TextInput style={[styles.input, { backgroundColor: C.surface, borderColor: C.surfaceBorder, color: C.text }]}
                  placeholder="Contacto del cliente (opcional)" placeholderTextColor={C.textMuted}
                  value={contacto} onChangeText={setContacto} />

                <View style={styles.metodosRow}>
                  {METODOS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.metodoBtn, { borderColor: metodo === m ? C.primary : C.surfaceBorder, backgroundColor: metodo === m ? `${C.primary}18` : C.surface }]}
                      onPress={() => setMetodo(m)}
                    >
                      <Text style={[styles.metodoBtnText, { color: metodo === m ? C.primary : C.textSecondary }]}>{METODO_LABEL[m]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput style={[styles.input, { backgroundColor: C.surface, borderColor: C.surfaceBorder, color: C.text }]}
                  placeholder="Notas (opcional)" placeholderTextColor={C.textMuted}
                  value={notas} onChangeText={setNotas} />

                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: C.primary }, saving && { opacity: 0.5 }]}
                  onPress={confirmarVenta} disabled={saving}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBtnText}>Confirmar cobro</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={modalProd} transparent animationType="slide" onRequestClose={() => setModalProd(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.background, maxHeight: "70%" }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Elegir Producto</Text>
              <TouchableOpacity onPress={() => setModalProd(false)}><Feather name="x" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { backgroundColor: C.surface, borderColor: C.surfaceBorder, color: C.text }]}
              placeholder="Buscar..." placeholderTextColor={C.textMuted}
              value={busqProd} onChangeText={setBusqProd} autoFocus />
            <FlatList
              data={prodFiltrados}
              keyExtractor={(p) => p.codigo}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.prodItem, { borderBottomColor: C.surfaceBorder }]}
                  onPress={() => agregarAlCarrito(item)}
                >
                  <Text style={[styles.prodNombre, { color: C.text }]}>{item.nombre}</Text>
                  <Text style={[styles.prodPrecio, { color: C.primary }]}>
                    $ {parseFloat(item.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={[styles.emptyText, { color: C.textMuted }]}>Sin resultados</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardTotal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardFecha: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  seccion: { gap: 8 },
  secLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  carritoItem: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 10 },
  carritoNombre: { fontSize: 14, fontFamily: "Inter_500Medium" },
  carritoPrecio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cantRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cantBtn: { padding: 6 },
  cantNum: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  addProdBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", paddingVertical: 10 },
  addProdText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: 8 },
  totalLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  totalNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  metodosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metodoBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  metodoBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4, marginBottom: 8 },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  prodItem: { paddingVertical: 14, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  prodNombre: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  prodPrecio: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
