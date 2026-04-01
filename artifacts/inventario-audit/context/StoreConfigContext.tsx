import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORE_CONFIG_KEY = "auditstock_store_config";

const WEB_DEV_CONFIG = { codigo: "DEV", nombre: "Modo Desarrollo (Web)" };

export interface StoreConfig {
  codigo: string;
  nombre: string;
}

interface StoreConfigContextValue {
  storeConfig: StoreConfig | null;
  isLoading: boolean;
  guardarConfig: (config: StoreConfig) => Promise<void>;
  limpiarConfig: () => Promise<void>;
}

const StoreConfigContext = createContext<StoreConfigContextValue | null>(null);

export function StoreConfigProvider({ children }: { children: React.ReactNode }) {
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(
    Platform.OS === "web" ? WEB_DEV_CONFIG : null
  );
  const [isLoading, setIsLoading] = useState(Platform.OS !== "web");

  useEffect(() => {
    if (Platform.OS === "web") return;
    AsyncStorage.getItem(STORE_CONFIG_KEY)
      .then((raw) => {
        if (raw) setStoreConfig(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const guardarConfig = useCallback(async (config: StoreConfig) => {
    await AsyncStorage.setItem(STORE_CONFIG_KEY, JSON.stringify(config));
    setStoreConfig(config);
  }, []);

  const limpiarConfig = useCallback(async () => {
    await AsyncStorage.removeItem(STORE_CONFIG_KEY);
    setStoreConfig(null);
  }, []);

  return (
    <StoreConfigContext.Provider value={{ storeConfig, isLoading, guardarConfig, limpiarConfig }}>
      {children}
    </StoreConfigContext.Provider>
  );
}

export function useStoreConfig() {
  const ctx = useContext(StoreConfigContext);
  if (!ctx) throw new Error("useStoreConfig must be used inside StoreConfigProvider");
  return ctx;
}
