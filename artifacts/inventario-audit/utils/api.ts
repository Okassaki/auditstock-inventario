const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://439c42d1-136d-446b-bfa8-78b46cf7a994-00-3pt3107uvwsb4.janeway.replit.dev";

export const API_URL = `${API_BASE}/api`;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return res.json();
}

export interface TiendaAPI {
  id: number;
  codigo: string;
  nombre: string;
  creadoAt: string;
}

export async function verificarTienda(codigo: string): Promise<TiendaAPI> {
  return apiFetch<TiendaAPI>(`/tiendas/${encodeURIComponent(codigo)}`);
}

export async function reportarProgreso(
  codigoTienda: string,
  auditoriaId: string,
  auditoriaNombre: string,
  totalProductos: number,
  totalContados: number,
  estado: "activa" | "completada" | "archivada" = "activa"
): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigoTienda)}/progreso`, {
    method: "POST",
    body: JSON.stringify({ auditoriaId, auditoriaNombre, totalProductos, totalContados, estado }),
  });
}
