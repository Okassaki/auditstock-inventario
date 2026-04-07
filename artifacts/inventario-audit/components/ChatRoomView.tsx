import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  enviarMensaje,
  marcarMensajesLeidos,
  obtenerMensajesConversacion,
  obtenerTiendas,
  type MensajeAPI,
  type TiendaAPI,
} from "@/utils/api";

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

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  `https://${process.env.EXPO_PUBLIC_DOMAIN as string}/api`;

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
  const flatRef = useRef<FlatList>(null);
  const ultimoIdRef = useRef(0);

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
    return () => clearInterval(interval);
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
    adjuntoTipo?: "imagen" | "documento" | "contacto";
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
            {!!msg.texto && (
              <Text style={[makeStyles(T).bubbleText, esMio && makeStyles(T).bubbleTextMio]}>{msg.texto}</Text>
            )}
          </View>
          <Text style={[makeStyles(T).hora, esMio ? makeStyles(T).horaMio : makeStyles(T).horaAjeno]}>
            {formatHora(msg.creadoAt)}
          </Text>
        </View>
      </Pressable>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const listData = buildList(msgs);
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
          </>
        )}
      </View>

      {error && (
        <View style={s.errorRow}>
          <Feather name="wifi-off" size={13} color="#FF4757" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
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
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: T.primary }, (!texto.trim() || enviando) && s.sendBtnOff]}
            onPress={enviar}
            disabled={!texto.trim() || enviando}
          >
            {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>

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
      </KeyboardAvoidingView>

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
  });
}
