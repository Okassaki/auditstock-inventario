import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { useStoreConfig } from "@/context/StoreConfigContext";
import { verificarTienda } from "@/utils/api";

const C = Colors.dark;
const BOSS_COLOR = "#8B5CF6";

export default function SetupScreen() {
  const { guardarConfig } = useStoreConfig();
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConectar() {
    const cod = codigo.trim().toUpperCase();
    if (!cod) {
      setError("Ingresa el código de tienda");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const tienda = await verificarTienda(cod);
      await guardarConfig({ codigo: tienda.codigo, nombre: tienda.nombre });
    } catch (e: any) {
      if (e?.message?.includes("404") || e?.message?.includes("no encontrada")) {
        setError("Código de tienda no encontrado. Verifica con el administrador.");
      } else {
        setError("No se pudo conectar al servidor. Revisa tu conexión.");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Feather name="package" size={48} color={C.primary} />
        </View>
        <Text style={styles.titulo}>AuditStock</Text>
        <Text style={styles.subtitulo}>
          Ingresa el código de tienda que te asignó el administrador
        </Text>

        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Ej: T001"
            placeholderTextColor={C.textMuted}
            value={codigo}
            onChangeText={(t) => { setCodigo(t.toUpperCase()); setError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleConectar}
            editable={!cargando}
          />
        </View>

        {error && (
          <View style={styles.errorWrap}>
            <Feather name="alert-circle" size={14} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, cargando && styles.btnDisabled]}
          onPress={handleConectar}
          disabled={cargando}
          activeOpacity={0.8}
        >
          {cargando ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="link" size={16} color="#fff" />
              <Text style={styles.btnText}>Conectar tienda</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.ayuda}>
          Si no tienes un código, contacta al administrador del sistema.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.bossBtn}
        onPress={() => router.push("/boss-login")}
        activeOpacity={0.7}
      >
        <Feather name="shield" size={14} color={BOSS_COLOR} />
        <Text style={styles.bossBtnText}>Modo Jefe</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  titulo: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: C.text,
    marginBottom: 8,
  },
  subtitulo: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  inputWrap: {
    width: "100%",
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: C.text,
    textAlign: "center",
    letterSpacing: 4,
  },
  inputError: {
    borderColor: C.danger,
  },
  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: C.danger,
    flexShrink: 1,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    marginTop: 8,
    marginBottom: 24,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  ayuda: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  bossBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: C.surfaceBorder,
  },
  bossBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#8B5CF6",
  },
});
