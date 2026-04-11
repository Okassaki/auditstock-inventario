import Constants from "expo-constants";
import { Platform } from "react-native";
import type { UpdateInfo } from "@/components/UpdateModal";

const REPO         = "Okassaki/auditstock-inventario";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

let onUpdateFound: ((info: UpdateInfo) => void) | null = null;

export function registerUpdateCallback(fn: (info: UpdateInfo) => void) {
  onUpdateFound = fn;
}

function currentVersionCode(): number {
  const fromConfig = Constants.expoConfig?.android?.versionCode as number | undefined;
  if (typeof fromConfig === "number" && fromConfig > 0) return fromConfig;

  const fromManifest2 = Constants.manifest2?.extra?.expoClient?.android?.versionCode as number | undefined;
  if (typeof fromManifest2 === "number" && fromManifest2 > 0) return fromManifest2;

  const fromManifest = (Constants as unknown as Record<string, unknown>)?.manifest as Record<string, unknown> | undefined;
  const fromManifestCode = fromManifest?.android as Record<string, unknown> | undefined;
  const legacyCode = fromManifestCode?.versionCode as number | undefined;
  if (typeof legacyCode === "number" && legacyCode > 0) return legacyCode;

  return 0;
}

function parseVersionCode(tag: string): number {
  const m = tag.replace(/^v/, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

export async function checkForUpdate(_options?: { silent?: boolean }): Promise<void> {
  if (Platform.OS !== "android") return;
  const current = currentVersionCode();
  if (current === 0) return;

  try {
    const resp = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return;

    const data = await (resp.json() as Promise<{
      tag_name: string;
      name: string;
      assets: Array<{ browser_download_url: string; name: string }>;
    }>);

    const latest = parseVersionCode(data.tag_name);
    if (latest <= current) return;

    const apkAsset = data.assets.find((a) => a.name.endsWith(".apk"));
    if (!apkAsset) return;

    onUpdateFound?.({
      versionCode: latest,
      currentCode: current,
      name: data.name || data.tag_name,
      downloadUrl: apkAsset.browser_download_url,
    });
  } catch {
    // Sin internet o falla el API — silencioso
  }
}

export type { UpdateInfo };
