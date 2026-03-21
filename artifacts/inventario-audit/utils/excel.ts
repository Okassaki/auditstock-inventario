import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { utils, write, read } from "xlsx";
import type { ProductoInventario } from "@/context/DatabaseContext";
import { getDiferencia, getEstadoProducto } from "@/context/DatabaseContext";

export interface ExcelProducto {
  codigo: string;
  nombre: string;
  stock_sistema: number;
  imeis_sistema?: string;
}

export async function parsearExcel(uri: string): Promise<{
  productos: ExcelProducto[];
  errores: string[];
}> {
  const errores: string[] = [];
  const productos: ExcelProducto[] = [];

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = read(base64, { type: "base64" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const codigo = String(
        row["Código"] ?? row["Codigo"] ?? row["codigo"] ?? row["CODIGO"] ?? ""
      ).trim();
      const nombre = String(
        row["Nombre"] ?? row["nombre"] ?? row["NOMBRE"] ?? ""
      ).trim();
      const stockRaw = row["Stock Sistema"] ?? row["stock_sistema"] ?? row["StockSistema"] ?? row["Stock"] ?? row["stock"] ?? 0;
      const stock = Number(stockRaw);
      const imei = String(row["IMEI"] ?? row["imei"] ?? row["Imei"] ?? "").trim();

      if (!codigo) {
        errores.push(`Fila ${rowNum}: Código vacío (omitida)`);
        continue;
      }
      if (isNaN(stock)) {
        errores.push(`Fila ${rowNum}: Stock inválido para ${codigo}`);
        continue;
      }

      productos.push({
        codigo,
        nombre: nombre || codigo,
        stock_sistema: Math.max(0, stock),
        imeis_sistema: imei || undefined,
      });
    }
  } catch (err) {
    errores.push(`Error leyendo archivo: ${err}`);
  }

  return { productos, errores };
}

export async function exportarExcel(
  productos: ProductoInventario[],
  filtro: "todos" | "faltantes" | "sobrantes",
  nombreAuditoria: string
): Promise<void> {
  let productosFiltrados = productos;

  if (filtro === "faltantes") {
    productosFiltrados = productos.filter((p) => getEstadoProducto(p) === "faltante");
  } else if (filtro === "sobrantes") {
    productosFiltrados = productos.filter((p) => getEstadoProducto(p) === "sobrante");
  }

  const data = productosFiltrados.map((p) => {
    const estado = getEstadoProducto(p);
    const diff = getDiferencia(p);
    const etiqueta =
      estado === "correcto"
        ? "Correcto"
        : estado === "sobrante"
        ? "Sobrante"
        : estado === "faltante"
        ? "Faltante"
        : "Sin Contar";

    return {
      Código: p.codigo,
      Nombre: p.nombre,
      "Stock Sistema": p.stock_sistema,
      "Stock Físico": p.stock_fisico ?? "Sin contar",
      Diferencia: p.stock_fisico !== null ? diff : "-",
      Estado: etiqueta,
      "IMEIs Sistema": p.imeis_sistema ?? "",
      "IMEIs Físicos": p.imeis_fisicos ?? "",
      Inconsistencias: p.inconsistencias ?? "",
    };
  });

  const wb = utils.book_new();
  const ws = utils.json_to_sheet(data);

  ws["!cols"] = [
    { wch: 15 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
  ];

  utils.book_append_sheet(wb, ws, "Auditoría");

  const wbout = write(wb, { type: "base64", bookType: "xlsx" });
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreFiltro =
    filtro === "todos" ? "completo" : filtro === "faltantes" ? "faltantes" : "sobrantes";
  const fileName = `auditoria_${nombreFiltro}_${fecha}.xlsx`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(filePath, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: `Exportar ${nombreAuditoria}`,
      UTI: "com.microsoft.excel.xlsx",
    });
  }
}
