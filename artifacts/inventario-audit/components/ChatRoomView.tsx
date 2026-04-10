import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useKeyboardAnimatedHeight } from "@/utils/useKeyboardHeight";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_URL,
  eliminarMensaje,
  enviarMensaje,
  marcarMensajesLeidos,
  obtenerMensajesConversacion,
  obtenerTiendas,
  type MensajeAPI,
  type TiendaAPI,
} from "@/utils/api";
import { useCall } from "@/context/CallContext";

// ─── Temas ─────────────────────────────────────────────────────────────────

interface Theme {
  primary: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textSec: string;
  textMuted: string;
}

const STORE_THEME: Theme = {
  primary: "#00D4FF",
  bg: "#0A0F1E",
  surface: "#111827",
  border: "#1F2937",
  text: "#F0F4FF",
  textSec: "#8B98B8",
  textMuted: "#4A5468",
};

const BOSS_THEME: Theme = {
  primary: "#8B5CF6",
  bg: "#0D0A1E",
  surface: "#1A1530",
  border: "#2D2550",
  text: "#F0F4FF",
  textSec: "#8B7FBA",
  textMuted: "#6B5FA8",
};

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Props {
  yo: string;
  con: string;
  conNombre: string;
  mode: "store" | "boss";
}

const POLL = 5000;

