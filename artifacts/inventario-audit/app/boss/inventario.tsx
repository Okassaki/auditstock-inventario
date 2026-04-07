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
import {
  obtenerProductos,
  crearProducto,
  editarProducto,
  eliminarProducto,
  type ProductoAPI,
} from "@/utils/api";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_ELEV = "#221C40";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_SEC = "#8B7FBA";
const TEXT_MUTED = "#6B5FA8";
const DANGER = "#FF4757";
const SUCCESS = "#00C896";

interface FormState {
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: string;
  stockMinimo: string;
}

const FORM_EMPTY: FormState = { codigo: "", nombre: "", descripcion: "", precio: "0", stockMinimo: "0" };

export default function BossInventarioScreen() {
  const insets = useSafeAreaInsets();
  const [productos, setProductos] = useState<ProductoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductoAPI | null>(null);
  const [form, setForm] = useState<FormState>(FORM_EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProductos = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = await obtenerProductos();
      setProductos(data);
    } catch (e: any) {
      setError(e?.message ?? "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProductos(); }, [fetchProductos]);

  function abrirCrear() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditTarget(null);
    setForm(FORM_EMPTY);
    setFormError(null);
    setModal(true);
  }

  function abrirEditar(p: ProductoAPI) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditTarget(p);
    setForm({ codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion ?? "", precio: p.precio, stockMinimo: String(p.stockMinimo) });
    setFormError(null);
    setModal(true);
  }

  async function guardar() {
    const { codigo, nombre, precio } = form;
    if (!nombre.trim()) { setFormError("El nombre no puede estar vacío"); return; }
    if (!editTarget && !codigo.trim()) { setFormError("El código no puede estar vacío"); return; }
    if (isNaN(parseFloat(precio)) || parseFloat(precio) < 0) { setFormError("El precio debe ser un número válido"); return; }
    setFormError(null);
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await editarProducto(editTarget.codigo, {
          nombre: nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          precio: parseFloat(precio).toFixed(2),
          stockMinimo: parseInt(form.stockMinimo) || 0,
        });
        setProductos((prev) => prev.map((p) => p.codigo === editTarget.codigo ? updated : p));
      } else {
        const created = await crearProducto({
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          precio: parseFloat(precio).toFixed(2),
          stockMinimo: parseInt(form.stockMinimo) || 0,
        });
        setProductos((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(false);
    } catch (e: any) {
      setFormError(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function confirmarEliminar(p: ProductoAPI) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Eliminar producto", `¿Eliminar "${p.nombre}"? Se quitará del catálogo de todas las tiendas.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            await eliminarProducto(p.codigo);
            setProductos((prev) => prev.filter((x) => x.codigo !== p.codigo));
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? "No se pudo eliminar");
          }
        }
      },
    ]);
  }

  const filtrado = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: 8 }]}>
      <View style={styles.topRow}>
        <View style={[styles.searchWrap]}>
          <Feather name="search" size={14} color={TEXT_MUTED} />
          <TextInput style={styles.searchInput} placeholder="Buscar producto..." placeholderTextColor={TEXT_MUTED} value={busqueda} onChangeText={setBusqueda} />
          {busqueda.length > 0 && <TouchableOpacity onPress={() => setBusqueda("")}><Feather name="x" size={14} color={TEXT_MUTED} /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={abrirCrear}>
          <Feather name="plus" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={13} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={BOSS_COLOR} /></View>
      ) : (
        <FlatList
          data={filtrado}
          keyExtractor={(p) => p.codigo}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchProductos(true)} tintColor={BOSS_COLOR} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="package" size={40} color={TEXT_MUTED} />
              <Text style={styles.emptyText}>{busqueda ? "Sin resultados" : "No hay productos en el catálogo"}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNombre} numberOfLines={1}>{item.nombre}</Text>
                  <Text style={styles.cardCodigo}>{item.codigo}</Text>
                </View>
                <Text style={styles.cardPrecio}>$ {parseFloat(item.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Text>
              </View>
              {item.descripcion ? <Text style={styles.cardDesc} numberOfLines={1}>{item.descripcion}</Text> : null}
              <View style={styles.cardBottom}>
                {item.stockMinimo > 0 && <Text style={styles.minText}>Stock mín: {item.stockMinimo}</Text>}
                <View style={styles.actBtns}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => abrirEditar(item)}>
                    <Feather name="edit-2" size={14} color={BOSS_COLOR} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmarEliminar(item)}>
                    <Feather name="trash-2" size={14} color={DANGER} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editTarget ? "Editar Producto" : "Nuevo Producto"}</Text>
            {!editTarget && (
              <>
                <Text style={styles.modalLabel}>Código</Text>
                <TextInput
                  style={styles.modalInput}
                  value={form.codigo}
                  onChangeText={(v) => setForm((f) => ({ ...f, codigo: v.toUpperCase() }))}
                  placeholder="Ej: PROD001"
                  placeholderTextColor={TEXT_MUTED}
                  autoCapitalize="characters"
                />
              </>
            )}
            <Text style={styles.modalLabel}>Nombre</Text>
            <TextInput style={styles.modalInput} value={form.nombre} onChangeText={(v) => { setForm((f) => ({ ...f, nombre: v })); setFormError(null); }} placeholder="Nombre del producto" placeholderTextColor={TEXT_MUTED} />
            <Text style={styles.modalLabel}>Descripción (opcional)</Text>
            <TextInput style={styles.modalInput} value={form.descripcion} onChangeText={(v) => setForm((f) => ({ ...f, descripcion: v }))} placeholder="Descripción" placeholderTextColor={TEXT_MUTED} />
            <Text style={styles.modalLabel}>Precio</Text>
            <TextInput style={styles.modalInput} value={form.precio} onChangeText={(v) => setForm((f) => ({ ...f, precio: v }))} placeholder="0.00" placeholderTextColor={TEXT_MUTED} keyboardType="decimal-pad" />
            <Text style={styles.modalLabel}>Stock mínimo</Text>
            <TextInput style={styles.modalInput} value={form.stockMinimo} onChangeText={(v) => setForm((f) => ({ ...f, stockMinimo: v }))} placeholder="0" placeholderTextColor={TEXT_MUTED} keyboardType="numeric" />
            {formError && <Text style={styles.formErrorText}>{formError}</Text>}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={guardar} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: SURFACE_BORDER, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: TEXT },
  addBtn: { backgroundColor: BOSS_COLOR, borderRadius: 10, padding: 10 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER, flex: 1 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center" },
  card: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: SURFACE_BORDER, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 },
  cardNombre: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT, flex: 1, marginRight: 8 },
  cardCodigo: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED, marginTop: 2 },
  cardPrecio: { fontSize: 16, fontFamily: "Inter_700Bold", color: SUCCESS },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_SEC, marginBottom: 8 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  minText: { fontSize: 12, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  actBtns: { flexDirection: "row", gap: 8 },
  editBtn: { padding: 7, backgroundColor: `${BOSS_COLOR}18`, borderRadius: 8 },
  deleteBtn: { padding: 7, backgroundColor: `${DANGER}18`, borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: "90%", backgroundColor: SURFACE, borderRadius: 20, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: TEXT, marginBottom: 4 },
  modalLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  modalInput: { backgroundColor: SURFACE_ELEV, borderWidth: 1, borderColor: SURFACE_BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular", color: TEXT },
  formErrorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: SURFACE_BORDER },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: TEXT_SEC },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: BOSS_COLOR },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
