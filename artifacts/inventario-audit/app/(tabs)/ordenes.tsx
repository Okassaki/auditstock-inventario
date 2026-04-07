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
  obtenerOrdenes,
  crearOrden,
  actualizarOrden,
  eliminarOrden,
  type OrdenTrabajoAPI,
} from "@/utils/api";

type EstadoOrden = OrdenTrabajoAPI["estado"];
type PrioridadOrden = OrdenTrabajoAPI["prioridad"];

const ESTADOS: { value: EstadoOrden; label: string; color: string }[] = [
  { value: "pendiente", label: "Pendiente", color: "#FFB800" },
  { value: "en_proceso", label: "En proceso", color: "#3B82F6" },
  { value: "listo", label: "Listo", color: "#00C896" },
  { value: "entregado", label: "Entregado", color: "#8B5CF6" },
  { value: "cancelado", label: "Cancelado", color: "#FF4757" },
];

const PRIORIDADES: { value: PrioridadOrden; label: string; color: string }[] = [
  { value: "baja", label: "Baja", color: "#6B7280" },
  { value: "normal", label: "Normal", color: "#3B82F6" },
  { value: "alta", label: "Alta", color: "#FFB800" },
  { value: "urgente", label: "Urgente", color: "#FF4757" },
];

function estadoInfo(e: EstadoOrden) { return ESTADOS.find((s) => s.value === e) ?? ESTADOS[0]; }
function prioridadInfo(p: PrioridadOrden) { return PRIORIDADES.find((s) => s.value === p) ?? PRIORIDADES[1]; }