const API_BASE = API_URL;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
function formatFecha(iso: string) {
  const d = new Date(iso),
    hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

type ListItem =
  | { type: "fecha"; fecha: string }
  | { type: "msg"; msg: MensajeAPI };

function buildList(msgs: MensajeAPI[]): ListItem[] {
  const items: ListItem[] = [];
  let fechaActual = "";
  for (const m of msgs) {
    const f = formatFecha(m.creadoAt);
    if (f !== fechaActual) {
      fechaActual = f;
      items.push({ type: "fecha", fecha: f });
    }
    items.push({ type: "msg", msg: m });
  }
  return items;
}

function formatSegs(segs: number): string {
  const m = Math.floor(segs / 60);
  const s = segs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function waveformBars(seed: number): number[] {
  const bars: number[] = [];
  let s = seed;
  for (let i = 0; i < 28; i++) {
    s = ((s * 1103515245 + 12345) & 0x7fffffff);
    bars.push(3 + (s % 14));
  }
  return bars;
}

async function uploadArchivo(uri: string, nombre: string, mime: string): Promise<{ url: string; nombre: string }> {
  const formData = new FormData();
  formData.append("archivo", { uri, name: nombre, type: mime } as unknown as Blob);
  const resp = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
  if (!resp.ok) throw new Error("Error al subir archivo");
  return resp.json() as Promise<{ url: string; nombre: string }>;
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function ChatRoomView({ yo, con, conNombre, mode }: Props) {
  const T = mode === "boss" ? BOSS_THEME : STORE_THEME;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { initiateCall, callState } = useCall();
  const flatRef = useRef<FlatList>(null);
  const ultimoIdRef = useRef(0);
  const kbHeight = useKeyboardAnimatedHeight();

  // Scroll to bottom when keyboard opens so input stays visible
  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => { setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80); }
    );
    return () => sub.remove();
  }, []);

  // Mensajes
  const [msgs, setMsgs] = useState<MensajeAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  // Panel de adjuntos
  const [showAttach, setShowAttach] = useState(false);
  const attachAnim = useRef(new Animated.Value(0)).current;

  // Modo selección / reenvío
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());

  // Modal de reenvío
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [tiendas, setTiendas] = useState<TiendaAPI[]>([]);
  const [reenviando, setReeenviando] = useState(false);

  // Eliminación
  const [eliminando, setEliminando] = useState(false);

  // Grabación de voz
  const [grabando, setGrabando] = useState(false);
  const [duracionGrab, setDuracionGrab] = useState(0);
  const cancelarGrab = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const grabTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const grabPulse = useRef(new Animated.Value(1)).current;

  // Reproducción de notas de voz
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playPos, setPlayPos] = useState<Record<number, number>>({});
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Fetch mensajes ──────────────────────────────────────────────────────

  const fetchMsgs = useCallback(
    async (inicial = false) => {
      try {
        const desde = inicial ? 0 : ultimoIdRef.current;
        const nuevos = await obtenerMensajesConversacion(yo, con, desde);
        if (nuevos.length > 0) {
          ultimoIdRef.current = nuevos[nuevos.length - 1].id;
          if (inicial) setMsgs(nuevos);
          else setMsgs((prev) => [...prev, ...nuevos]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: !inicial }), 80);
        }
        setError(null);
      } catch (e: unknown) {
        if (inicial) setError((e as Error)?.message ?? "Error de conexión");
      } finally {
        if (inicial) setLoading(false);
      }
    },
    [yo, con]
  );

  useEffect(() => {
    fetchMsgs(true);
    marcarMensajesLeidos(yo, con).catch(() => {});
    const interval = setInterval(() => fetchMsgs(false), POLL);
    // Actualización instantánea cuando llega un mensaje nuevo via WebSocket
    const sub = DeviceEventEmitter.addListener("chatNewMessage", () => fetchMsgs(false));
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [fetchMsgs, yo, con]);

  // ── Adjuntos panel ──────────────────────────────────────────────────────

  function toggleAttach() {
    const toVal = showAttach ? 0 : 1;
    setShowAttach(!showAttach);
    Animated.spring(attachAnim, { toValue: toVal, useNativeDriver: true, bounciness: 4 }).start();
  }

  // ── Enviar ──────────────────────────────────────────────────────────────

  async function enviar() {
    if (!texto.trim() || enviando) return;
    const txt = texto.trim();
    setTexto("");
    setShowAttach(false);
    await doEnviar({ texto: txt });
  }

  async function doEnviar(opts: {
    texto?: string;
    adjuntoUrl?: string;
    adjuntoTipo?: "imagen" | "documento" | "contacto" | "audio";
    adjuntoNombre?: string;
    reenviado?: boolean;
  }) {
    setEnviando(true);
    try {
      const nuevo = await enviarMensaje(
        yo,
        opts.texto ?? "",
        con === "GENERAL" ? undefined : con,
        opts.adjuntoUrl,
        opts.adjuntoTipo,
        opts.adjuntoNombre,
        opts.reenviado
      );
      ultimoIdRef.current = nuevo.id;
      setMsgs((prev) => [...prev, nuevo]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
      setError(null);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Error al enviar");
    } finally {
      setEnviando(false);
    }
  }

  // ── Adjuntos ────────────────────────────────────────────────────────────

  async function handleCamara() {
    setShowAttach(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      setEnviando(true);
      const nombre = `foto_${Date.now()}.jpg`;
      const { url } = await uploadArchivo(asset.uri, nombre, asset.mimeType ?? "image/jpeg");
      await doEnviar({ adjuntoUrl: url, adjuntoTipo: "imagen", adjuntoNombre: nombre });
    } catch {
      setError("Error al subir foto");
      setEnviando(false);
    }
  }

  async function handleGaleria() {
    setShowAttach(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      setEnviando(true);
      const nombre = asset.fileName ?? `imagen_${Date.now()}.jpg`;
      const { url } = await uploadArchivo(asset.uri, nombre, asset.mimeType ?? "image/jpeg");
      await doEnviar({ adjuntoUrl: url, adjuntoTipo: "imagen", adjuntoNombre: nombre });
    } catch {
      setError("Error al subir imagen");
      setEnviando(false);
    }
  }

  async function handleDocumento() {
    setShowAttach(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      setEnviando(true);
      const { url } = await uploadArchivo(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
      await doEnviar({ adjuntoUrl: url, adjuntoTipo: "documento", adjuntoNombre: asset.name });
    } catch {
      setError("Error al subir documento");
      setEnviando(false);
    }
  }

  async function handleContacto() {
    setShowAttach(false);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return;
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;
    const nombre = contact.name ?? "Contacto";
    const telefonos = (contact.phoneNumbers ?? []).map((p) => p.number ?? "").filter(Boolean).join(" / ");
    const resumen = telefonos ? `${nombre} — ${telefonos}` : nombre;
    await doEnviar({ adjuntoTipo: "contacto", adjuntoNombre: resumen });
  }

  // ── Grabación de voz ────────────────────────────────────────────────────

  async function iniciarGrabacion() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      cancelarGrab.current = false;
      setGrabando(true);
      setDuracionGrab(0);
      grabTimerRef.current = setInterval(() => setDuracionGrab((d) => d + 1), 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(grabPulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(grabPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } catch {}
  }

  async function detenerGrabacion(cancelar = false) {
    if (grabTimerRef.current) { clearInterval(grabTimerRef.current); grabTimerRef.current = null; }
    grabPulse.stopAnimation();
    grabPulse.setValue(1);
    setGrabando(false);
    const segsGrabados = duracionGrab;
    setDuracionGrab(0);
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      if (cancelar || segsGrabados < 1) return;
      const uri = rec.getURI();
      if (!uri) return;
      setEnviando(true);
      const nombre = `voz_${segsGrabados}s.m4a`;
      const { url } = await uploadArchivo(uri, nombre, "audio/m4a");
      await doEnviar({ adjuntoUrl: url, adjuntoTipo: "audio", adjuntoNombre: nombre });
    } catch { setEnviando(false); }
  }

  async function togglePlay(msg: MensajeAPI) {
    if (!msg.adjuntoUrl) return;
    if (playingId === msg.id) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlayingId(null);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(msg.id);
    setPlayPos((p) => ({ ...p, [msg.id]: 0 }));
    // Forzar altavoz: después de grabar, Android enruta al auricular por defecto
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: msg.adjuntoUrl },
      { shouldPlay: false, volume: 1.0 },
      (status) => {
        if (status.isLoaded) {
          const prog = status.durationMillis ? status.positionMillis / status.durationMillis : 0;
          setPlayPos((p) => ({ ...p, [msg.id]: prog }));
          if (status.didJustFinish) {
            setPlayingId(null);
            setPlayPos((p) => ({ ...p, [msg.id]: 0 }));
            sound.unloadAsync();
          }
        }
      }
    );
    soundRef.current = sound;
    await sound.playAsync();
  }

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (grabTimerRef.current) clearInterval(grabTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // ── Selección / Reenvío ─────────────────────────────────────────────────

  function toggleSeleccion(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelarSeleccion() {
    setSeleccionando(false);
    setSeleccionados(new Set());
  }

  async function abrirForwardPicker() {
    if (seleccionados.size === 0) return;
    try {
      const ts = await obtenerTiendas();
      setTiendas(ts);
    } catch {
      setTiendas([]);
    }
    setShowForwardPicker(true);
  }

  function handleEliminar() {
    if (seleccionados.size === 0) return;

    // Solo se puede "eliminar para todos" si TODOS los mensajes seleccionados son propios
    const todosPropos = Array.from(seleccionados).every(
      (id) => msgs.find((m) => m.id === id)?.deTienda === yo
    );

    const count = seleccionados.size;
    const titulo = "Eliminar mensaje" + (count > 1 ? `s (${count})` : "");
    const cuerpo = todosPropos
      ? "¿Cómo quieres eliminar?"
      : "Solo podés eliminar mensajes ajenos para vos mismo.";

    const botones: Parameters<typeof Alert.alert>[2] = [
      {
        text: "Eliminar para mí",
        onPress: async () => {
          setEliminando(true);
          const ids = Array.from(seleccionados);
          for (const id of ids) {
            await eliminarMensaje(id, "yo", yo).catch(() => {});
          }
          setMsgs((prev) =>
            prev.map((m) =>
              seleccionados.has(m.id)
                ? { ...m, eliminadosPara: [...(m.eliminadosPara ?? []), yo] }
                : m
            )
          );
          setEliminando(false);
          cancelarSeleccion();
        },
      },
      ...(todosPropos
        ? [
            {
              text: "Eliminar para todos",
              style: "destructive" as const,
              onPress: async () => {
                setEliminando(true);
                const ids = Array.from(seleccionados);
                for (const id of ids) {
                  await eliminarMensaje(id, "todos", yo).catch(() => {});
                }
                setMsgs((prev) =>
                  prev.map((m) =>
                    seleccionados.has(m.id) ? { ...m, eliminadoTodos: true } : m
                  )
                );
                setEliminando(false);
                cancelarSeleccion();
              },
            },
          ]
        : []),
      { text: "Cancelar", style: "cancel" as const },
    ];

    Alert.alert(titulo, cuerpo, botones);
  }

  async function reenviarA(destino: string, _destinoNombre: string) {
    setShowForwardPicker(false);
    setReeenviando(true);
    const selArr = msgs.filter((m) => seleccionados.has(m.id));
    for (const m of selArr) {
      await enviarMensaje(
        yo,
        m.texto ?? "",
        destino === "GENERAL" ? undefined : destino,
        m.adjuntoUrl ?? undefined,
        m.adjuntoTipo as "imagen" | "documento" | "contacto" | undefined,
        m.adjuntoNombre ?? undefined,
        true,
      ).catch(() => {});
    }
    setReeenviando(false);
    cancelarSeleccion();
  }

  // ── Render burbuja ──────────────────────────────────────────────────────

  function renderBubble(msg: MensajeAPI) {
    const esMio = msg.deTienda === yo;
    const seleccionado = seleccionados.has(msg.id);
    return (
      <Pressable
        onLongPress={() => {
          setSeleccionando(true);
          setSeleccionados(new Set([msg.id]));
        }}
        onPress={() => {
          if (seleccionando) toggleSeleccion(msg.id);
        }}
        style={[
          makeStyles(T).bubbleWrap,
          esMio ? makeStyles(T).mioWrap : makeStyles(T).ajenoWrap,
          seleccionado && { opacity: 0.75 },
          seleccionando && seleccionado && { backgroundColor: T.primary + "18", borderRadius: 12 },
        ]}
      >
        {seleccionando && (
          <View style={[makeStyles(T).checkbox, seleccionado && { backgroundColor: T.primary, borderColor: T.primary }]}>
            {seleccionado && <Feather name="check" size={10} color="#fff" />}
          </View>
        )}

        <View style={makeStyles(T).bubbleContent}>
          {!esMio && con === "GENERAL" && (
            <Text style={[makeStyles(T).senderName, { color: T.primary }]}>{msg.deTienda}</Text>
          )}
          {msg.eliminadoTodos ? (
            <View style={[makeStyles(T).bubble, esMio ? makeStyles(T).bubbleMio : makeStyles(T).bubbleAjeno, { flexDirection: "row", alignItems: "center", gap: 6, opacity: 0.6 }]}>
              <Feather name="slash" size={13} color={esMio ? "rgba(255,255,255,0.6)" : T.textSec} />
              <Text style={[makeStyles(T).bubbleText, esMio && makeStyles(T).bubbleTextMio, { fontStyle: "italic" }]}>
                Mensaje eliminado
              </Text>
            </View>
          ) : (
            <>
              {msg.reenviado && (
                <View style={makeStyles(T).reenviadoTag}>
                  <Feather name="corner-up-right" size={11} color={T.textSec} />
                  <Text style={makeStyles(T).reenviadoText}>Reenviado</Text>
                </View>
              )}
              <View style={[makeStyles(T).bubble, esMio ? makeStyles(T).bubbleMio : makeStyles(T).bubbleAjeno]}>
                {msg.adjuntoTipo === "imagen" && msg.adjuntoUrl && (
                  <Image source={{ uri: msg.adjuntoUrl }} style={makeStyles(T).adjuntoImg} contentFit="cover" />
                )}
                {msg.adjuntoTipo === "documento" && (
                  <View style={makeStyles(T).adjuntoDoc}>
                    <Feather name="file-text" size={22} color={esMio ? "rgba(255,255,255,0.8)" : T.primary} />
                    <Text style={[makeStyles(T).adjuntoDocNombre, esMio && { color: "rgba(255,255,255,0.9)" }]} numberOfLines={2}>
                      {msg.adjuntoNombre ?? "Documento"}
                    </Text>
                  </View>
                )}
                {msg.adjuntoTipo === "contacto" && (
                  <View style={makeStyles(T).adjuntoContacto}>
                    <Feather name="user" size={20} color={esMio ? "rgba(255,255,255,0.9)" : T.primary} />
                    <Text style={[makeStyles(T).adjuntoContactoNombre, esMio && { color: "rgba(255,255,255,0.9)" }]} numberOfLines={2}>
                      {msg.adjuntoNombre ?? "Contacto"}
                    </Text>
                  </View>
                )}
                {msg.adjuntoTipo === "audio" && (() => {
                  const durSecs = parseInt(msg.adjuntoNombre?.match(/voz_(\d+)s/)?.[1] ?? "0");
                  const bars = waveformBars(msg.id);
                  const prog = playPos[msg.id] ?? 0;
                  const playing = playingId === msg.id;
                  return (
                    <TouchableOpacity
                      style={makeStyles(T).audioBubble}
                      onPress={() => togglePlay(msg)}
                      activeOpacity={0.8}
                    >
                      <View style={[makeStyles(T).audioPlayBtn, { backgroundColor: esMio ? "rgba(255,255,255,0.2)" : T.primary + "30" }]}>
                        <Feather name={playing ? "pause" : "play"} size={15} color={esMio ? "#fff" : T.primary} />
                      </View>
                      <View style={makeStyles(T).audioWaveform}>
                        {bars.map((h, i) => {
                          const active = i / bars.length < prog;
                          return (
                            <View
                              key={i}
                              style={[
                                makeStyles(T).audioWaveBar,
                                { height: h },
                                active
                                  ? { backgroundColor: esMio ? "#fff" : T.primary }
                                  : { backgroundColor: esMio ? "rgba(255,255,255,0.35)" : T.textMuted },
                              ]}
                            />
                          );
                        })}
                      </View>
                      <Text style={[makeStyles(T).audioDur, esMio && { color: "rgba(255,255,255,0.75)" }]}>
                        {playing ? formatSegs(Math.round((playPos[msg.id] ?? 0) * durSecs)) : formatSegs(durSecs)}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
                {!!msg.texto && (
                  <Text style={[makeStyles(T).bubbleText, esMio && makeStyles(T).bubbleTextMio]}>{msg.texto}</Text>
                )}
              </View>
            </>
          )}
          <Text style={[makeStyles(T).hora, esMio ? makeStyles(T).horaMio : makeStyles(T).horaAjeno]}>
            {formatHora(msg.creadoAt)}
          </Text>
        </View>
      </Pressable>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const msgsVisibles = msgs.filter((m) => !(m.eliminadosPara ?? []).includes(yo));
  const listData = buildList(msgsVisibles);
  const s = makeStyles(T);

  const attachTranslateY = attachAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });
  const attachOpacity = attachAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        {seleccionando ? (
          <>
            <TouchableOpacity onPress={cancelarSeleccion} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={22} color={T.text} />
            </TouchableOpacity>
            <Text style={[s.headerName, { flex: 1 }]}>{seleccionados.size} seleccionado{seleccionados.size !== 1 ? "s" : ""}</Text>
            <TouchableOpacity
              onPress={abrirForwardPicker}
              style={[s.forwardBtn, seleccionados.size === 0 && { opacity: 0.4 }]}
              disabled={seleccionados.size === 0}
            >
              <Feather name="corner-up-right" size={20} color={T.primary} />
              <Text style={[s.forwardBtnText, { color: T.primary }]}>Reenviar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleEliminar}
              style={[s.forwardBtn, { marginLeft: 4 }, (seleccionados.size === 0 || eliminando) && { opacity: 0.4 }]}
              disabled={seleccionados.size === 0 || eliminando}
            >
              {eliminando
                ? <ActivityIndicator size={18} color="#FF4757" />
                : <Feather name="trash-2" size={20} color="#FF4757" />}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="arrow-left" size={22} color={T.text} />
            </TouchableOpacity>
            <View style={s.headerInfo}>
              <View style={[s.avatar, { backgroundColor: T.primary + "25" }]}>
                <Feather name={con === "GENERAL" ? "hash" : "message-circle"} size={16} color={T.primary} />
              </View>
              <View>
                <Text style={s.headerName}>{conNombre}</Text>
                <Text style={s.headerSub}>{con === "GENERAL" ? "Visible para todas las tiendas" : "Chat privado"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 4, marginLeft: "auto" }}>
              {con !== "GENERAL" && (
                <>
                  <TouchableOpacity
                    style={[s.callBtn, callState !== "idle" && { opacity: 0.4 }]}
                    disabled={callState !== "idle"}
                    onPress={() => initiateCall(con, conNombre, "audio")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="phone" size={20} color={T.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.callBtn, callState !== "idle" && { opacity: 0.4 }]}
                    disabled={callState !== "idle"}
                    onPress={() => initiateCall(con, conNombre, "video")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="video" size={20} color={T.primary} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={s.callBtn}
                onPress={() => router.push("/ajustes-sonido")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="settings" size={18} color={T.textSec} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {error && (
        <View style={s.errorRow}>
          <Feather name="wifi-off" size={13} color="#FF4757" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Animated.View style={{ flex: 1, paddingBottom: kbHeight }}>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={T.primary} /></View>
        ) : (
          <FlatList
            ref={flatRef}
            data={listData}
            keyExtractor={(item, i) => item.type === "fecha" ? `f-${i}` : `m-${item.msg.id}`}
            renderItem={({ item }) => {
              if (item.type === "fecha") {
                return (
                  <View style={s.fechaRow}>
                    <View style={s.fechaLine} />
                    <Text style={s.fechaText}>{item.fecha}</Text>
                    <View style={s.fechaLine} />
                  </View>
                );
              }
              return renderBubble(item.msg);
            }}
            contentContainerStyle={[s.list, { paddingBottom: 8 }]}
            ListEmptyComponent={
              <View style={s.empty}>
                <Feather name="message-circle" size={36} color={T.textMuted} />
                <Text style={s.emptyText}>Aún no hay mensajes</Text>
                <Text style={s.emptyDesc}>Sé el primero en escribir</Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        {grabando ? (
          <View style={[s.grabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TouchableOpacity onPress={() => detenerGrabacion(true)} style={s.grabCancelBtn}>
              <Feather name="x" size={20} color="#FF4757" />
              <Text style={s.grabCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <View style={s.grabCenter}>
              <Animated.View style={[s.grabDot, { opacity: grabPulse }]} />
              <Text style={s.grabDurText}>{formatSegs(duracionGrab)}</Text>
            </View>
            <Pressable
              style={[s.sendBtn, { backgroundColor: "#FF4757" }]}
              onPressOut={() => detenerGrabacion(false)}
            >
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TouchableOpacity onPress={toggleAttach} style={s.attachBtn}>
              <Feather name={showAttach ? "x" : "paperclip"} size={20} color={showAttach ? T.primary : T.textSec} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="Escribí un mensaje..."
              placeholderTextColor={T.textMuted}
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={1000}
              editable={!enviando}
              onFocus={() => showAttach && setShowAttach(false)}
            />
            {texto.trim() ? (
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: T.primary }, enviando && s.sendBtnOff]}
                onPress={enviar}
                disabled={enviando}
              >
                {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <Pressable
                style={[s.sendBtn, { backgroundColor: T.primary }]}
                onLongPress={iniciarGrabacion}
                delayLongPress={200}
              >
                <Feather name="mic" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
        )}

        {/* Panel de adjuntos */}
        {showAttach && (
          <Animated.View style={[s.attachPanel, { transform: [{ translateY: attachTranslateY }], opacity: attachOpacity }]}>
            <View style={s.attachGrid}>
              {[
                { icono: "camera", label: "Cámara", color: "#FF4D8D", onPress: handleCamara },
                { icono: "image", label: "Galería", color: "#00B4FF", onPress: handleGaleria },
                { icono: "file-text", label: "Documento", color: "#7C3AED", onPress: handleDocumento },
                { icono: "user", label: "Contacto", color: "#10B981", onPress: handleContacto },
              ].map((item) => (
                <TouchableOpacity key={item.label} style={s.attachItem} onPress={item.onPress}>
                  <View style={[s.attachIcon, { backgroundColor: item.color + "22", borderColor: item.color + "44" }]}>
                    <Feather name={item.icono as React.ComponentProps<typeof Feather>["name"]} size={26} color={item.color} />
                  </View>
                  <Text style={s.attachLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}
      </Animated.View>

      {/* Modal de reenvío */}
      <Modal visible={showForwardPicker} transparent animationType="slide" onRequestClose={() => setShowForwardPicker(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowForwardPicker(false)}>
          <View style={[s.forwardSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.forwardHandle} />
            <Text style={s.forwardTitle}>Reenviar a...</Text>
            <ScrollView>
              {[
                { id: "GENERAL", nombre: "General", icono: "hash" as React.ComponentProps<typeof Feather>["name"] },
                ...(yo !== "JEFE" ? [{ id: "JEFE", nombre: "Jefe", icono: "shield" as React.ComponentProps<typeof Feather>["name"] }] : []),
                ...tiendas
                  .filter((t) => t.codigo !== yo && t.codigo !== con)
                  .map((t) => ({ id: t.codigo, nombre: t.nombre, icono: "map-pin" as React.ComponentProps<typeof Feather>["name"] })),
              ].map((dest) => (
                <TouchableOpacity key={dest.id} style={s.forwardRow} onPress={() => reenviarA(dest.id, dest.nombre)}>
                  <View style={[s.forwardAvatar, { backgroundColor: T.primary + "20" }]}>
                    <Feather name={dest.icono} size={16} color={T.primary} />
                  </View>
                  <Text style={s.forwardRowText}>{dest.nombre}</Text>
                  <Feather name="corner-up-right" size={16} color={T.textSec} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {reenviando && (
        <View style={s.reenviandoOverlay}>
          <ActivityIndicator color={T.primary} />
          <Text style={s.reenviandoText}>Reenviando...</Text>
        </View>
      )}
    </View>
  );
}

// ─── Estilos dinámicos ──────────────────────────────────────────────────────

function makeStyles(T: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 12, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.surface,
    },
    backBtn: { padding: 4 },
    headerInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: T.text },
    headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: T.textMuted },
    forwardBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
    callBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
    forwardBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    errorRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FF475715", paddingHorizontal: 14, paddingVertical: 8,
      marginHorizontal: 12, marginTop: 8, borderRadius: 8,
    },
    errorText: { fontSize: 13, color: "#FF4757", fontFamily: "Inter_400Regular", flex: 1 },
    list: { padding: 12, gap: 2 },
    empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: T.textSec },
    emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: T.textMuted },
    fechaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
    fechaLine: { flex: 1, height: 1, backgroundColor: T.border },
    fechaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: T.textSec },
    bubbleWrap: { marginVertical: 2, maxWidth: "82%", padding: 2 },
    mioWrap: { alignSelf: "flex-end", alignItems: "flex-end", flexDirection: "row-reverse", gap: 6 },
    ajenoWrap: { alignSelf: "flex-start", alignItems: "flex-start", flexDirection: "row", gap: 6 },
    bubbleContent: { flex: 1 },
    checkbox: {
      width: 18, height: 18, borderRadius: 9,
      borderWidth: 2, borderColor: T.textSec,
      alignItems: "center", justifyContent: "center",
      alignSelf: "center",
    },
    senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 2, marginLeft: 4 },
    reenviadoTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2, marginLeft: 4 },
    reenviadoText: { fontSize: 11, fontFamily: "Inter_400Regular", color: T.textSec },
    bubble: { borderRadius: 18, overflow: "hidden" },
    bubbleMio: { backgroundColor: T.primary, borderBottomRightRadius: 4 },
    bubbleAjeno: { backgroundColor: T.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: T.border },
    bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21, color: T.text, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleTextMio: { color: "#fff" },
    hora: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3, color: T.textMuted },
    horaMio: { marginRight: 4, textAlign: "right" },
    horaAjeno: { marginLeft: 4 },
    adjuntoImg: { width: 200, height: 180, borderRadius: 12 },
    adjuntoDoc: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 14, paddingVertical: 12, minWidth: 160, maxWidth: 220,
    },
    adjuntoDocNombre: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: T.text },
    adjuntoContacto: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 14, paddingVertical: 12, minWidth: 160, maxWidth: 220,
    },
    adjuntoContactoNombre: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: T.text },
    inputBar: {
      flexDirection: "row", alignItems: "flex-end", gap: 8,
      paddingHorizontal: 10, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface,
    },
    attachBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    input: {
      flex: 1, minHeight: 40, maxHeight: 120,
      backgroundColor: T.bg, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      color: T.text, fontFamily: "Inter_400Regular", fontSize: 15,
      borderWidth: 1, borderColor: T.border,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    sendBtnOff: { opacity: 0.4 },
    attachPanel: {
      backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border,
      paddingHorizontal: 16, paddingVertical: 20,
    },
    attachGrid: { flexDirection: "row", justifyContent: "space-around" },
    attachItem: { alignItems: "center", gap: 8, flex: 1 },
    attachIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    attachLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: T.textSec },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    forwardSheet: {
      backgroundColor: T.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingTop: 12, paddingHorizontal: 16, maxHeight: "60%",
    },
    forwardHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: "center", marginBottom: 16 },
    forwardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: T.text, marginBottom: 12 },
    forwardRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border,
    },
    forwardAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    forwardRowText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: T.text },
    reenviandoOverlay: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", gap: 12,
    },
    reenviandoText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#fff" },
    // Audio bubble
    audioBubble: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 12, paddingVertical: 10, minWidth: 200, maxWidth: 240,
    },
    audioPlayBtn: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: "center", justifyContent: "center",
    },
    audioWaveform: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2, height: 28 },
    audioWaveBar: { width: 2.5, borderRadius: 2 },
    audioDur: { fontSize: 11, fontFamily: "Inter_500Medium", color: T.textSec, minWidth: 28 },
    // Barra de grabación
    grabBar: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 10, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface,
    },
    grabCancelBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
    grabCancelText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#FF4757" },
    grabCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
    grabDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF4757" },
    grabDurText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: T.text },
  });
}
