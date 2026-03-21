import React from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors } from "@/constants/colors";

type BadgeVariant = "correcto" | "sobrante" | "faltante" | "sin_contar" | "warning" | "info";

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  size?: "sm" | "md";
}

export function Badge({ variant, label, size = "md" }: BadgeProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;

  const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
    correcto: { bg: `${C.success}22`, text: C.success },
    sobrante: { bg: `${C.warning}22`, text: C.warning },
    faltante: { bg: `${C.danger}22`, text: C.danger },
    sin_contar: { bg: `${C.textMuted}22`, text: C.textSecondary },
    warning: { bg: `${C.warning}22`, text: C.warning },
    info: { bg: `${C.primary}22`, text: C.primary },
  };

  const { bg, text } = variantColors[variant];
  const isSmall = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: bg }, isSmall && styles.badgeSm]}>
      <Text style={[styles.text, { color: text }, isSmall && styles.textSm]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  textSm: {
    fontSize: 11,
  },
});