export default function OrdenesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { storeConfig } = useStoreConfig();

  const [ordenes, setOrdenes] = useState<OrdenTrabajoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | "todas">("todas");

  const [modalNueva, setModalNueva] = useState(false);
  const [modalDetalle, setModalDetalle] = useState<OrdenTrabajoAPI | null>(null);

  const [form, setForm] = useState({ clienteNombre: "", clienteContacto: "", descripcion: "", tecnico: "", presupuesto: "", notas: "" });
  const [prioridad, setPrioridad] = useState<PrioridadOrden>("normal");
  const [saving, setSaving] = useState(false);

  const fetchOrdenes = useCallback(async (manual = false) => {
    if (!storeConfig) return;
    if (manual) setRefreshing(true);
    try {
      const data = await obtenerOrdenes(storeConfig.codigo);
      setOrdenes(data);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, [storeConfig]);

  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);

  async function crearNueva() {
    if (!storeConfig) return;
    if (!form.clienteNombre.trim() || !form.descripcion.trim()) {
      Alert.alert("Campos requeridos", "El nombre del cliente y la descripción son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const orden = await crearOrden(storeConfig.codigo, {
        clienteNombre: form.clienteNombre.trim(),
        clienteContacto: form.clienteContacto.trim() || undefined,
        descripcion: form.descripcion.trim(),
        tecnico: form.tecnico.trim() || undefined,
        presupuesto: form.presupuesto.trim() || undefined,
        notas: form.notas.trim() || undefined,
        prioridad,
      });
      setOrdenes((prev) => [orden, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalNueva(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo crear la orden");
    } finally {
      setSaving(false);
    }
  }

  async function cambiarEstado(orden: OrdenTrabajoAPI, estado: EstadoOrden) {
    if (!storeConfig) return;
    try {
      const updated = await actualizarOrden(storeConfig.codigo, orden.id, { estado });
      setOrdenes((prev) => prev.map((o) => o.id === orden.id ? updated : o));
      setModalDetalle(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo actualizar");
    }
  }

  function eliminarOrdenConfirm(orden: OrdenTrabajoAPI) {
    Alert.alert("Eliminar orden", `¿Eliminar ${orden.numero}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: async () => {
          if (!storeConfig) return;
          try {
            await eliminarOrden(storeConfig.codigo, orden.id);
            setOrdenes((prev) => prev.filter((o) => o.id !== orden.id));
            setModalDetalle(null);
          } catch (e: any) { Alert.alert("Error", e?.message ?? "No se pudo eliminar"); }
        }
      },
    ]);
  }

  const ordenesFiltradas = filtroEstado === "todas" ? ordenes : ordenes.filter((o) => o.estado === filtroEstado);

  if (!storeConfig) {
    return <View style={[styles.center, { backgroundColor: C.background }]}><Text style={{ color: C.textMuted }}>Configurá la tienda primero</Text></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, { borderBottomColor: C.surfaceBorder }]}>
        <Text style={[styles.title, { color: C.text }]}>Órdenes</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: C.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setForm({ clienteNombre: "", clienteContacto: "", descripcion: "", tecnico: "", presupuesto: "", notas: "" }); setPrioridad("normal"); setModalNueva(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Nueva OT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll} contentContainerStyle={styles.filtrosContent}>
        {[{ value: "todas", label: "Todas" }, ...ESTADOS.map((e) => ({ value: e.value, label: e.label }))].map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filtroBtn, { borderColor: filtroEstado === f.value ? C.primary : C.surfaceBorder, backgroundColor: filtroEstado === f.value ? `${C.primary}18` : C.surface }]}
            onPress={() => setFiltroEstado(f.value as EstadoOrden | "todas")}
          >
            <Text style={[styles.filtroBtnText, { color: filtroEstado === f.value ? C.primary : C.textSecondary }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={ordenesFiltradas}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrdenes(true)} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="tool" size={40} color={C.textMuted} />
              <Text style={[styles.emptyText, { color: C.textMuted }]}>No hay órdenes de trabajo</Text>
            </View>
          }
          renderItem={({ item }) => {
            const eInfo = estadoInfo(item.estado);
            const pInfo = prioridadInfo(item.prioridad);
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalDetalle(item); }}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardNumero, { color: C.textMuted }]}>{item.numero}</Text>
                  <View style={[styles.badge, { backgroundColor: `${eInfo.color}18` }]}>
                    <Text style={[styles.badgeText, { color: eInfo.color }]}>{eInfo.label}</Text>
                  </View>
                </View>
                <Text style={[styles.cardCliente, { color: C.text }]}>{item.clienteNombre}</Text>
                <Text style={[styles.cardDesc, { color: C.textSecondary }]} numberOfLines={2}>{item.descripcion}</Text>
                <View style={styles.cardFooter}>
                  <View style={[styles.badge, { backgroundColor: `${pInfo.color}18` }]}>
                    <Text style={[styles.badgeText, { color: pInfo.color }]}>{pInfo.label}</Text>
                  </View>
                  {item.tecnico ? <Text style={[styles.cardTecnico, { color: C.textMuted }]}><Feather name="user" size={11} /> {item.tecnico}</Text> : null}
                  {item.presupuesto ? <Text style={[styles.cardPresup, { color: C.primary }]}>$ {parseFloat(item.presupuesto).toLocaleString("es-AR")}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={modalNueva} transparent animationType="slide" onRequestClose={() => setModalNueva(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={{ width: "100%" }}>
            <View style={[styles.modalBox, { backgroundColor: C.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: C.text }]}>Nueva Orden de Trabajo</Text>
                <TouchableOpacity onPress={() => setModalNueva(false)}><Feather name="x" size={22} color={C.textMuted} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {[
                  { field: "clienteNombre", placeholder: "Nombre del cliente *", required: true },
                  { field: "clienteContacto", placeholder: "Contacto del cliente (teléfono/email)" },
                  { field: "descripcion", placeholder: "Descripción del problema *", multiline: true, required: true },
                  { field: "tecnico", placeholder: "Técnico asignado" },
                  { field: "presupuesto", placeholder: "Presupuesto estimado", keyboardType: "numeric" },
                  { field: "notas", placeholder: "Notas adicionales", multiline: true },
                ].map(({ field, placeholder, multiline, keyboardType }) => (
                  <TextInput
                    key={field}
                    style={[styles.input, { backgroundColor: C.surface, borderColor: C.surfaceBorder, color: C.text }, multiline && { minHeight: 72, textAlignVertical: "top" }]}
                    placeholder={placeholder}
                    placeholderTextColor={C.textMuted}
                    value={(form as any)[field]}
                    onChangeText={(v) => setForm((f) => ({ ...f, [field]: v }))}
                    multiline={multiline}
                    keyboardType={keyboardType as any}
                  />
                ))}
                <Text style={[styles.secLabel, { color: C.textSecondary }]}>Prioridad</Text>
                <View style={styles.metodosRow}>
                  {PRIORIDADES.map((p) => (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.metodoBtn, { borderColor: prioridad === p.value ? p.color : C.surfaceBorder, backgroundColor: prioridad === p.value ? `${p.color}18` : C.surface }]}
                      onPress={() => setPrioridad(p.value)}
                    >
                      <Text style={[styles.metodoBtnText, { color: prioridad === p.value ? p.color : C.textSecondary }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: C.primary }, saving && { opacity: 0.5 }]}
                  onPress={crearNueva} disabled={saving}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBtnText}>Crear Orden</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!modalDetalle} transparent animationType="slide" onRequestClose={() => setModalDetalle(null)}>
        {modalDetalle && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: C.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: C.text }]}>{modalDetalle.numero}</Text>
                <TouchableOpacity onPress={() => setModalDetalle(null)}><Feather name="x" size={22} color={C.textMuted} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                <View style={[styles.detalleBlock, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                  <Text style={[styles.detalleLabel, { color: C.textMuted }]}>Cliente</Text>
                  <Text style={[styles.detalleVal, { color: C.text }]}>{modalDetalle.clienteNombre}</Text>
                  {modalDetalle.clienteContacto ? <Text style={[styles.detalleVal, { color: C.textSecondary, fontSize: 13 }]}>{modalDetalle.clienteContacto}</Text> : null}
                </View>
                <View style={[styles.detalleBlock, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                  <Text style={[styles.detalleLabel, { color: C.textMuted }]}>Descripción</Text>
                  <Text style={[styles.detalleVal, { color: C.text }]}>{modalDetalle.descripcion}</Text>
                </View>
                {modalDetalle.diagnostico ? (
                  <View style={[styles.detalleBlock, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                    <Text style={[styles.detalleLabel, { color: C.textMuted }]}>Diagnóstico</Text>
                    <Text style={[styles.detalleVal, { color: C.text }]}>{modalDetalle.diagnostico}</Text>
                  </View>
                ) : null}
                <Text style={[styles.secLabel, { color: C.textSecondary }]}>Cambiar estado</Text>
                <View style={styles.metodosRow}>
                  {ESTADOS.map((e) => (
                    <TouchableOpacity
                      key={e.value}
                      style={[styles.metodoBtn, { borderColor: modalDetalle.estado === e.value ? e.color : C.surfaceBorder, backgroundColor: modalDetalle.estado === e.value ? `${e.color}18` : C.surface }]}
                      onPress={() => cambiarEstado(modalDetalle, e.value)}
                    >
                      <Text style={[styles.metodoBtnText, { color: modalDetalle.estado === e.value ? e.color : C.textSecondary }]}>{e.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.deleteFullBtn, { borderColor: "#FF4757" }]} onPress={() => eliminarOrdenConfirm(modalDetalle)}>
                  <Feather name="trash-2" size={15} color="#FF4757" />
                  <Text style={styles.deleteBtnText}>Eliminar orden</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}
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
  filtrosScroll: { maxHeight: 48 },
  filtrosContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: "center" },
  filtroBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  filtroBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNumero: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardCliente: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTecnico: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardPresup: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  secLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  metodosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metodoBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  metodoBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4, marginBottom: 8 },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  detalleBlock: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  detalleLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  detalleVal: { fontSize: 15, fontFamily: "Inter_500Medium" },
  deleteFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12, marginBottom: 8 },
  deleteBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FF4757" },
});
