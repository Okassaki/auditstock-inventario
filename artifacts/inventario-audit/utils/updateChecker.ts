import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import type { UpdateInfo } from "@/components/UpdateModal";
import { BUILD_VERSION_CODE } from "./buildVersion";

const REPO            = "Okassaki/auditstock-inventario";
const RELEASES_URL    = `https://api.github.com/repos/${REPO}/releases/latest`;
const BG_TASK_NAME    = "CHECK_APP_UPDATES";
const LAST_NOTIF_KEY  = "update_last_notified_version";

let onUpdateFound: ((info: UpdateInfo) => void) | null = null;

export function registerUpdateCallback(fn: (info: UpdateInfo) => void) {
  onUpdateFound = fn;
}

export function currentVersionCode(): number {
  // Fuente 1 (SIEMPRE confiable): constante hardcodeada en el TS del bundle.
  // Actualizar buildVersion.ts junto con app.json en cada release.
  // No depende de módulos nativos ni de que Constants esté poblado correctamente.
  if (BUILD_VERSION_CODE > 0) return BUILD_VERSION_CODE;

  // Fuente 2: Constants.expoConfig.extra.versionCode (Expo managed/standalone)
  const raw = Constants.expoConfig?.extra?.versionCode;
  if (raw !== undefined && raw !== null) {
    const v = Number(raw);
    if (!isNaN(v) && v > 0) return v;
  }

  // Fuente 3: Constants.expoConfig.android.versionCode
  const fromConfig = Constants.expoConfig?.android?.versionCode as number | undefined;
  if (typeof fromConfig === "number" && fromConfig > 0) return fromConfig;

  return 0;
}

function parseVersionCode(tag: string): number {
  const m = tag.replace(/^v/, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

type GithubRelease = {
  tag_name: string;
  name: string;
  assets: Array<{ browser_download_url: string; name: string }>;
};

async function fetchLatestRelease(): Promise<{
  versionCode: number;
  name: string;
  downloadUrl: string;
} | null> {
  try {
    const resp = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await (resp.json() as Promise<GithubRelease>);
    const versionCode = parseVersionCode(data.tag_name);
    const apkAsset = data.assets.find((a) => a.name.endsWith(".apk"));
    if (!versionCode || !apkAsset) return null;
    return { versionCode, name: data.name || data.tag_name, downloadUrl: apkAsset.browser_download_url };
  } catch {
    return null;
  }
}

async function showUpdatePushNotification(latest: GithubRelease & { versionCode: number; downloadUrl: string }) {
  try {
    const alreadyNotified = await AsyncStorage.getItem(LAST_NOTIF_KEY);
    if (alreadyNotified === String(latest.versionCode)) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🆕 Nueva actualización disponible",
        body: `Versión ${latest.versionCode} lista. Toca para descargar e instalar.`,
        data: {
          type: "update_available",
          versionCode: latest.versionCode,
          downloadUrl: latest.downloadUrl,
          releaseName: latest.name,
        },
        sound: true,
      },
      trigger: null,
    });

    await AsyncStorage.setItem(LAST_NOTIF_KEY, String(latest.versionCode));
  } catch {}
}

// ── Tarea de fondo (corre aunque la app esté cerrada) ───────────────────────
TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const current = currentVersionCode();
    if (current === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    const release = await fetchLatestRelease();
    if (!release) return BackgroundFetch.BackgroundFetchResult.Failed;

    if (release.versionCode > current) {
      await showUpdatePushNotification({ ...release, tag_name: `v${release.versionCode}`, assets: [{ browser_download_url: release.downloadUrl, name: "AuditStock.apk" }] });
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Registrar tarea de fondo (llamar al inicio de la app) ───────────────────
export async function registerBackgroundUpdateChecker(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) return;

    // Siempre re-registrar para aplicar el intervalo más reciente
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BG_TASK_NAME);
    }
    await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
      minimumInterval: 60 * 15, // Revisar cada 15 minutos (mínimo que permite Android)
      stopOnTerminate: false,    // Seguir corriendo aunque se cierre la app
      startOnBoot: true,         // Iniciar tras reinicio del dispositivo
    });
  } catch {}
}

// ── Verificar actualizaciones con la app abierta (muestra modal) ─────────────
export async function checkForUpdate(_options?: { silent?: boolean }): Promise<void> {
  if (Platform.OS !== "android") return;
  const current = currentVersionCode();
  if (current === 0) return;

  const release = await fetchLatestRelease();
  if (!release) return;
  if (release.versionCode <= current) return;

  onUpdateFound?.({
    versionCode: release.versionCode,
    currentCode: current,
    name: release.name,
    downloadUrl: release.downloadUrl,
  });
}

export type { UpdateInfo };
