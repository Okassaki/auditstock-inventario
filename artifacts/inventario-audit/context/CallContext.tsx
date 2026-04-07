import React, { createContext, useContext } from "react";
import { Alert } from "react-native";

export type CallType = "audio" | "video";
export type CallState = "idle" | "outgoing" | "incoming" | "active";

interface CallContextValue {
  callState: CallState;
  initiateCall: (peerId: string, peerName: string, type: CallType) => void;
}

const CallContext = createContext<CallContextValue>({
  callState: "idle",
  initiateCall: () => {},
});

export function CallProvider({ children }: { children: React.ReactNode }) {
  function initiateCall(_peerId: string, peerName: string, type: CallType) {
    Alert.alert(
      type === "video" ? "Video llamada" : "Llamada",
      `Las llamadas con ${peerName} estarán disponibles en la próxima actualización.`,
      [{ text: "Entendido" }]
    );
  }

  return (
    <CallContext.Provider value={{ callState: "idle", initiateCall }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
