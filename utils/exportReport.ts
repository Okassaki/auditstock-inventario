import * as Print from "expo-print";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { ProductoInventario } from "@/context/DatabaseContext";
import { getDiferencia, getEstadoProducto } from "@/context/DatabaseContext";

function getProductosFiltrados(
  productos: ProductoInventario[],
  filtro: "todos" | "faltantes" | "sobrantes"
): ProductoInventario[] {
  if (filtro === "faltantes") return productos.filter((p) => getEstadoProducto(p) === "faltante");
  if (filtro === "sobrantes") return productos.filter((p) => getEstadoProducto(p) === "sobrante");
  return productos;
}

function generarHTML(
  productos: ProductoInventario[],
  filtro: "todos" | "faltantes" | "sobrantes",
  nombreAuditoria: string
): string {
  const items = getProductosFiltrados(productos, filtro);
  const fecha = new Date().toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalFaltantes = productos.filter((p) => getEstadoProducto(p) === "faltante").length;
  const totalSobrantes = productos.filter((p) => getEstadoProducto(p) === "sobrante").length;
  const totalCorrectos = productos.filter((p) => getEstadoProducto(p) === "correcto").length;
  const totalSinContar = productos.filter((p) => getEstadoProducto(p) === "sin_contar").length;

  const titulo =
    filtro === "faltantes"
      ? "Productos Faltantes"
      : filtro === "sobrantes"
      ? "Productos Sobrantes"
      : "Reporte Completo";

  const filas = items
    .map((p) => {
      const estado = getEstadoProducto(p);
      const diff = p.stock_fisico !== null ? getDiferencia(p) : null;
      const colorEstado =
        estado === "correcto"
          ? "#22c55e"
          : estado === "sobrante"
          ? "#f59e0b"
          : estado === "faltante"
          ? "#ef4444"
          : "#6b7280";
      const etiqueta =
        estado === "correcto"
          ? "Correcto"
          : estado === "sobrante"
          ? "Sobrante"
          : estado === "faltante"
          ? "Faltante"
          : "Sin Contar";
      const diffText =
        diff === null ? "—" : diff > 0 ? `+${diff}` : String(diff);
      const diffColor =
        diff === null ? "#6b7280" : diff === 0 ? "#22c55e" : diff > 0 ? "#f59e0b" : "#ef4444";

      return `
        <tr>
          <td style="font-weight:600;color:#3b82f6">${p.codigo}</td>
          <td>${p.nombre}</td>
          <td style="text-align:center">${p.stock_sistema}</td>
          <td style="text-align:center">${p.stock_fisico ?? "—"}</td>
          <td style="text-align:center;font-weight:700;color:${diffColor}">${diffText}</td>
          <td style="text-align:center">
            <span style="background:${colorEstado}22;color:${colorEstado};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${etiqueta}</span>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; font-size: 13px; }
  .card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
  .sub { color: #64748b; font-size: 13px; margin-bottom: 4px; }
  .stats { display: flex; gap: 12px; margin-top: 16px; }
  .stat { flex: 1; border-radius: 10px; padding: 12px; text-align: center; }
  .stat .num { font-size: 24px; font-weight: 700; }
  .stat .lbl { font-size: 11px; margin-top: 2px; }
  .stat.f { background: #fee2e2; color: #ef4444; }
  .stat.s { background: #fef3c7; color: #f59e0b; }
  .stat.c { background: #dcfce7; color: #22c55e; }
  .stat.n { background: #f1f5f9; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e293b; color: #fff; padding: 10px 8px; text-align: left; font-size: 12px; }
  td { padding: 9px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
  .total { color: #64748b; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="card">
  <h1>${nombreAuditoria}</h1>
  <p class="sub">${titulo} · ${fecha}</p>
  <div class="stats">
    <div class="stat f"><div class="num">${totalFaltantes}</div><div class="lbl">Faltantes</div></div>
    <div class="stat s"><div class="num">${totalSobrantes}</div><div class="lbl">Sobrantes</div></div>
    <div class="stat c"><div class="num">${totalCorrectos}</div><div class="lbl">Correctos</div></div>
    <div class="stat n"><div class="num">${totalSinContar}</div><div class="lbl">Sin Contar</div></div>
  </div>
</div>
<div class="card">
  <p class="section-title">${titulo}</p>
  <p class="total">${items.length} producto${items.length !== 1 ? "s" : ""}</p>
  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Nombre</th>
        <th style="text-align:center">Sistema</th>
        <th style="text-align:center">Físico</th>
        <th style="text-align:center">Dif.</th>
        <th style="text-align:center">Estado</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</div>
</body>
</html>`;
}

export async function exportarPDF(
  productos: ProductoInventario[],
  filtro: "todos" | "faltantes" | "sobrantes",
  nombreAuditoria: string
): Promise<void> {
  const html = generarHTML(productos, filtro, nombreAuditoria);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const fecha = new Date().toISOString().slice(0, 10);
  const nombreFiltro =
    filtro === "todos" ? "completo" : filtro === "faltantes" ? "faltantes" : "sobrantes";
  const destino = `${LegacyFS.cacheDirectory}auditoria_${nombreFiltro}_${fecha}.pdf`;

  await LegacyFS.copyAsync({ from: uri, to: destino });

  await Sharing.shareAsync(destino, {
    mimeType: "application/pdf",
    dialogTitle: `Exportar PDF — ${nombreAuditoria}`,
    UTI: "com.adobe.pdf",
  });
}

export { generarHTML, getProductosFiltrados };
