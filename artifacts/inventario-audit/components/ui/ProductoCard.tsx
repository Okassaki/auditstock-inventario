import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from "react-native";
import { Colors } from "@/constants/colors";
import {
  type ProductoInventario,
  getEstadoProducto,
  getDiferencia,
} from "@/context/DatabaseContext";
import { Badge } from "./Badge";

interface ProductoCardProps {
  producto: ProductoInventario;
  onPress: () => void;
}

export function ProductoCard({ producto, onPress }: ProductoCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;

  const estado = getEstadoProducto(producto);
  const diff = getDiferencia(producto);

  const estadoLabel =
    estado === "correcto"
      ? "Correcto"
      : estado === "sobrante"
      ? "Sobrante"
      : estado === "faltante"
      ? "Faltante"
      : "Sin contar";

  const borderColor =
    estado === "correcto"
      ? C.success
      : estado === "sobrante"
      ? C.warning
      : estado === "faltante"
      ? C.danger
      : C.surfaceBorder;

  const hasImeis = !!producto.imeis_sistema;
  const hasInconsistencias = !!producto.inconsistencias;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        {
          backgroundColor: C.surface,
          borderColor,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.codigo, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
            {producto.codigo}
          </Text>
          {hasImeis && (
            <View style={[styles.imeiPill, { backgroundColor: `${C.primary}18` }]}>
              <Feather name="cpu" size={10} color={C.primary} />
              <Text style={[styles.imeiText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                IMEI
              </Text>
            </View>
          )}
        </View>
        <Badge variant={estado} label={estadoLabel} size="sm" />
      </View>

      <Text
        style={[styles.nombre, { color: C.text, fontFamily: "Inter_500Medium" }]}
        numberOfLines={2}
      >
        {producto.nombre}
      </Text>

      <View style={styles.stockRow}>
        <View style={styles.stockItem}>
          <Text style={[styles.stockLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Sistema
          </Text>
          <Text style={[styles.stockValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>
            {producto.stock_sistema}
          </Text>
        </View>
        <Feather name="arrow-right" size={16} color={C.textMuted} />
        <View style={styles.stockItem}>
          <Text style={[styles.stockLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Físico
          </Text>
          <Text
            style={[
              styles.stockValue,
              {
                color:
                  producto.stock_fisico === null
                    ? C.textMuted
                    : Math.abs(diff) > 0
                    ? estado === "sobrante"
                      ? C.warning
                      : C.danger
                    : C.success,
                fontFamily: "Inter_700Bold",
              },
            ]}
          >
            {producto.stock_fisico ?? "—"}
          </Text>
        </View>
        {producto.stock_fisico !== null && (
          <>
            <Feather name="arrow-right" size={16} color={C.textMuted} />
            <View style={styles.stockItem}>
              <Text style={[styles.stockLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                Dif.
              </Text>
              <Text
                style={[
                  styles.stockValue,
                  {
                    color: diff === 0 ? C.success : diff > 0 ? C.warning : C.danger,
                    fontFamily: "Inter_700Bold",
                  },
                ]}
              >
                {diff > 0 ? `+${diff}` : diff}
              </Text>
            </View>
          </>
        )}
      </View>

      {hasInconsistencias && (
        <View style={[styles.alertRow, { backgroundColor: `${C.danger}15` }]}>
          <Feather name="alert-triangle" size={12} color={C.danger} />
          <Text style={[styles.alertText, { color: C.danger, fontFamily: "Inter_400Regular" }]}>
            {producto.inconsistencias}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Feather name="edit-2" size={14} color={C.textMuted} />
        <Text style={[styles.footerText, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
          Toca para registrar conteo
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  codigo: {
    fontSize: 14,
  },
  imeiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  imeiText: {
    fontSize: 10,
  },
  nombre: {
    fontSize: 15,
    lineHeight: 20,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stockItem: {
    alignItems: "center",
    gap: 2,
  },
  stockLabel: {
    fontSize: 11,
  },
  stockValue: {
    fontSize: 20,
    lineHeight: 24,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alertText: {
    fontSize: 12,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
  },
});
