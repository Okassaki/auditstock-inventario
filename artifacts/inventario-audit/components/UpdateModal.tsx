import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const BG       = "#0A0F1E";
const SURFACE  = "#111827";
const GREEN    = "#10B981";
const TEXT     = "#F1F5F9";
const TEXT_SEC = "#94A3B8";
const BORDER   = "#1E293B";
const RED      = "#EF4444";

const LegacyFS = FileSystem as unknown as {
  cacheDirectory: string | null;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
  createDownloadResumable: (
    url: string,
    dest: string,
    options: object,
    callback: (prog: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void
  ) => { downloadAsync: () => Promise<{ uri: string } | undefined> };
  getContentUriAsync: (fileUri: string) => Promise<string>;
};

export type UpdateInfo = {
  versionCode: number;
  currentCode: number;
  name: string;
  downloadUrl: string;
};

interface Props {
  info: UpdateInfo | null;
  onDismiss: () => void;
}

type Phase = "idle" | "downloading" | "ready" | "error";

export function UpdateModal({ info, onDismiss }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase]       = useState<Phase>("idle");
  const [errMsg, setErrMsg]     = useState("");

  function reset() {
    setPhase("idle");
    setProgress(0);
    setErrMsg("");
  }

  async function startDownload() {
    if (!info || !LegacyFS.cacheDirectory) return;
    setPhase("downloading");
    setProgress(0);

    const dest = LegacyFS.cacheDirectory + "auditstock-update.apk";
    try {
      await LegacyFS.deleteAsync(dest, { idempotent: true });

      const dl = LegacyFS.createDownloadResumable(
        info.downloadUrl,
        dest,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite);
          }
        }
      );

      const result = await dl.downloadAsync();
      if (!result?.uri) throw new Error("Sin URI");

      setProgress(1);
      setPhase("ready");
    } catch {
      setErrMsg("Error al descargar. Revisá tu conexión e intentá de nuevo.");
      setPhase("error");
    }
  }

  async function install() {
    if (!LegacyFS.cacheDirectory) return;
    const dest = LegacyFS.cacheDirectory + "auditstock-update.apk";
    try {
      const contentUri = await LegacyFS.getContentUriAsync(dest);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/vnd.android.package-archive",
      });
    } catch {
      setErrMsg("No se pudo abrir el instalador de Android.");
      setPhase("error");
    }
  }

  if (!info || Platform.OS !== "android") return null;

  const pct = Math.round(progress * 100);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={phase === "idle" ? onDismiss : undefined}>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Header */}
          <View style={s.header}>
            <View style={s.iconBadge}>
              <Feather name="download-cloud" size={22} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Actualización disponible</Text>
              <Text style={s.subtitle}>{info.name}</Text>
            </View>
            {phase === "idle" && (
              <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={20} color={TEXT_SEC} />
              </TouchableOpacity>
            )}
          </View>

          <View style={s.divider} />

          {/* Versiones */}
          <View style={s.versionBox}>
            <View style={s.versionRow}>
              <Text style={s.vLabel}>Versión actual</Text>
              <Text style={s.vVal}>v{info.currentCode}</Text>
            </View>
            <Feather name="arrow-right" size={14} color={TEXT_SEC} />
            <View style={s.versionRow}>
              <Text style={s.vLabel}>Nueva versión</Text>
              <Text style={[s.vVal, { color: GREEN }]}>v{info.versionCode}</Text>
            </View>
          </View>

          <View style={s.divider} />

          {/* Progreso */}
          {(phase === "downloading" || phase === "ready") && (
            <View style={s.progressBox}>
              <View style={s.progressRow}>
                {phase === "downloading"
                  ? <ActivityIndicator size={13} color={GREEN} />
                  : <Feather name="check-circle" size={13} color={GREEN} />}
                <Text style={[s.progressTxt, phase === "ready" && { color: GREEN }]}>
                  {phase === "ready" ? "Descarga completa" : `Descargando… ${pct}%`}
                </Text>
                <Text style={[s.progressTxt, { marginLeft: "auto" }]}>{pct}%</Text>
              </View>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${pct}%` as any }]} />
              </View>
            </View>
          )}

          {phase === "error" && (
            <View style={[s.progressBox, { borderColor: RED + "40", backgroundColor: RED + "08" }]}>
              <Feather name="alert-triangle" size={14} color={RED} style={{ marginTop: 1 }} />
              <Text style={[s.progressTxt, { color: RED, flex: 1 }]}>{errMsg}</Text>
            </View>
          )}

          {/* Botones */}
          <View style={s.buttons}>
            {phase === "idle" && (
              <>
                <TouchableOpacity style={s.btnSec} onPress={onDismiss}>
                  <Text style={s.btnSecTxt}>Después</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnPri} onPress={startDownload}>
                  <Feather name="download" size={15} color="#fff" />
                  <Text style={s.btnPriTxt}>Descargar e instalar</Text>
                </TouchableOpacity>
              </>
            )}

            {phase === "downloading" && (
              <TouchableOpacity style={[s.btnSec, { flex: 1 }]} onPress={onDismiss}>
                <Text style={s.btnSecTxt}>Continuar en segundo plano</Text>
              </TouchableOpacity>
            )}

            {phase === "ready" && (
              <TouchableOpacity style={[s.btnPri, { flex: 1 }]} onPress={install}>
                <Feather name="package" size={15} color="#fff" />
                <Text style={s.btnPriTxt}>Instalar ahora</Text>
              </TouchableOpacity>
            )}

            {phase === "error" && (
              <>
                <TouchableOpacity style={s.btnSec} onPress={reset}>
                  <Text style={s.btnSecTxt}>Reintentar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSec} onPress={onDismiss}>
                  <Text style={s.btnSecTxt}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  card:        { backgroundColor: SURFACE, borderRadius: 18, width: "100%", borderWidth: 1, borderColor: BORDER },
  header:      { flexDirection: "row", alignItems: "center", gap: 12, padding: 20 },
  iconBadge:   { width: 46, height: 46, borderRadius: 13, backgroundColor: GREEN + "20", alignItems: "center", justifyContent: "center" },
  title:       { fontSize: 16, fontWeight: "700", color: TEXT },
  subtitle:    { fontSize: 12, color: TEXT_SEC, marginTop: 2 },
  divider:     { height: 1, backgroundColor: BORDER },
  versionBox:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 },
  versionRow:  { alignItems: "center", gap: 2 },
  vLabel:      { fontSize: 11, color: TEXT_SEC },
  vVal:        { fontSize: 16, fontWeight: "700", color: TEXT },
  progressBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, margin: 14, padding: 12, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, flexWrap: "wrap" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", marginBottom: 8 },
  progressTxt: { fontSize: 12, color: TEXT_SEC },
  barBg:       { width: "100%", height: 5, backgroundColor: BORDER, borderRadius: 3 },
  barFill:     { height: 5, backgroundColor: GREEN, borderRadius: 3 },
  buttons:     { flexDirection: "row", gap: 10, padding: 16, paddingTop: 14 },
  btnPri:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 13 },
  btnPriTxt:   { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnSec:      { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  btnSecTxt:   { fontSize: 13, color: TEXT_SEC },
});
