import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onScanPress?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Buscar por código, nombre o IMEI...",
  onScanPress,
}: SearchBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: C.surfaceElevated, borderColor: C.surfaceBorder }]}>
      <Feather name="search" size={18} color={C.textMuted} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        style={[styles.input, { color: C.text, fontFamily: "Inter_400Regular" }]}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")} style={styles.clearBtn}>
          <Feather name="x-circle" size={16} color={C.textMuted} />
        </TouchableOpacity>
      )}
      {onScanPress && (
        <TouchableOpacity
          onPress={onScanPress}
          style={[styles.scanBtn, { backgroundColor: C.primary }]}
        >
          <Feather name="camera" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  icon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  clearBtn: {
    padding: 2,
  },
  scanBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
