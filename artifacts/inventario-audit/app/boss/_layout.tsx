import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBossConfig } from "@/context/BossConfigContext";

const BOSS_COLOR = "#8B5CF6";
const BG = "#0D0A1E";
const SURFACE = "#1A1530";
const SURFACE_BORDER = "#2D2550";
const TEXT = "#F0F4FF";
const TEXT_MUTED = "#6B5FA8";

export default function BossLayout() {
  const { logout } = useBossConfig();
  const insets = useSafeAreaInsets();

  function handleLogout() {
    Alert.alert("Salir del Modo Jefe", "¿Confirmas que querés salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: () => {
          logout();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topLeft}>
          <View style={styles.badgeWrap}>
            <Feather name="shield" size={14} color={BOSS_COLOR} />
            <Text style={styles.badgeText}>MODO JEFE</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={16} color={TEXT_MUTED} />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: SURFACE,
            borderTopColor: SURFACE_BORDER,
            borderTopWidth: 1,
            paddingBottom: insets.bottom,
            height: 56 + insets.bottom,
          },
          tabBarActiveTintColor: BOSS_COLOR,
          tabBarInactiveTintColor: TEXT_MUTED,
          tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tiendas"
          options={{
            title: "Tiendas",
            tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tienda"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen
          name="productos"
          options={{ href: null, headerShown: false }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#0D0A1E",
    borderBottomWidth: 1,
    borderBottomColor: "#2D2550",
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  badgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${BOSS_COLOR}20`,
    borderWidth: 1,
    borderColor: `${BOSS_COLOR}40`,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: BOSS_COLOR, letterSpacing: 1 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  logoutText: { fontSize: 14, fontFamily: "Inter_500Medium", color: TEXT_MUTED },
});
