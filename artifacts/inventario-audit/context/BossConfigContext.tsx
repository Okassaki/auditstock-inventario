import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const BOSS_PIN_KEY = "boss_pin_v1";

interface BossConfigContextValue {
  bossPin: string | null;
  bossAuthenticated: boolean;
  isLoading: boolean;
  setupPin: (pin: string) => Promise<void>;
  authenticate: (pin: string) => boolean;
  logout: () => void;
}

const BossConfigContext = createContext<BossConfigContextValue>({
  bossPin: null,
  bossAuthenticated: false,
  isLoading: true,
  setupPin: async () => {},
  authenticate: () => false,
  logout: () => {},
});

export function BossConfigProvider({ children }: { children: React.ReactNode }) {
  const [bossPin, setBossPin] = useState<string | null>(null);
  const [bossAuthenticated, setBossAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(BOSS_PIN_KEY).then((pin) => {
      setBossPin(pin);
      setIsLoading(false);
    });
  }, []);

  const setupPin = async (pin: string) => {
    await AsyncStorage.setItem(BOSS_PIN_KEY, pin);
    setBossPin(pin);
    setBossAuthenticated(true);
  };

  const authenticate = (pin: string): boolean => {
    if (pin === bossPin) {
      setBossAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setBossAuthenticated(false);
  };

  return (
    <BossConfigContext.Provider value={{ bossPin, bossAuthenticated, isLoading, setupPin, authenticate, logout }}>
      {children}
    </BossConfigContext.Provider>
  );
}

export function useBossConfig() {
  return useContext(BossConfigContext);
}
