import { Buffer } from "buffer";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { utils, write, read } from "xlsx";
import type { ProductoInventario } from "@/context/DatabaseContext";
import { getDiferencia, getEstadoProducto } from "@/context/DatabaseContext";

export interface ExcelProducto {
  codigo: string;
  nombre: string;
  stock_sistema: number;
  imeis_sistema?: string;
}

/** Lee un archivo como Uint8Array compatible con web y nativo */
async function leerArchivoComoArray(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    const base64 = await LegacyFS.readAsStringAsync(uri, {
      encoding: "base64" as LegacyFS.EncodingType,
    });
    // Buffer.from decodifica base64 a bytes de forma confiable
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
}

/**
 * Parsea un archivo Excel.
 * Lee TODAS las hojas, TODAS las filas y TODAS las columnas.
 * Para cada fila escanea columnas en grupos de 3 (código, nombre, stock)
 * empezando en el offset 0, luego 3, 6, etc. — soporta cualquier layout.
 */
export async function parsearExcel(uri: string): Promise<{
  productos: ExcelProducto[];
  errores: string[];
  diagnostico?: string;
}> {
  const errores: string[] = [];
  const productos: ExcelProducto[] = [];
  const diagLines: string[] = [];

  try {
    const uint8Array = await leerArchivoComoArray(uri);
    const workbook = read(uint8Array, { type: "array" });

    if (workbook.SheetNames.length === 0) {
      errores.push("El archivo no contiene hojas.");
      return { productos, errores };
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRef = sheet["!ref"];
      if (!sheetRef) continue;

      const sheetRange = utils.decode_range(sheetRef);
      const ncols = sheetRange.e.c + 1;
      const nrows = sheetRange.e.r + 1;

      // Lee TODAS las filas como arrays, celdas vacías = ""
      const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

      console.log(`[parsearExcel] Hoja "${sheetName}": ref=${sheetRef} nrows=${nrows} ncols=${ncols} rows.length=${rows.length} bytes=${uint8Array.length}`);

      diagLines.push(`Hoja "${sheetName}": ref ${sheetRef} | ${nrows} filas (ref) | ${rows.length} filas leídas | ${ncols} cols | archivo ${uint8Array.length} bytes`);

      if (rows.length === 0) continue;

      // Detectar si la primera fila es encabezado (texto en col 0 o col 2)
      const fila0 = rows[0] as unknown[];
      const col0 = String(fila0[0] ?? "").trim();
      const col2 = String(fila0[2] ?? "").trim();
      const esEncabezado = isNaN(Number(col0)) || isNaN(Number(col2));
      const inicio = esEncabezado ? 1 : 0;

      console.log(`[parsearExcel] col0="${col0}" col2="${col2}" esEncabezado=${esEncabezado} inicio=${inicio}`);

      // Calcular cuántos grupos de 3 columnas caben
      const numGrupos = Math.max(1, Math.floor(ncols / 3));

      for (let i = inicio; i < rows.length; i++) {
        const row = rows[i] as unknown[];
        const rowNum = i + 1;

        for (let g = 0; g < numGrupos; g++) {
          const offset = g * 3;
          const codigoRaw = row[offset];
          const nombreRaw = row[offset + 1];
          const stockRaw  = row[offset + 2];

          const codigo = String(codigoRaw ?? "").trim();
          const nombre = String(nombreRaw ?? "").trim();

          // Fila completamente vacía en este grupo → saltar
          if (!codigo && !nombre && (stockRaw === "" || stockRaw === undefined)) continue;

          // Sin código → omitir
          if (!codigo) {
            errores.push(`Hoja "${sheetName}" fila ${rowNum}: código vacío (omitida)`);
            continue;
          }

          // Parsear stock
          const stockStr = String(stockRaw ?? "").trim();
          const stock = stockStr === "" ? 0 : Number(stockStr.replace(/[^0-9.-]/g, ""));
          if (stockStr !== "" && isNaN(stock)) {
            errores.push(`Hoja "${sheetName}" fila ${rowNum}: stock inválido "${stockRaw}" para ${codigo}`);
            continue;
          }

          // IMEI opcional: columna 4 del grupo (índice offset+3)
          const imei = String(row[offset + 3] ?? "").trim();

          productos.push({
            codigo,
            nombre: nombre || codigo,
            stock_sistema: Math.max(0, isNaN(stock) ? 0 : Math.round(stock)),
            imeis_sistema: imei || undefined,
          });
        }
      }
    }

    if (productos.length === 0 && errores.length === 0) {
      errores.push("No se encontraron productos válidos en el archivo.");
    }
  } catch (err) {
    errores.push(`Error leyendo archivo: ${err}`);
  }

  return { productos, errores, diagnostico: diagLines.join(" | ") };
}

/** Exporta a Excel y comparte (nativo) o descarga (web) */
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

  const fecha = new Date().toISOString().slice(0, 10);
  const nombreFiltro =
    filtro === "todos" ? "completo" : filtro === "faltantes" ? "faltantes" : "sobrantes";
  const fileName = `auditoria_${nombreFiltro}_${fecha}.xlsx`;

  if (Platform.OS === "web") {
    const wbout = write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([new Uint8Array(wbout as ArrayLike<number>)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // xlsx devuelve un Array o Uint8Array según el entorno
    // Buffer.from() lo acepta en cualquier caso y produce base64 correcto
    const wbout = write(wb, { type: "array", bookType: "xlsx" });
    const base64 = Buffer.from(wbout as ArrayLike<number>).toString("base64");

    const filePath = `${LegacyFS.cacheDirectory}${fileName}`;
    await LegacyFS.writeAsStringAsync(filePath, base64, {
      encoding: "base64" as LegacyFS.EncodingType,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: `Exportar ${nombreAuditoria}`,
        UTI: "com.microsoft.excel.xlsx",
      });
    } else {
      throw new Error(
        "La función de compartir no está disponible en este dispositivo."
      );
    }
  }
}
