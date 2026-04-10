import { useLocalSearchParams } from "expo-router";
import ChatRoomView from "@/components/ChatRoomView";

export default function BossChatRoomScreen() {
  const { con, conNombre } = useLocalSearchParams<{ con: string; conNombre: string }>();
  return <ChatRoomView yo="JEFE" con={con ?? ""} conNombre={conNombre ?? con ?? ""} mode="boss" />;
}
