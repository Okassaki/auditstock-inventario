import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useDatabase, type Auditoria } from "@/context/DatabaseContext";
import { parsearExcel } from "@/utils/excel";

export default function InicioScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const {
    cargarAuditorias,
    crearAuditoria,
    cargarAuditoria,
    auditoriaActual,
    eliminarAuditoria,
    limpiarAuditoriaActual,
    importarProductos,
  } = useDatabase();

  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [auditoriaAEliminar, setAuditoriaAEliminar] = useState<Auditoria | null>(null);
  const [resultModal, setResultModal] = useState<{ titulo: string; mensaje: string; audId?: number } | null>(null);

  const cargar = useCallback(async () => {
    const list = await cargarAuditorias();
    setAuditorias(list);
  }, [cargarAuditorias]);

  // Recargar la lista cada vez que el usuario vuelve a esta pestaña
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const handleCrear = async () => {
    const nombre = nombreNueva.trim();
    if (!nombre) {
      Alert.alert("Nombre requerido", "Ingresa un nombre para la auditoría.");
      return;
    }
    setIsCreating(true);
    try {
      const id = await crearAuditoria(nombre);
      await cargarAuditoria(id);
      setShowModal(false);
      setNombreNueva("");
      await cargar();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setIsCreating(false);
    }
  };

  /** En web: abre un <input type=file> nativo y devuelve el File seleccionado */
  const pickFileWeb = (): Promise<File | null> =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
      // Dar tiempo para que el diálogo se abra antes de escuchar cambios
      let settled = false;
      const settle = (val: File | null) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      input.onchange = () => settle(input.files?.[0] ?? null);
      // Si el usuario cierra sin elegir, el foco vuelve a la ventana
      window.addEventListener("focus", function onFocus() {
        window.removeEventListener("focus", onFocus);
        setTimeout(() => settle(null), 500);
      }, { once: true });
      input.click();
    });

  const handleImportar = async (audId: number) => {
    try {
      let nativeFile: File | undefined;
      let fileUri = "";

      if (Platform.OS === "web") {
        // Usar input nativo en lugar de expo-document-picker (más confiable en móvil)
        const picked = await pickFileWeb();
        if (!picked) return;
        nativeFile = picked;
        fileUri = "";
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "*/*",
          ],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        fileUri = asset.uri;
        nativeFile = (asset as any).file ?? undefined;
      }

      setIsImporting(true);
      setImportProgress("Leyendo archivo Excel...");

      const { productos, errores, diagnostico } = await parsearExcel(fileUri, nativeFile);

      if (productos.length === 0) {
        setIsImporting(false);
        const msg = errores.length > 0
          ? `No se pudieron leer productos.\n\nErrores:\n${errores.slice(0, 5).join("\n")}`
          : "El archivo no contiene productos válidos.";
        setResultModal({ titulo: "Sin datos", mensaje: msg });
        return;
      }

      const parsedCount = productos.length;
      setImportProgress(`Leídos: ${parsedCount} productos\nGuardando en base de datos...`);

      const { insertados, duplicados, errores: errImp, info: infoImp } = await importarProductos(
        productos.map((p) => ({
          codigo: p.codigo,
          nombre: p.nombre,
          stock_sistema: p.stock_sistema,
          imeis_sistema: p.imeis_sistema ?? null,
        })),
        audId,
        false
      );

      setIsImporting(false);

      let mensaje = "";
      if (diagnostico) mensaje += `📄 ${diagnostico}\n\n`;
      mensaje += `Leídos del Excel: ${parsedCount}\nGuardados en BD: ${insertados}`;
      if (duplicados > 0) mensaje += `\n(${duplicados} actualizados)`;
      if (infoImp) mensaje += `\n[${infoImp}]`;
      if (errImp.length > 0) mensaje += `\n\nAdvertencias:\n${errImp.slice(0, 5).join("\n")}`;
      if (errores.length > 0) mensaje += `\n\nAvisos del archivo:\n${errores.slice(0, 3).join("\n")}`;

      setResultModal({ titulo: "Importación completada ✓", mensaje, audId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await cargar();
    } catch (e) {
      setIsImporting(false);
      setResultModal({ titulo: "Error al importar", mensaje: String(e) });
    }
  };

  const handleSeleccionar = async (aud: Auditoria) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await cargarAuditoria(aud.id);
  };

  const handleEliminar = (aud: Auditoria) => {
    setAuditoriaAEliminar(aud);
  };

  const confirmarEliminar = async () => {
    if (!auditoriaAEliminar) return;
    const eraActiva = auditoriaActual?.id === auditoriaAEliminar.id;
    const idAEliminar = auditoriaAEliminar.id;

    // 1. Cerrar modal primero
    setAuditoriaAEliminar(null);

    try {
      // 2. Borrar en base de datos
      await eliminarAuditoria(idAEliminar);

      // 3. Si era la auditoría activa, limpiar estado AQUÍ (no desde dentro de eliminarAuditoria)
      if (eraActiva) {
        limpiarAuditoriaActual();
      }

      // 4. Recargar la lista
      await cargar();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.error("Error al eliminar:", e);
      Alert.alert("No se pudo eliminar", "Ocurrió un error. Intenta de nuevo.");
      await cargar();
    }
  };

  const progreso = auditoriaActual
    ? auditoriaActual.total_productos > 0
      ? Math.round((auditoriaActual.total_contados / auditoriaActual.total_productos) * 100)
      : 0
    : 0;

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

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
        <View>
          <Text style={[styles.appTitle, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
            AuditStock
          </Text>
          <Text style={[styles.appSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Sistema vs Stock Físico
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          style={[styles.newBtn, { backgroundColor: C.primary }]}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {auditoriaActual && (
        <View style={[styles.activeCard, { backgroundColor: C.primary + "18", borderColor: C.primary + "40" }]}>
          <View style={styles.activeLeft}>
            <View style={[styles.activeDot, { backgroundColor: C.success }]} />
            <View>
              <Text style={[styles.activeLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                Auditoría activa
              </Text>
              <Text style={[styles.activeName, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                {auditoriaActual.nombre}
              </Text>
            </View>
          </View>
          <View style={styles.activeRight}>
            <Text style={[styles.progressPct, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
              {progreso}%
            </Text>
            <Text style={[styles.progressDetail, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {auditoriaActual.total_contados}/{auditoriaActual.total_productos}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
            AUDITORÍAS
          </Text>
          <Text style={[styles.sectionCount, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            {auditorias.length} registros
          </Text>
        </View>

        {auditorias.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={C.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
              Sin auditorías
            </Text>
            <Text style={[styles.emptyDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Crea tu primera auditoría para comenzar
            </Text>
            <TouchableOpacity
              onPress={() => setShowModal(true)}
              style={[styles.emptyBtn, { backgroundColor: C.primary }]}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                Nueva auditoría
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          auditorias.map((aud) => {
            const isActiva = auditoriaActual?.id === aud.id;
            const prog =
              aud.total_productos > 0
                ? Math.round((aud.total_contados / aud.total_productos) * 100)
                : 0;
            return (
              <View
                key={aud.id}
                style={[
                  styles.audCard,
                  {
                    backgroundColor: C.surface,
                    borderColor: isActiva ? C.primary : C.surfaceBorder,
                    borderWidth: isActiva ? 1.5 : 1,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => handleSeleccionar(aud)}
                  style={styles.audCardBody}
                >
                  <View style={styles.audHeader}>
                    <View style={styles.audLeft}>
                      {isActiva && (
                        <View style={[styles.activePill, { backgroundColor: C.success + "22" }]}>
                          <Text style={[styles.activePillText, { color: C.success, fontFamily: "Inter_600SemiBold" }]}>
                            ACTIVA
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.audNombre, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                        {aud.nombre}
                      </Text>
                    </View>
                    <Text style={[styles.audFecha, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                      {new Date(aud.fecha_creacion).toLocaleDateString("es", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </Text>
                  </View>

                  <View style={styles.audStats}>
                    <View style={styles.audStat}>
                      <Text style={[styles.audStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                        {aud.total_productos}
                      </Text>
                      <Text style={[styles.audStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        productos
                      </Text>
                    </View>
                    <View style={styles.audStat}>
                      <Text style={[styles.audStatVal, { color: C.success, fontFamily: "Inter_700Bold" }]}>
                        {aud.total_contados}
                      </Text>
                      <Text style={[styles.audStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        contados
                      </Text>
                    </View>
                    <View style={styles.audStat}>
                      <Text style={[styles.audStatVal, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
                        {prog}%
                      </Text>
                      <Text style={[styles.audStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        progreso
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.progressBar, { backgroundColor: C.surfaceBorder }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: C.primary, width: `${prog}%` as any },
                      ]}
                    />
                  </View>
                </TouchableOpacity>

                <View style={[styles.audActions, { borderTopColor: C.surfaceBorder }]}>
                  <TouchableOpacity
                    onPress={() => handleImportar(aud.id)}
                    style={styles.audAction}
                  >
                    <Feather name="upload" size={16} color={C.primary} />
                    <Text style={[styles.audActionText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                      Importar Excel
                    </Text>
                  </TouchableOpacity>
                  <View style={[styles.actionDivider, { backgroundColor: C.surfaceBorder }]} />
                  <TouchableOpacity
                    onPress={() => handleEliminar(aud)}
                    style={styles.audAction}
                  >
                    <Feather name="trash-2" size={16} color={C.danger} />
                    <Text style={[styles.audActionText, { color: C.danger, fontFamily: "Inter_500Medium" }]}>
                      Eliminar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {isImporting && (
        <View style={[StyleSheet.absoluteFill, styles.importOverlay]}>
          <View style={[styles.importBox, { backgroundColor: C.surface }]}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.importText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
              {importProgress}
            </Text>
          </View>
        </View>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface, paddingBottom: botPad + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              Nueva auditoría
            </Text>
            <Text style={[styles.modalDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Ingresa un nombre identificador para esta sesión de auditoría.
            </Text>
            <TextInput
              value={nombreNueva}
              onChangeText={setNombreNueva}
              placeholder="Ej: Tienda Centro - Junio 2025"
              placeholderTextColor={C.textMuted}
              style={[
                styles.modalInput,
                {
                  backgroundColor: C.surfaceElevated,
                  borderColor: C.surfaceBorder,
                  color: C.text,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCrear}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={[styles.modalBtnSecondary, { borderColor: C.surfaceBorder }]}
              >
                <Text style={[styles.modalBtnSecondaryText, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCrear}
                disabled={isCreating}
                style={[styles.modalBtnPrimary, { backgroundColor: C.primary }]}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnPrimaryText, { fontFamily: "Inter_700Bold" }]}>
                    Crear
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal resultado importación — reemplaza Alert.alert (no funciona en móvil web) */}
      <Modal
        visible={!!resultModal}
        animationType="fade"
        transparent
        onRequestClose={() => setResultModal(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: "center", alignItems: "center" }]}>
          <View style={[styles.confirmBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.confirmTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {resultModal?.titulo}
            </Text>
            <Text style={[styles.confirmDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {resultModal?.mensaje}
            </Text>
            <View style={styles.confirmButtons}>
              {resultModal?.audId != null && (
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: C.primary }]}
                  onPress={async () => {
                    const id = resultModal.audId!;
                    setResultModal(null);
                    await cargarAuditoria(id);
                    router.push("/(tabs)/conteo");
                  }}
                >
                  <Text style={[styles.confirmBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
                    Ir a Conteo
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: C.surfaceBorder }]}
                onPress={() => setResultModal(null)}
              >
                <Text style={[styles.confirmBtnText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal confirmación eliminar — funciona en web y nativo */}
      <Modal
        visible={!!auditoriaAEliminar}
        animationType="fade"
        transparent
        onRequestClose={() => setAuditoriaAEliminar(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: "center", alignItems: "center" }]}>
          <View style={[styles.confirmBox, { backgroundColor: C.surface }]}>
            <Feather name="trash-2" size={32} color="#EF4444" style={{ marginBottom: 12 }} />
            <Text style={[styles.confirmTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              Eliminar auditoría
            </Text>
            <Text style={[styles.confirmDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              ¿Eliminar{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: C.text }}>
                "{auditoriaAEliminar?.nombre}"
              </Text>
              {" "}y todos sus datos? Esta acción no se puede deshacer.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: C.surfaceBorder }]}
                onPress={() => setAuditoriaAEliminar(null)}
              >
                <Text style={[styles.confirmBtnText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: "#EF4444" }]}
                onPress={confirmarEliminar}
              >
                <Text style={[styles.confirmBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
                  Eliminar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  appTitle: { fontSize: 26, letterSpacing: -0.5 },
  appSubtitle: { fontSize: 13, marginTop: 2 },
  newBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeCard: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  activeLabel: { fontSize: 11 },
  activeName: { fontSize: 15, marginTop: 1 },
  activeRight: { alignItems: "flex-end" },
  progressPct: { fontSize: 22, lineHeight: 26 },
  progressDetail: { fontSize: 12 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8 },
  sectionCount: { fontSize: 12 },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, marginTop: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", maxWidth: 260 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontSize: 15 },
  audCard: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
  },
  audCardBody: { padding: 16, gap: 12 },
  audHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  audLeft: { flex: 1, gap: 4 },
  activePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activePillText: { fontSize: 10, letterSpacing: 0.5 },
  audNombre: { fontSize: 16 },
  audFecha: { fontSize: 12 },
  audStats: { flexDirection: "row", gap: 20 },
  audStat: { alignItems: "center", gap: 2 },
  audStatVal: { fontSize: 22 },
  audStatLabel: { fontSize: 11 },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  audActions: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  audAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  audActionText: { fontSize: 13 },
  actionDivider: { width: 1 },
  importOverlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  importBox: {
    padding: 28,
    borderRadius: 16,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
  },
  importText: { fontSize: 15, textAlign: "center" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 20 },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnSecondaryText: { fontSize: 15 },
  modalBtnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnPrimaryText: { color: "#fff", fontSize: 15 },
  confirmBox: {
    width: "85%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  confirmTitle: { fontSize: 18, marginBottom: 4 },
  confirmDesc: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    width: "100%",
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 15 },
});
