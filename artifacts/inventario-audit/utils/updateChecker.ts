import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Alert, Platform } from "react-native";

const REPO = "Okassaki/auditstock-inventario";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

function currentVersionCode(): number {
  const code =
    (Constants.expoConfig?.android?.versionCode as number | undefined) ??
    (Constants.manifest2?.extra?.expoClient?.android?.versionCode as number | undefined) ??
    0;
  return code;
}

function parseVersionCode(tag: string): number {
  const match = tag.replace(/^v/, "").match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export async function checkForUpdate(options?: { silent?: boolean }): Promise<void> {
  if (Platform.OS !== "android") return;
  const current = currentVersionCode();
  if (current === 0) return;

  try {
    const resp = await fetch(RELEASES_URL, {
      headers: { "Accept": "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return;

    const data = await resp.json() as {
      tag_name: string;
      name: string;
      html_url: string;
      assets: Array<{ browser_download_url: string; name: string }>;
    };

    const latest = parseVersionCode(data.tag_name);
    if (latest <= current) {
      if (!options?.silent) {
        Alert.alert("Sin actualizaciones", "Tenés la versión más reciente instalada.");
      }
      return;
    }

    const apkAsset = data.assets.find((a) => a.name.endsWith(".apk"));
    const downloadUrl = apkAsset?.browser_download_url ?? RELEASES_PAGE;

    Alert.alert(
      "🆕 Actualización disponible",
      `Versión ${data.name || data.tag_name} está lista.\n\nTu versión actual: ${current}\nNueva versión: ${latest}`,
      [
        { text: "Después", style: "cancel" },
        {
          text: "Descargar",
          onPress: () => Linking.openURL(downloadUrl).catch(() => Linking.openURL(RELEASES_PAGE)),
        },
      ]
    );
  } catch {
    // Si no hay internet o falla la API, no mostrar error
  }
}
