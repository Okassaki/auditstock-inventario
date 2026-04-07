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

// ─── Productos / Inventario ────────────────────────────────────────────────

export interface ProductoAPI {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  stockMinimo: number;
  creadoAt: string;
  actualizadoAt: string;
}

export interface StockTiendaAPI extends ProductoAPI {
  stockActual: number;
  actualizadoAt: string | null;
}

export interface MovimientoStockAPI {
  id: number;
  tiendaCodigo: string;
  productoCodigo: string;
  tipo: "entrada" | "salida" | "ajuste";
  cantidad: number;
  motivo: string | null;
  creadoAt: string;
}

export async function obtenerProductos(): Promise<ProductoAPI[]> {
  return apiFetch<ProductoAPI[]>("/productos");
}

export async function crearProducto(data: { codigo: string; nombre: string; descripcion?: string; precio: string; stockMinimo?: number }): Promise<ProductoAPI> {
  return apiFetch<ProductoAPI>("/productos", { method: "POST", body: JSON.stringify(data) });
}

export async function editarProducto(codigo: string, data: Partial<{ nombre: string; descripcion: string; precio: string; stockMinimo: number }>): Promise<ProductoAPI> {
  return apiFetch<ProductoAPI>(`/productos/${encodeURIComponent(codigo)}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function eliminarProducto(codigo: string): Promise<void> {
  await apiFetch(`/productos/${encodeURIComponent(codigo)}`, { method: "DELETE" });
}

export async function obtenerStockTienda(codigoTienda: string): Promise<StockTiendaAPI[]> {
  return apiFetch<StockTiendaAPI[]>(`/tiendas/${encodeURIComponent(codigoTienda)}/stock`);
}

export async function registrarMovimientoStock(
  codigoTienda: string,
  data: { productoCodigo: string; tipo: "entrada" | "salida" | "ajuste"; cantidad: number; motivo?: string }
): Promise<{ ok: boolean; stockActual: number }> {
  return apiFetch(`/tiendas/${encodeURIComponent(codigoTienda)}/stock`, { method: "POST", body: JSON.stringify(data) });
}

// ─── Ventas / Cobros ───────────────────────────────────────────────────────

export interface VentaItemAPI {
  id: number;
  ventaId: number;
  productoCodigo: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
}

export interface VentaAPI {
  id: number;
  tiendaCodigo: string;
  clienteNombre: string | null;
  clienteContacto: string | null;
  total: string;
  metodoPago: string;
  notas: string | null;
  creadoAt: string;
  items?: VentaItemAPI[];
}

export async function obtenerVentas(codigoTienda: string): Promise<VentaAPI[]> {
  return apiFetch<VentaAPI[]>(`/tiendas/${encodeURIComponent(codigoTienda)}/ventas`);
}

export async function crearVenta(codigoTienda: string, data: {
  clienteNombre?: string;
  clienteContacto?: string;
  metodoPago: string;
  notas?: string;
  items: { productoCodigo: string; productoNombre: string; cantidad: number; precioUnitario: string }[];
}): Promise<VentaAPI> {
  return apiFetch<VentaAPI>(`/tiendas/${encodeURIComponent(codigoTienda)}/ventas`, { method: "POST", body: JSON.stringify(data) });
}

export async function obtenerVenta(codigoTienda: string, id: number): Promise<VentaAPI> {
  return apiFetch<VentaAPI>(`/tiendas/${encodeURIComponent(codigoTienda)}/ventas/${id}`);
}

export async function eliminarVenta(codigoTienda: string, id: number): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigoTienda)}/ventas/${id}`, { method: "DELETE" });
}

// ─── Órdenes de Trabajo ────────────────────────────────────────────────────

export interface OrdenTrabajoAPI {
  id: number;
  tiendaCodigo: string;
  numero: string;
  clienteNombre: string;
  clienteContacto: string | null;
  descripcion: string;
  diagnostico: string | null;
  tecnico: string | null;
  estado: "pendiente" | "en_proceso" | "listo" | "entregado" | "cancelado";
  prioridad: "baja" | "normal" | "alta" | "urgente";
  presupuesto: string | null;
  costoFinal: string | null;
  notas: string | null;
  creadoAt: string;
  actualizadoAt: string;
}

export async function obtenerOrdenes(codigoTienda: string): Promise<OrdenTrabajoAPI[]> {
  return apiFetch<OrdenTrabajoAPI[]>(`/tiendas/${encodeURIComponent(codigoTienda)}/ordenes`);
}

export async function crearOrden(codigoTienda: string, data: {
  clienteNombre: string;
  clienteContacto?: string;
  descripcion: string;
  diagnostico?: string;
  tecnico?: string;
  prioridad?: string;
  presupuesto?: string;
  notas?: string;
}): Promise<OrdenTrabajoAPI> {
  return apiFetch<OrdenTrabajoAPI>(`/tiendas/${encodeURIComponent(codigoTienda)}/ordenes`, { method: "POST", body: JSON.stringify(data) });
}

export async function actualizarOrden(codigoTienda: string, id: number, data: Partial<{
  estado: string;
  diagnostico: string;
  tecnico: string;
  prioridad: string;
  presupuesto: string;
  costoFinal: string;
  notas: string;
}>): Promise<OrdenTrabajoAPI> {
  return apiFetch<OrdenTrabajoAPI>(`/tiendas/${encodeURIComponent(codigoTienda)}/ordenes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function eliminarOrden(codigoTienda: string, id: number): Promise<void> {
  await apiFetch(`/tiendas/${encodeURIComponent(codigoTienda)}/ordenes/${id}`, { method: "DELETE" });
}

export async function obtenerTodasOrdenes(): Promise<OrdenTrabajoAPI[]> {
  return apiFetch<OrdenTrabajoAPI[]>("/ordenes");
}

export async function obtenerTodasVentas(): Promise<VentaAPI[]> {
  return apiFetch<VentaAPI[]>("/ventas/resumen");
}
