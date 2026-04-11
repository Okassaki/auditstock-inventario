import { useLocalSearchParams } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import ChatRoomView from "@/components/ChatRoomView";

export default function ChatRoomScreen() {
  const { yo, con, conNombre } = useLocalSearchParams<{ yo: string; con: string; conNombre: string }>();
  if (!yo || !con) {
    return <View style={{ flex: 1, backgroundColor: "#0B141A", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#00D4FF" /></View>;
  }
  return <ChatRoomView yo={yo} con={con} conNombre={conNombre ?? con} mode="store" />;
}
