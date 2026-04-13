import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import type { UpdateInfo } from "@/components/UpdateModal";
import { BUILD_VERSION_CODE } from "./buildVersion";

const REPO           = "Okassaki/auditstock-inventario";
const RELEASES_URL   = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const BG_TASK_NAME   = "CHECK_APP_UPDATES";
const LAST_NOTIF_KEY = "update_last_notified_version";

let onUpdateFound: ((info: UpdateInfo) => void) | null = null;

export function registerUpdateCallback(fn: (info: UpdateInfo) => void) {
  onUpdateFound = fn;
}

export function currentVersionCode(): number {
  if (BUILD_VERSION_CODE > 0) return BUILD_VERSION_CODE;
  const raw = Constants.expoConfig?.extra?.versionCode;
  if (raw !== undefined && raw !== null) {
    const v = Number(raw);
    if (!isNaN(v) && v > 0) return v;
  }
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
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ browser_download_url: string; name: string }>;
};

/**
 * Busca el release con el número de versión más alto entre los últimos 20 releases.
 * NO usa /releases/latest porque GitHub lo ordena por created_at — cuando varios
 * releases tienen el mismo created_at (builds simultáneos), el resultado es incorrecto.
 */
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
    const releases = await (resp.json() as Promise<GithubRelease[]>);

    let best: { versionCode: number; name: string; downloadUrl: string } | null = null;

    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const vc = parseVersionCode(release.tag_name);
      if (!vc) continue;
      const apk = release.assets.find((a) => a.name.endsWith(".apk"));
      if (!apk) continue;
      if (!best || vc > best.versionCode) {
        best = {
          versionCode: vc,
          name: release.name || release.tag_name,
          downloadUrl: apk.browser_download_url,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function showUpdatePushNotification(info: {
  versionCode: number;
  name: string;
  downloadUrl: string;
}) {
  try {
    const alreadyNotified = await AsyncStorage.getItem(LAST_NOTIF_KEY);
    if (alreadyNotified === String(info.versionCode)) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🆕 Nueva actualización disponible",
        body: `Versión ${info.versionCode} lista. Toca para descargar e instalar.`,
        data: {
          type: "update_available",
          versionCode: info.versionCode,
          downloadUrl: info.downloadUrl,
          releaseName: info.name,
        },
        sound: true,
      },
      trigger: null,
    });

    await AsyncStorage.setItem(LAST_NOTIF_KEY, String(info.versionCode));
  } catch {}
}

// ── Tarea de fondo ──────────────────────────────────────────────────────────────

TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const current = currentVersionCode();
    if (current === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    const release = await fetchLatestRelease();
    if (!release) return BackgroundFetch.BackgroundFetchResult.Failed;

    if (release.versionCode > current) {
      await showUpdatePushNotification(release);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundUpdateChecker(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) return;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BG_TASK_NAME);
    }
    await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
      minimumInterval: 60 * 15,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {}
}

// ── Verificar con la app abierta (muestra modal) ────────────────────────────────

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
