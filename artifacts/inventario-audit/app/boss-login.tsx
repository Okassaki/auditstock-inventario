import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBossConfig } from "@/context/BossConfigContext";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_MUTED = "#6B5FA8";
const DANGER = "#FF4757";

const PIN_LENGTH = 4;

export default function BossLoginScreen() {
  const { bossPin, setupPin, authenticate } = useBossConfig();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isSetup = !bossPin;

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">(isSetup ? "enter" : "enter");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const label = isSetup
    ? step === "enter"
      ? "Crear PIN de jefe"
      : "Confirmar PIN"
    : "Ingresa tu PIN de jefe";

  const desc = isSetup
    ? step === "enter"
      ? "Elegí un PIN de 4 dígitos para el Modo Jefe"
      : "Ingresá el mismo PIN para confirmar"
    : "Solo vos podés acceder al Modo Jefe";

  function handleDigit(d: string) {
    setError(null);
    if (step === "enter") {
      const next = (pin + d).slice(0, PIN_LENGTH);
      setPin(next);
      if (next.length === PIN_LENGTH) handleComplete(next, "enter");
    } else {
      const next = (confirmPin + d).slice(0, PIN_LENGTH);
      setConfirmPin(next);
      if (next.length === PIN_LENGTH) handleComplete(next, "confirm");
    }
  }

  function handleDelete() {
    if (step === "enter") setPin((p) => p.slice(0, -1));
    else setConfirmPin((p) => p.slice(0, -1));
    setError(null);
  }

  async function handleComplete(value: string, which: "enter" | "confirm") {
    if (isSetup) {
      if (which === "enter") {
        await new Promise((r) => setTimeout(r, 100));
        setStep("confirm");
      } else {
        if (value === pin) {
          await setupPin(pin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/boss");
        } else {
          triggerError("Los PINs no coinciden. Intentá de nuevo.");
          setPin("");
          setConfirmPin("");
          setStep("enter");
        }
      }
    } else {
      const ok = authenticate(value);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/boss");
      } else {
        triggerError("PIN incorrecto");
        setPin("");
      }
    }
  }

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setTimeout(() => setShake(false), 400);
  }

  const currentPin = step === "enter" ? pin : confirmPin;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Feather name="arrow-left" size={22} color={TEXT_MUTED} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Feather name="shield" size={40} color={BOSS_COLOR} />
        </View>

        <Text style={styles.titulo}>{label}</Text>
        <Text style={styles.desc}>{desc}</Text>

        <View style={[styles.dotsRow, shake && styles.dotsShake]}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < currentPin.length && styles.dotFilled,
                error && styles.dotError,
              ]}
            />
          ))}
        </View>

        {error && (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={13} color={DANGER} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.numpad}>
          {[["1","2","3"],["4","5","6"],["7","8","9"],["","0","⌫"]].map((row, ri) => (
            <View key={ri} style={styles.numpadRow}>
              {row.map((d, di) => (
                <TouchableOpacity
                  key={di}
                  style={[styles.numBtn, d === "" && styles.numBtnEmpty]}
                  onPress={() => {
                    if (d === "⌫") handleDelete();
                    else if (d !== "") handleDigit(d);
                  }}
                  activeOpacity={d === "" ? 1 : 0.7}
                  disabled={d === ""}
                >
                  {d === "⌫" ? (
                    <Feather name="delete" size={22} color={TEXT_MUTED} />
                  ) : (
                    <Text style={[styles.numText, d === "" && { opacity: 0 }]}>{d}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  backBtn: { position: "absolute", top: 56, left: 20, zIndex: 10, padding: 8 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: `${BOSS_COLOR}20`,
    borderWidth: 1,
    borderColor: `${BOSS_COLOR}40`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  titulo: { fontSize: 22, fontFamily: "Inter_700Bold", color: TEXT, marginBottom: 8, textAlign: "center" },
  desc: { fontSize: 14, fontFamily: "Inter_400Regular", color: TEXT_MUTED, textAlign: "center", marginBottom: 40, lineHeight: 20 },
  dotsRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  dotsShake: { transform: [{ translateX: 6 }] },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: SURFACE_BORDER,
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: BOSS_COLOR, borderColor: BOSS_COLOR },
  dotError: { borderColor: DANGER },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DANGER },
  numpad: { gap: 12, marginTop: 16 },
  numpadRow: { flexDirection: "row", gap: 12 },
  numBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  numBtnEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  numText: { fontSize: 26, fontFamily: "Inter_500Medium", color: TEXT },
});
