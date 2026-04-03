import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, useRouter } from "expo-router";
import {
  Icon,
  Label,
  NativeTabs,
} from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { MaterialCommunityIcons, Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useStoreConfig } from "@/context/StoreConfigContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Inicio</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="conteo">
        <Icon sf={{ default: "barcode.viewfinder", selected: "barcode.viewfinder" }} />
        <Label>Conteo</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="resumen">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Resumen</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alertas">
        <Icon sf={{ default: "exclamationmark.triangle", selected: "exclamationmark.triangle.fill" }} />
        <Label>Alertas</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function StoreBanner() {
  const { storeConfig } = useStoreConfig();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = Colors.dark;
  if (!storeConfig) return null;
  return (
    <View style={[bannerStyles.container, { paddingTop: insets.top + 4 }]}>
      <Feather name="map-pin" size={11} color={C.primary} />
      <Text style={bannerStyles.text} numberOfLines={1}>{storeConfig.nombre}</Text>
      <Text style={bannerStyles.code}>{storeConfig.codigo}</Text>
      <View style={bannerStyles.versionBadge}>
        <Text style={bannerStyles.versionText}>v1.1</Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push("/boss-login")}
        style={bannerStyles.bossBtn}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="shield" size={14} color="#8B5CF6" />
      </TouchableOpacity>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    paddingHorizontal: 16,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.surfaceBorder,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
    letterSpacing: 0.3,
  },
  code: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textSecondary,
    backgroundColor: Colors.dark.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bossBtn: {
    padding: 2,
    marginLeft: 4,
  },
  versionBadge: {
    backgroundColor: "#00C896",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  versionText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#000",
    letterSpacing: 0.5,
  },
});

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  const firmaBottom = (isWeb ? 84 : 56) + insets.bottom + 6;

  return (
    <View style={{ flex: 1 }}>
      <StoreBanner />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: C.primary,
          tabBarInactiveTintColor: C.tabIconDefault,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : C.surface,
            borderTopWidth: 1,
            borderTopColor: C.surfaceBorder,
            elevation: 0,
            ...(isWeb ? { height: 84 } : {}),
          },
          tabBarLabelStyle: {
            fontFamily: "Inter_500Medium",
            fontSize: 11,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={90}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : isWeb ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surface }]} />
            ) : null,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Inicio",
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="house" tintColor={color} size={24} />
              ) : (
                <Feather name="home" size={22} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="conteo"
          options={{
            title: "Conteo",
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="barcode.viewfinder" tintColor={color} size={24} />
              ) : (
                <MaterialCommunityIcons name="barcode-scan" size={22} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="resumen"
          options={{
            title: "Resumen",
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="chart.bar" tintColor={color} size={24} />
              ) : (
                <Ionicons name="stats-chart" size={22} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="alertas"
          options={{
            title: "Alertas",
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="exclamationmark.triangle" tintColor={color} size={24} />
              ) : (
                <Feather name="alert-triangle" size={22} color={color} />
              ),
          }}
        />
      </Tabs>
      <Text style={[styles.firma, { bottom: firmaBottom }]} pointerEvents="none">Daniel E. Sanchez A.</Text>
    </View>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  firma: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    color: "rgba(255,255,255,0.18)",
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
});
