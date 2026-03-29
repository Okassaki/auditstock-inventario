import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  title?: string;
}

/** Fallback para web: input manual de código */
function WebBarcodeInput({
  visible,
  onClose,
  onScan,
  title,
}: BarcodeScannerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const [value, setValue] = useState("");

  const handleConfirm = () => {
    const clean = value.trim();
    if (!clean) return;
    onScan(clean);
    setValue("");
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.webOverlay}>
        <View style={[styles.webBox, { backgroundColor: C.surface }]}>
          <View style={styles.webHeader}>
            <Feather name="maximize" size={22} color={C.primary} />
            <Text style={[styles.webTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {title ?? "Ingresar código"}
            </Text>
          </View>
          <Text style={[styles.webHint, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Escribe el código de barras o IMEI manualmente
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Ej: 7501234567890"
            placeholderTextColor={C.textMuted}
            autoFocus
            style={[
              styles.webInput,
              {
                backgroundColor: C.surfaceElevated,
                borderColor: C.primary,
                color: C.text,
                fontFamily: "Inter_400Regular",
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <View style={styles.webBtns}>
            <TouchableOpacity
              style={[styles.webBtn, { borderColor: C.surfaceBorder, borderWidth: 1 }]}
              onPress={() => { setValue(""); onClose(); }}
            >
              <Text style={[styles.webBtnText, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.webBtn, { backgroundColor: C.primary }]}
              onPress={handleConfirm}
            >
              <Text style={[styles.webBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
                Confirmar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Escáner nativo con CameraView */
function NativeScannerModal({
  visible,
  onClose,
  onScan,
  title,
}: BarcodeScannerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Cargar sonido de beep al montar
  useEffect(() => {
    let sound: Audio.Sound | null = null;
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    Audio.Sound.createAsync(require("../assets/sounds/beep.wav"))
      .then(({ sound: s }) => {
        sound = s;
        soundRef.current = s;
      })
      .catch(() => {});
    return () => {
      sound?.unloadAsync().catch(() => {});
    };
  }, []);

  // Pedir permiso automáticamente cuando el modal se abre
  useEffect(() => {
    if (visible && permission !== null && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission]);

  // Resetear estado al cerrar
  useEffect(() => {
    if (!visible) {
      setScanned(false);
    }
  }, [visible]);

  const playBeep = async () => {
    try {
      const sound = soundRef.current;
      if (!sound) return;
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch {
      // silencioso si falla
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    playBeep();
    onScan(data);
    setTimeout(() => setScanned(false), 1500);
  };

  const handleClose = () => {
    setScanned(false);
    onClose();
  };

  const renderContent = () => {
    // Cargando estado de permisos
    if (permission === null) {
      return (
        <View style={[styles.permContainer, { paddingTop: insets.top + 20 }]}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.permDesc}>Verificando permisos de cámara...</Text>
        </View>
      );
    }

    // Permiso denegado permanentemente
    if (!permission.granted && !permission.canAskAgain) {
      return (
        <View style={[styles.permContainer, { paddingTop: insets.top + 20 }]}>
          <Feather name="camera-off" size={48} color="#fff" />
          <Text style={styles.permTitle}>Permiso denegado</Text>
          <Text style={styles.permDesc}>
            El permiso de cámara fue denegado. Ve a Configuración → Aplicaciones → AuditStock → Permisos y activa la Cámara.
          </Text>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]}
            onPress={handleClose}
          >
            <Text style={styles.permBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Permiso no concedido (se puede solicitar)
    if (!permission.granted) {
      return (
        <View style={[styles.permContainer, { paddingTop: insets.top + 20 }]}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.permTitle}>Solicitando permiso...</Text>
          <Text style={styles.permDesc}>
            Acepta el permiso de cámara en el diálogo del sistema para escanear códigos.
          </Text>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: C.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permBtnText}>Permitir cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: 0 }]}
            onPress={handleClose}
          >
            <Text style={styles.permBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Permiso concedido: mostrar cámara
    return (
      <>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              "qr",
              "ean13",
              "ean8",
              "code128",
              "code39",
              "code93",
              "upc_e",
              "upc_a",
              "itf14",
              "datamatrix",
              "pdf417",
              "aztec",
            ],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Barra superior */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>{title}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Marco de escaneo */}
        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>
            {scanned ? "¡Código detectado!" : "Apunta al código de barras"}
          </Text>
        </View>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {renderContent()}
      </View>
    </Modal>
  );
}

export function BarcodeScannerModal(props: BarcodeScannerModalProps) {
  if (Platform.OS === "web") {
    return <WebBarcodeInput {...props} />;
  }
  return <NativeScannerModal {...props} />;
}

const FRAME = 250;
const CORNER = 20;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  permContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  permDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  permBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  permBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  placeholder: { width: 40 },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  scanFrame: {
    width: FRAME,
    height: FRAME,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: "#00D4FF",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },
  scanHint: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  // Web fallback styles
  webOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  webBox: {
    width: "85%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webTitle: {
    fontSize: 17,
  },
  webHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  webInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 4,
  },
  webBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  webBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  webBtnText: { fontSize: 15 },
});
