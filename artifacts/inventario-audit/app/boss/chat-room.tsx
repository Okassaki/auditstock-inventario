import { useLocalSearchParams } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import ChatRoomView from "@/components/ChatRoomView";

export default function BossChatRoomScreen() {
  const { con, conNombre } = useLocalSearchParams<{ con: string; conNombre: string }>();
  if (!con) {
    return <View style={{ flex: 1, backgroundColor: "#0B0E18", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#8B5CF6" /></View>;
  }
  return <ChatRoomView yo="JEFE" con={con} conNombre={conNombre ?? con} mode="boss" />;
}
