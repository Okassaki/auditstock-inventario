import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  title?: string;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = "Escanear código",
}: BarcodeScannerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
    setTimeout(() => setScanned(false), 1500);
  };

  const handleClose = () => {
    setScanned(false);
    onClose();
  };

  if (Platform.OS === "web") return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {!permission?.granted ? (
          <View style={[styles.permContainer, { paddingTop: insets.top + 20 }]}>
            <Feather name="camera-off" size={48} color="#fff" />
            <Text style={styles.permTitle}>Acceso a cámara requerido</Text>
            <Text style={styles.permDesc}>
              Necesitamos acceso a la cámara para escanear códigos de barras.
            </Text>
            <TouchableOpacity
              style={[styles.permBtn, { backgroundColor: C.primary }]}
              onPress={requestPermission}
            >
              <Text style={styles.permBtnText}>Permitir acceso</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
            <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.topTitle}>{title}</Text>
              <View style={styles.placeholder} />
            </View>
            <View style={styles.scanArea}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.scanHint}>
                {scanned ? "Código detectado!" : "Apunta al código de barras"}
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const FRAME = 250;
const CORNER = 20;
const BORDER = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  placeholder: {
    width: 40,
  },
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
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: BORDER,
    borderLeftWidth: BORDER,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: BORDER,
    borderRightWidth: BORDER,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: BORDER,
    borderLeftWidth: BORDER,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: BORDER,
    borderRightWidth: BORDER,
    borderBottomRightRadius: 4,
  },
  scanHint: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
