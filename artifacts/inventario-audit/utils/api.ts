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

export interface ProductoSnapshot {
  codigo: string;
  nombre: string;
  stock_sistema: number;
  stock_fisico: number | null;
  comentario: string | null;
}

export interface ProgresoAPI {
  id: number;
  tiendaCodigo: string;
  auditoriaId: string;
  auditoriaNombre: string;
  totalProductos: number;
  totalContados: number;
  estado: "activa" | "completada" | "archivada";
  productosJson: string | null;
  actualizadoAt: string;
}

export interface ProgresoGeneralItem {
  tienda: TiendaAPI;
  progresoActivo: ProgresoAPI | null;
  totalAuditorias: number;
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
  estado: "activa" | "completada" | "archivada" = "activa",
  productos?: ProductoSnapshot[]
): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigoTienda)}/progreso`, {
    method: "POST",
    body: JSON.stringify({ auditoriaId, auditoriaNombre, totalProductos, totalContados, estado, productos }),
  });
}

export async function obtenerProgreso(): Promise<ProgresoGeneralItem[]> {
  return apiFetch<ProgresoGeneralItem[]>("/progreso");
}

export async function obtenerTiendas(): Promise<TiendaAPI[]> {
  return apiFetch<TiendaAPI[]>("/tiendas");
}

export async function crearTienda(codigo: string, nombre: string): Promise<TiendaAPI> {
  return apiFetch<TiendaAPI>("/tiendas", {
    method: "POST",
    body: JSON.stringify({ codigo, nombre }),
  });
}

export async function editarTienda(
  codigoActual: string,
  body: { codigo?: string; nombre?: string }
): Promise<TiendaAPI> {
  return apiFetch<TiendaAPI>(`/tiendas/${encodeURIComponent(codigoActual)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function eliminarTienda(codigo: string): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigo)}`, { method: "DELETE" });
}

export async function obtenerProgresotienda(codigo: string): Promise<ProgresoAPI[]> {
  return apiFetch<ProgresoAPI[]>(`/tiendas/${encodeURIComponent(codigo)}/progreso`);
}

export async function eliminarProgreso(
  codigoTienda: string,
  auditoriaId: string
): Promise<void> {
  await apiFetch(
    `/tiendas/${encodeURIComponent(codigoTienda)}/progreso/${encodeURIComponent(auditoriaId)}`,
    { method: "DELETE" }
  );
}

export interface ExcelPendienteAPI {
  nombreArchivo: string;
  contenidoBase64: string;
  subidoAt: string;
}

export async function subirExcelTienda(
  codigo: string,
  nombreArchivo: string,
  contenidoBase64: string
): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigo)}/excel`, {
    method: "POST",
    body: JSON.stringify({ nombreArchivo, contenidoBase64 }),
  });
}

export async function obtenerExcelPendiente(codigo: string): Promise<ExcelPendienteAPI | null> {
  try {
    return await apiFetch<ExcelPendienteAPI>(`/tiendas/${encodeURIComponent(codigo)}/excel`);
  } catch (e: any) {
    if (e?.message?.includes("404") || e?.message?.includes("No hay")) return null;
    throw e;
  }
}

export async function eliminarExcelPendiente(codigo: string): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigo)}/excel`, { method: "DELETE" });
}
