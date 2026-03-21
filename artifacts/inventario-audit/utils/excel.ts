import * as FileSystem from "expo-file-system";
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

/**
 * Convierte una cadena base64 a Uint8Array sin usar Buffer.
 * Compatible con Hermes (motor JS de Android en APK nativo).
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convierte un Uint8Array a cadena base64 sin usar Buffer.
 * Procesa en chunks para evitar stack overflow con archivos grandes.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Lee un archivo como Uint8Array compatible con web y nativo */
async function leerArchivoComoArray(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as FileSystem.EncodingType,
    });
    return base64ToUint8Array(base64);
  }
}

/**
 * Parsea un archivo Excel con formato posicional:
 * Columna A = Código | B = Nombre | C = Stock Sistema | D = IMEI (opcional)
 * La primera fila puede ser encabezado o datos — se detecta automáticamente.
 */
export async function parsearExcel(uri: string): Promise<{
  productos: ExcelProducto[];
  errores: string[];
}> {
  const errores: string[] = [];
  const productos: ExcelProducto[] = [];

  try {
    const uint8Array = await leerArchivoComoArray(uri);
    const workbook = read(uint8Array, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (rows.length === 0) {
      errores.push("El archivo está vacío.");
      return { productos, errores };
    }

    const primeraFila = rows[0] as unknown[];
    const primeraColC = String(primeraFila[2] ?? "").trim().toLowerCase();
    const tieneEncabezado =
      isNaN(Number(primeraColC)) ||
      primeraColC === "" ||
      primeraColC.includes("stock") ||
      primeraColC.includes("sistema") ||
      primeraColC.includes("cantidad");

    const filaInicio = tieneEncabezado ? 1 : 0;

    for (let i = filaInicio; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const rowNum = i + 1;

      const codigo = String(row[0] ?? "").trim();
      const nombre = String(row[1] ?? "").trim();
      const stockRaw = row[2];
      const imei = String(row[3] ?? "").trim();

      if (!codigo && !nombre && !stockRaw) continue;

      if (!codigo) {
        errores.push(`Fila ${rowNum}: Código vacío (omitida)`);
        continue;
      }

      const stock = Number(String(stockRaw).replace(/[^0-9.-]/g, ""));
      if (stockRaw !== "" && isNaN(stock)) {
        errores.push(`Fila ${rowNum}: Stock inválido "${stockRaw}" para ${codigo}`);
        continue;
      }

      productos.push({
        codigo,
        nombre: nombre || codigo,
        stock_sistema: Math.max(0, isNaN(stock) ? 0 : Math.round(stock)),
        imeis_sistema: imei || undefined,
      });
    }

    if (productos.length === 0 && errores.length === 0) {
      errores.push("No se encontraron productos válidos en el archivo.");
    }
  } catch (err) {
    errores.push(`Error leyendo archivo: ${err}`);
  }

  return { productos, errores };
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
    const wbout = write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const blob = new Blob([wbout], {
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
    const wbout = write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const base64 = uint8ArrayToBase64(wbout);
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, base64, {
      encoding: "base64" as FileSystem.EncodingType,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
