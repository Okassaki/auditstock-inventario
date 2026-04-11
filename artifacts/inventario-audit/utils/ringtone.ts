import { Audio, type AVPlaybackSource } from "expo-av";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CallTone = "ring1" | "ring2" | "ring3" | "silent" | "custom" | "system";
export type MsgTone  = "ping"  | "chime" | "pop"   | "silent" | "custom" | "system";

const CALL_SOURCES: Record<string, AVPlaybackSource> = {
  ring1: require("../assets/sounds/ring1.wav") as AVPlaybackSource,
  ring2: require("../assets/sounds/ring2.wav") as AVPlaybackSource,
  ring3: require("../assets/sounds/ring3.wav") as AVPlaybackSource,
};

const MSG_SOURCES: Record<string, AVPlaybackSource> = {
  ping:  require("../assets/sounds/ping.wav")  as AVPlaybackSource,
  chime: require("../assets/sounds/chime.wav") as AVPlaybackSource,
  pop:   require("../assets/sounds/pop.wav")   as AVPlaybackSource,
};

const KEYS = {
  callTone:       "call_tone",
  msgTone:        "msg_tone",
  customCallUri:  "custom_call_uri",
  customCallName: "custom_call_name",
  customMsgUri:   "custom_msg_uri",
  customMsgName:  "custom_msg_name",
  systemCallUri:  "system_call_uri",
  systemCallName: "system_call_name",
  systemMsgUri:   "system_msg_uri",
  systemMsgName:  "system_msg_name",
};

let currentSound: Audio.Sound | null = null;

// ── Getters / setters ────────────────────────────────────────────────────────

export async function getCallTone(): Promise<CallTone> {
  return ((await AsyncStorage.getItem(KEYS.callTone)) as CallTone) ?? "ring1";
}
export async function getMsgTone(): Promise<MsgTone> {
  return ((await AsyncStorage.getItem(KEYS.msgTone)) as MsgTone) ?? "ping";
}
export async function setCallTone(tone: CallTone): Promise<void> {
  await AsyncStorage.setItem(KEYS.callTone, tone);
}
export async function setMsgTone(tone: MsgTone): Promise<void> {
  await AsyncStorage.setItem(KEYS.msgTone, tone);
}

// ── Custom URIs (archivo del dispositivo) ────────────────────────────────────

export async function getCustomCallUri(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.customCallUri);
}
export async function getCustomCallName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.customCallName);
}
export async function setCustomCall(uri: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([[KEYS.customCallUri, uri], [KEYS.customCallName, name]]);
}

export async function getCustomMsgUri(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.customMsgUri);
}
export async function getCustomMsgName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.customMsgName);
}
export async function setCustomMsg(uri: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([[KEYS.customMsgUri, uri], [KEYS.customMsgName, name]]);
}

// ── System ringtone URIs (picker nativo de Android) ──────────────────────────

export async function getSystemCallUri(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.systemCallUri);
}
export async function getSystemCallName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.systemCallName);
}
export async function setSystemCall(uri: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([[KEYS.systemCallUri, uri], [KEYS.systemCallName, name]]);
}

export async function getSystemMsgUri(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.systemMsgUri);
}
export async function getSystemMsgName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.systemMsgName);
}
export async function setSystemMsg(uri: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([[KEYS.systemMsgUri, uri], [KEYS.systemMsgName, name]]);
}

/**
 * Copies a picked audio file into the app's document directory so it persists
 * across app restarts (content:// URIs on Android are temporary).
 * Returns the permanent local URI.
 */
// expo-file-system@19 moved documentDirectory to the legacy namespace but it
// still exists at runtime — the type definition is just missing it.
const fsDocDir: string | null = (FileSystem as unknown as { documentDirectory: string | null }).documentDirectory;

export async function persistAudioFile(
  sourceUri: string,
  filename: string,
  slot: "call" | "msg"
): Promise<string> {
  const dest = `${fsDocDir}custom_${slot}_${filename}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
  } else if (info.uri !== sourceUri) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
  }
  return dest;
}

// ── Playback helpers ─────────────────────────────────────────────────────────

async function stopCurrent() {
  if (currentSound) {
    try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch {}
    currentSound = null;
  }
}

async function loadSource(uri: string): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { isLooping: false, volume: 1 }
  );
  return sound;
}

export async function playCallRingtone(): Promise<void> {
  const tone = await getCallTone();
  if (tone === "silent") return;
  await stopCurrent();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });

  let sound: Audio.Sound;
  if (tone === "custom") {
    const uri = await getCustomCallUri();
    if (!uri) return;
    sound = await loadSource(uri);
    await (sound as any).setIsLoopingAsync?.(true).catch(() => {});
  } else if (tone === "system") {
    const uri = await getSystemCallUri();
    if (!uri) return;
    sound = await loadSource(uri);
    await (sound as any).setIsLoopingAsync?.(true).catch(() => {});
  } else {
    const { sound: s } = await Audio.Sound.createAsync(
      CALL_SOURCES[tone],
      { isLooping: true, volume: 1 }
    );
    sound = s;
  }
  currentSound = sound;
  await sound.playAsync();
}

export async function playMsgNotification(): Promise<void> {
  const tone = await getMsgTone();
  if (tone === "silent") return;
  await stopCurrent();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

  let sound: Audio.Sound;
  if (tone === "custom") {
    const uri = await getCustomMsgUri();
    if (!uri) return;
    sound = await loadSource(uri);
  } else if (tone === "system") {
    const uri = await getSystemMsgUri();
    if (!uri) return;
    sound = await loadSource(uri);
  } else {
    const { sound: s } = await Audio.Sound.createAsync(
      MSG_SOURCES[tone],
      { isLooping: false, volume: 1 }
    );
    sound = s;
  }
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

export async function previewSound(key: string, customUri?: string): Promise<void> {
  await stopCurrent();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

  let sound: Audio.Sound;
  if ((key === "custom" || key === "system") && customUri) {
    sound = await loadSource(customUri);
  } else {
    const all: Record<string, AVPlaybackSource> = { ...CALL_SOURCES, ...MSG_SOURCES };
    const src = all[key];
    if (!src) return;
    const { sound: s } = await Audio.Sound.createAsync(src, { isLooping: false, volume: 1 });
    sound = s;
  }
  currentSound = sound;
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((s) => {
    if ("didJustFinish" in s && s.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
    }
  });
}
