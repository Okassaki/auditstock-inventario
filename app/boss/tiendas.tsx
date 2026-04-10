import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFS from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  crearTienda,
  editarTienda,
  eliminarTienda,
  obtenerTiendas,
  subirExcelTienda,
  type TiendaAPI,
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
  nombre: string;
  codigo: string;
}

export default function TiendasScreen() {
  const [tiendas, setTiendas] = useState<TiendaAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryingRef = useRef(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<TiendaAPI | null>(null);
  const [form, setForm] = useState<FormState>({ nombre: "", codigo: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState<string | null>(null);

  const fetchTiendas = useCallback(async (manual = false, attempt = 0) => {
    if (attempt === 0 && retryingRef.current) return;
    if (attempt === 0) retryingRef.current = true;
    if (manual) { retryingRef.current = true; setRefreshing(true); }
    if (attempt === 0) setError(null);
    try {
      const result = await obtenerTiendas();
      setTiendas(result);
      setError(null);
      retryingRef.current = false;
    } catch (e: any) {
      const msg: string = e?.message ?? "Error de conexión";
      const isTransient = msg.includes("404") || msg.includes("conexión") || msg.includes("Network") || msg.includes("fetch") || msg.includes("Failed");
      if (isTransient && attempt < 3) {
        const delay = (attempt + 1) * 3000;
        setError(`Reconectando... (${attempt + 1}/3)`);
        setTimeout(() => fetchTiendas(false, attempt + 1), delay);
        return;
      }
      setError(msg);
      retryingRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTiendas(); }, [fetchTiendas]);

  function abrirCrear() {
    setEditTarget(null);
    setForm({ nombre: "", codigo: "" });
    setFormError(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function abrirEditar(tienda: TiendaAPI) {
    setEditTarget(tienda);
    setForm({ nombre: tienda.nombre, codigo: tienda.codigo });
    setFormError(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleGuardar() {
    const nombre = form.nombre.trim();
    const codigo = form.codigo.trim().toUpperCase();
    if (!nombre) { setFormError("El nombre no puede estar vacío"); return; }
    if (!codigo) { setFormError("El código no puede estar vacío"); return; }
    if (!/^[A-Z0-9_-]+$/.test(codigo)) {
      setFormError("El código solo puede tener letras, números, guiones y guiones bajos");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editTarget) {
        const updated = await editarTienda(editTarget.codigo, { nombre, codigo });
        setTiendas((prev) => prev.map((t) => t.codigo === editTarget.codigo ? updated : t));
      } else {
        const created = await crearTienda(codigo, nombre);
        setTiendas((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
    } catch (e: any) {
      setFormError(e?.message ?? "Error al guardar");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  async function handleCargarExcel(tienda: TiendaAPI) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      let base64 = "";
      let nombreArchivo = "";

      if (Platform.OS === "web") {
        // Web: usar input nativo
        const archivo = await new Promise<File | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          let settled = false;
          const settle = (val: File | null) => { if (!settled) { settled = true; resolve(val); } };
          input.onchange = () => settle(input.files?.[0] ?? null);
          window.addEventListener("focus", function onF() { window.removeEventListener("focus", onF); setTimeout(() => settle(null), 500); }, { once: true });
          input.click();
        });
        if (!archivo) return;
        nombreArchivo = archivo.name;
        const ab = await archivo.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        base64 = btoa(binary);
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "*/*"],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        nombreArchivo = asset.name ?? "archivo.xlsx";
        base64 = await LegacyFS.readAsStringAsync(asset.uri, {
          encoding: LegacyFS.EncodingType.Base64,
        });
      }

      setUploadingExcel(tienda.codigo);
      await subirExcelTienda(tienda.codigo, nombreArchivo, base64);
      setUploadingExcel(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Excel enviado", `"${nombreArchivo}" fue enviado a ${tienda.nombre}.\n\nLa tienda lo verá al abrir la app.`);
    } catch (e: any) {
      setUploadingExcel(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error al subir", e?.message ?? "No se pudo enviar el Excel");
    }
  }

  function handleEliminar(tienda: TiendaAPI) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Eliminar tienda",
      `¿Eliminar "${tienda.nombre}" (${tienda.codigo})? Se borrarán también todas sus auditorías del servidor.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await eliminarTienda(tienda.codigo);
              setTiendas((prev) => prev.filter((t) => t.codigo !== tienda.codigo));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "No se pudo eliminar");
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BOSS_COLOR} />
        <Text style={styles.loadingText}>Cargando tiendas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tiendas</Text>
        <TouchableOpacity style={styles.addBtn} onPress={abrirCrear}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Nueva</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Feather name="wifi-off" size={14} color={DANGER} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={tiendas}
        keyExtractor={(t) => t.codigo}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardNombre}>{item.nombre}</Text>
                <View style={styles.codigoWrap}>
                  <Feather name="tag" size={11} color={BOSS_COLOR} />
                  <Text style={styles.cardCodigo}>{item.codigo}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => abrirEditar(item)}>
                  <Feather name="edit-2" size={16} color={BOSS_COLOR} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: "#22C55E" + "50", backgroundColor: "#22C55E" + "15" }]}
                  onPress={() => handleCargarExcel(item)}
                  disabled={uploadingExcel === item.codigo}
                >
                  {uploadingExcel === item.codigo
                    ? <ActivityIndicator size="small" color="#22C55E" />
                    : <Feather name="upload" size={16} color="#22C55E" />
                  }
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleEliminar(item)}>
                  <Feather name="trash-2" size={16} color={DANGER} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchTiendas(true)}
            tintColor={BOSS_COLOR}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="map-pin" size={40} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>No hay tiendas</Text>
            <Text style={styles.emptyDesc}>Tocá "Nueva" para agregar la primera tienda</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => { if (!saving) setModalVisible(false); }}>
        <KeyboardAvoidingView
          style={styles.kavFull}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={() => { if (!saving) setModalVisible(false); }}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>
                    {editTarget ? "Editar tienda" : "Nueva tienda"}
                  </Text>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Nombre de la tienda</Text>
                    <TextInput
                      style={[styles.input, formError && !form.nombre.trim() ? styles.inputError : null]}
                      placeholder="Ej: Sucursal Centro"
                      placeholderTextColor={TEXT_MUTED}
                      value={form.nombre}
                      onChangeText={(v) => { setForm((f) => ({ ...f, nombre: v })); setFormError(null); }}
                      autoCorrect={false}
                      editable={!saving}
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Código único</Text>
                    <TextInput
                      style={[styles.input, styles.inputMono, formError && !form.codigo.trim() ? styles.inputError : null]}
                      placeholder="Ej: T001"
                      placeholderTextColor={TEXT_MUTED}
                      value={form.codigo}
                      onChangeText={(v) => { setForm((f) => ({ ...f, codigo: v.toUpperCase() })); setFormError(null); }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!saving}
                      returnKeyType="done"
                      onSubmitEditing={handleGuardar}
                    />
                    <Text style={styles.fieldHint}>Solo letras, números, - y _</Text>
                  </View>

                  {formError && (
                    <View style={styles.formErrorRow}>
                      <Feather name="alert-circle" size={13} color={DANGER} />
                      <Text style={styles.formErrorText}>{formError}</Text>
                    </View>
                  )}

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setModalVisible(false)}
                      disabled={saving}
                    >
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                      onPress={handleGuardar}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Feather name={editTarget ? "check" : "plus"} size={16} color="#fff" />
                          <Text style={styles.saveBtnText}>{editTarget ? "Guardar" : "Crear"}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: TEXT_SEC, fontFamily: "Inter_400Regular", fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: TEXT },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: BOSS_COLOR,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${DANGER}15`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER, flex: 1 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    padding: 16,
  },
  cardMain: { flexDirection: "row", alignItems: "center" },
  cardInfo: { flex: 1, gap: 6 },
  cardNombre: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT },
  codigoWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardCodigo: { fontSize: 12, fontFamily: "Inter_500Medium", color: BOSS_COLOR, letterSpacing: 1 },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${BOSS_COLOR}15`,
    borderWidth: 1,
    borderColor: `${BOSS_COLOR}30`,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDanger: {
    backgroundColor: `${DANGER}15`,
    borderColor: `${DANGER}30`,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: TEXT_MUTED },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center" },
  kavFull: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: {
    backgroundColor: SURFACE_ELEV,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    gap: 16,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: TEXT },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: TEXT_SEC },
  input: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: TEXT,
  },
  inputMono: { fontFamily: "Inter_600SemiBold", letterSpacing: 2 },
  inputError: { borderColor: DANGER },
  fieldHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: TEXT_MUTED },
  formErrorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  formErrorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER, flex: 1 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium", color: TEXT_SEC },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: BOSS_COLOR,
    paddingVertical: 13,
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
