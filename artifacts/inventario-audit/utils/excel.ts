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
 * Parsea un archivo Excel con formato posicional.
 * - Lee TODAS las hojas del libro.
 * - Detecta automáticamente múltiples productos por fila usando las dimensiones reales del sheet.
 * - Stride (columnas por grupo): 3 sin IMEI, 4 con IMEI.
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

    diagLines.push(`Hojas: ${workbook.SheetNames.join(", ")}`);

    if (workbook.SheetNames.length === 0) {
      errores.push("El archivo no contiene hojas.");
      return { productos, errores };
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRef = sheet["!ref"];
      if (!sheetRef) continue;

      // Dimensiones reales de la hoja
      const sheetRange = utils.decode_range(sheetRef);
      const ncols = sheetRange.e.c + 1; // cantidad de columnas reales
      const nrows = sheetRange.e.r + 1; // cantidad de filas reales

      const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      if (rows.length === 0) continue;

      diagLines.push(`Hoja "${sheetName}": ${nrows} filas, ${ncols} columnas`);

      // Detectar encabezado en columna C (índice 2)
      const primeraFila = rows[0] as unknown[];
      const primeraColC = String(primeraFila[2] ?? "").trim().toLowerCase();
      const tieneEncabezado =
        isNaN(Number(primeraColC)) ||
        primeraColC === "" ||
        primeraColC.includes("stock") ||
        primeraColC.includes("sistema") ||
        primeraColC.includes("cantidad");

      const filaInicio = tieneEncabezado ? 1 : 0;

      // ── Detectar stride ─────────────────────────────────────────────────────
      // Usamos ncols (de !ref) como señal primaria, y validamos contra los datos.
      // stride 0 = un producto por fila; stride 3 o 4 = varios por fila.
      let stride = 0;

      if (ncols >= 5) {
        // Candidatos: 3 (sin IMEI) y 4 (con IMEI)
        const candidatos = [3, 4];
        for (const s of candidatos) {
          let hits = 0;
          const limit = Math.min(filaInicio + 20, rows.length);
          for (let r = filaInicio; r < limit; r++) {
            const row = rows[r] as unknown[];
            // Accedemos por índice numérico, independiente de row.length
            const potCode  = String(row[s]     ?? "").trim();
            const potStock = String(row[s + 2] ?? "").trim();
            if (potCode && potStock) {
              const n = Number(potStock.replace(/[^0-9.-]/g, ""));
              if (!isNaN(n)) hits++;
            }
          }
          // Si más de la mitad de las filas revisadas tienen producto en este offset → es el stride
          if (hits > 0 && hits >= Math.ceil((limit - filaInicio) / 2)) {
            stride = s;
            break;
          }
        }
      }
      diagLines.push(`Stride detectado: ${stride === 0 ? "ninguno (1 producto/fila)" : `${stride} columnas/producto`}`);
      // ────────────────────────────────────────────────────────────────────────

      for (let i = filaInicio; i < rows.length; i++) {
        const row = rows[i] as unknown[];
        const rowNum = i + 1;

        // Construir offsets usando ncols (más confiable que row.length)
        const colMax = Math.max(ncols, row.length);
        const offsets: number[] = [0];
        if (stride > 0) {
          for (let off = stride; off < colMax; off += stride) {
            offsets.push(off);
          }
        }

        for (const offset of offsets) {
          const codigo   = String(row[offset]     ?? "").trim();
          const nombre   = String(row[offset + 1] ?? "").trim();
          const stockRaw = row[offset + 2];

          // IMEI: presente en la 4.ª columna del grupo (solo si stride >= 4),
          // o en columna D cuando es producto único (stride 0).
          const imei =
            stride >= 4
              ? String(row[offset + 3] ?? "").trim()
              : stride === 0
              ? String(row[3] ?? "").trim()
              : "";

          if (!codigo && !nombre && !stockRaw) continue;

          if (!codigo) {
            errores.push(`Hoja "${sheetName}" fila ${rowNum}: Código vacío (omitida)`);
            continue;
          }

          const stock = Number(String(stockRaw ?? "").replace(/[^0-9.-]/g, ""));
          if (stockRaw !== "" && stockRaw !== undefined && isNaN(stock)) {
            errores.push(`Hoja "${sheetName}" fila ${rowNum}: Stock inválido "${stockRaw}" para ${codigo}`);
            continue;
          }

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
