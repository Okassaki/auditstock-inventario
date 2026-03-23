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
    verificarCodigosExistentes,
  } = useDatabase();

  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [auditoriaAEliminar, setAuditoriaAEliminar] = useState<Auditoria | null>(null);

  const [duplicadosInfo, setDuplicadosInfo] = useState<{
    visible: boolean;
    enArchivo: { codigo: string; nombre: string }[];
    yaEnBD: { codigo: string; nombre: string }[];
    productosUnicos: { codigo: string; nombre: string; stock_sistema: number; imeis_sistema: string | null }[];
    productosOriginales: { codigo: string; nombre: string; stock_sistema: number; imeis_sistema: string | null }[];
    auditoriaId: number;
    erroresArchivo: string[];
  } | null>(null);

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

  const handleImportar = async (audId: number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setIsImporting(true);
      setImportProgress("Leyendo archivo Excel...");

      const { productos, errores } = await parsearExcel(result.assets[0].uri);

      if (productos.length === 0) {
        Alert.alert(
          "Sin datos",
          errores.length > 0
            ? `No se pudieron leer productos.\n\nErrores:\n${errores.slice(0, 5).join("\n")}`
            : "El archivo no contiene productos válidos."
        );
        setIsImporting(false);
        return;
      }

      setImportProgress("Verificando duplicados...");

      // 1. Detectar duplicados dentro del archivo (mismo código más de una vez)
      const seenCodes = new Map<string, string>(); // codigo -> nombre
      const enArchivo: { codigo: string; nombre: string }[] = [];
      const productosUnicos: typeof productos = [];

      for (const p of productos) {
        if (seenCodes.has(p.codigo)) {
          if (!enArchivo.find((d) => d.codigo === p.codigo)) {
            enArchivo.push({ codigo: p.codigo, nombre: p.nombre });
          }
        } else {
          seenCodes.set(p.codigo, p.nombre);
          productosUnicos.push(p);
        }
      }

      // 2. Detectar códigos del archivo que ya existen en la auditoría (base de datos)
      const codigosUnicos = productosUnicos.map((p) => p.codigo);
      const codigosEnBD = await verificarCodigosExistentes(codigosUnicos, audId);
      const yaEnBD = codigosEnBD.map((codigo) => ({
        codigo,
        nombre: seenCodes.get(codigo) ?? codigo,
      }));

      setIsImporting(false);

      // 3. Si hay algún tipo de duplicado, mostrar modal de confirmación
      if (enArchivo.length > 0 || yaEnBD.length > 0) {
        setDuplicadosInfo({
          visible: true,
          enArchivo,
          yaEnBD,
          productosUnicos: productosUnicos.map((p) => ({
            codigo: p.codigo,
            nombre: p.nombre,
            stock_sistema: p.stock_sistema,
            imeis_sistema: p.imeis_sistema ?? null,
          })),
          productosOriginales: productos.map((p) => ({
            codigo: p.codigo,
            nombre: p.nombre,
            stock_sistema: p.stock_sistema,
            imeis_sistema: p.imeis_sistema ?? null,
          })),
          auditoriaId: audId,
          erroresArchivo: errores,
        });
        return;
      }

      // 4. Sin duplicados: importar directamente
      await ejecutarImport(productosUnicos.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        stock_sistema: p.stock_sistema,
        imeis_sistema: p.imeis_sistema ?? null,
      })), audId, errores);
    } catch (e) {
      setIsImporting(false);
      Alert.alert("Error", String(e));
    }
  };

  const ejecutarImport = async (
    productosAImportar: { codigo: string; nombre: string; stock_sistema: number; imeis_sistema: string | null }[],
    audId: number,
    erroresArchivo: string[] = []
  ) => {
    setIsImporting(true);
    setImportProgress(`Importando ${productosAImportar.length} productos...`);
    try {
      const { insertados, duplicados, errores: errImp } = await importarProductos(
        productosAImportar,
        audId
      );

      setIsImporting(false);

      let mensaje = `${insertados} productos importados correctamente.`;
      if (duplicados > 0) mensaje += `\n${duplicados} ya existían y fueron omitidos.`;
      if (errImp.length > 0) mensaje += `\n\nAdvertencias:\n${errImp.slice(0, 3).join("\n")}`;
      if (erroresArchivo.length > 0) mensaje += `\n\nAvisos del archivo:\n${erroresArchivo.slice(0, 3).join("\n")}`;

      Alert.alert("Importación completada", mensaje, [
        {
          text: "Ir a Conteo",
          onPress: async () => {
            await cargarAuditoria(audId);
            router.push("/(tabs)/conteo");
          },
        },
        { text: "OK" },
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await cargar();
    } catch (e) {
      setIsImporting(false);
      Alert.alert("Error", String(e));
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

      {/* Modal de duplicados */}
      <Modal
        visible={!!duplicadosInfo?.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setDuplicadosInfo(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
          <View style={[styles.dupModal, { backgroundColor: C.surface }]}>
            <View style={styles.dupHeader}>
              <View style={[styles.dupIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="alert-triangle" size={24} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dupTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                  ¿Omitir duplicados?
                </Text>
                <Text style={[styles.dupSub, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Se encontraron códigos repetidos
                </Text>
              </View>
            </View>

            <ScrollView style={styles.dupScroll} showsVerticalScrollIndicator={false}>
              {duplicadosInfo && duplicadosInfo.enArchivo.length > 0 && (
                <View style={styles.dupSection}>
                  <View style={[styles.dupSectionHeader, { backgroundColor: "#f59e0b18" }]}>
                    <Feather name="copy" size={14} color="#f59e0b" />
                    <Text style={[styles.dupSectionTitle, { color: "#f59e0b", fontFamily: "Inter_600SemiBold" }]}>
                      Repetidos en el archivo ({duplicadosInfo.enArchivo.length})
                    </Text>
                  </View>
                  <Text style={[styles.dupSectionDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                    Aparecen más de una vez en el Excel. Solo se importa la primera fila de cada código.
                  </Text>
                  {duplicadosInfo.enArchivo.map((d) => (
                    <View key={d.codigo} style={[styles.dupItem, { borderLeftColor: "#f59e0b" }]}>
                      <Text style={[styles.dupCodigo, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                        {d.codigo}
                      </Text>
                      <Text style={[styles.dupNombre, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
                        {d.nombre}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {duplicadosInfo && duplicadosInfo.yaEnBD.length > 0 && (
                <View style={styles.dupSection}>
                  <View style={[styles.dupSectionHeader, { backgroundColor: "#3b82f618" }]}>
                    <Feather name="database" size={14} color="#3b82f6" />
                    <Text style={[styles.dupSectionTitle, { color: "#3b82f6", fontFamily: "Inter_600SemiBold" }]}>
                      Ya importados antes ({duplicadosInfo.yaEnBD.length})
                    </Text>
                  </View>
                  <Text style={[styles.dupSectionDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                    Ya existen en esta auditoría. Se omitirán para no sobreescribir datos.
                  </Text>
                  {duplicadosInfo.yaEnBD.map((d) => (
                    <View key={d.codigo} style={[styles.dupItem, { borderLeftColor: "#3b82f6" }]}>
                      <Text style={[styles.dupCodigo, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                        {d.codigo}
                      </Text>
                      <Text style={[styles.dupNombre, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
                        {d.nombre}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.dupButtons}>
              <TouchableOpacity
                style={[styles.dupBtn, { backgroundColor: C.surfaceBorder, flex: 1 }]}
                onPress={async () => {
                  if (!duplicadosInfo) return;
                  const info = duplicadosInfo;
                  setDuplicadosInfo(null);
                  await ejecutarImport(info.productosOriginales, info.auditoriaId, info.erroresArchivo);
                }}
              >
                <Text style={[styles.dupBtnText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
                  No
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dupBtn, { backgroundColor: C.primary, flex: 1 }]}
                onPress={async () => {
                  if (!duplicadosInfo) return;
                  const info = duplicadosInfo;
                  setDuplicadosInfo(null);
                  const codigosEnBD = new Set(info.yaEnBD.map((d) => d.codigo));
                  const soloUnicos = info.productosUnicos.filter((p) => !codigosEnBD.has(p.codigo));
                  await ejecutarImport(soloUnicos, info.auditoriaId, info.erroresArchivo);
                }}
              >
                <Text style={[styles.dupBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
                  Sí
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
  dupModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  dupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  dupIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dupTitle: { fontSize: 18 },
  dupSub: { fontSize: 13, marginTop: 2 },
  dupScroll: { maxHeight: 320 },
  dupSection: { marginBottom: 16 },
  dupSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  dupSectionTitle: { fontSize: 13 },
  dupSectionDesc: { fontSize: 12, lineHeight: 16, marginBottom: 8, paddingHorizontal: 2 },
  dupItem: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  dupCodigo: { fontSize: 13 },
  dupNombre: { fontSize: 12 },
  dupButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  dupBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
  },
  dupBtnText: { fontSize: 15 },
});
