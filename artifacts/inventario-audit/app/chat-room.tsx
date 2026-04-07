import { useLocalSearchParams } from "expo-router";
import ChatRoomView from "@/components/ChatRoomView";

export default function ChatRoomScreen() {
  const { yo, con, conNombre } = useLocalSearchParams<{ yo: string; con: string; conNombre: string }>();
  return <ChatRoomView yo={yo ?? ""} con={con ?? ""} conNombre={conNombre ?? con ?? ""} mode="store" />;
}
