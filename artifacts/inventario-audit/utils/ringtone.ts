import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CallTone = "ring1" | "ring2" | "ring3" | "silent";
export type MsgTone = "ping" | "chime" | "pop" | "silent";

const CALL_SOURCES: Record<string, ReturnType<typeof require>> = {
  ring1: require("../assets/sounds/ring1.wav"),
  ring2: require("../assets/sounds/ring2.wav"),
  ring3: require("../assets/sounds/ring3.wav"),
};

const MSG_SOURCES: Record<string, ReturnType<typeof require>> = {
  ping:  require("../assets/sounds/ping.wav"),
  chime: require("../assets/sounds/chime.wav"),
  pop:   require("../assets/sounds/pop.wav"),
};

let currentSound: Audio.Sound | null = null;

export async function getCallTone(): Promise<CallTone> {
  return ((await AsyncStorage.getItem("call_tone")) as CallTone) ?? "ring1";
}

export async function getMsgTone(): Promise<MsgTone> {
  return ((await AsyncStorage.getItem("msg_tone")) as MsgTone) ?? "ping";
}

export async function setCallTone(tone: CallTone): Promise<void> {
  await AsyncStorage.setItem("call_tone", tone);
}

export async function setMsgTone(tone: MsgTone): Promise<void> {
  await AsyncStorage.setItem("msg_tone", tone);
}

async function stopCurrent() {
  if (currentSound) {
    try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch {}
    currentSound = null;
  }
}

export async function playCallRingtone(): Promise<void> {
  const tone = await getCallTone();
  if (tone === "silent") return;
  await stopCurrent();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
  const { sound } = await Audio.Sound.createAsync(CALL_SOURCES[tone], { isLooping: true, volume: 1 });
  currentSound = sound;
  await sound.playAsync();
}

export async function playMsgNotification(): Promise<void> {
  const tone = await getMsgTone();
  if (tone === "silent") return;
  await stopCurrent();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync(MSG_SOURCES[tone], { isLooping: false, volume: 1 });
  currentSound = sound;
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((s) => {
    if ("didJustFinish" in s && s.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
    }
  });
}

export async function stopRingtone(): Promise<void> {
  await stopCurrent();
}

export async function previewSound(key: string): Promise<void> {
  await stopCurrent();
  const all: Record<string, ReturnType<typeof require>> = { ...CALL_SOURCES, ...MSG_SOURCES };
  if (!all[key]) return;
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync(all[key], { isLooping: false, volume: 1 });
  currentSound = sound;
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((s) => {
    if ("didJustFinish" in s && s.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
    }
  });
}
