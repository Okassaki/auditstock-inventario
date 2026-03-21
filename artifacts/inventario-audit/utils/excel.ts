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

/** Lee un archivo como base64 compatible con web y nativo */
async function leerArchivoBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    // En web la URI es un blob:// o data URL — usamos fetch + FileReader
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Quitar el prefijo "data:...;base64,"
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    return FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
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
    const base64 = await leerArchivoBase64(uri);
    const workbook = read(base64, { type: "base64" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // header:1 → array de arrays (filas crudas por posición)
    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (rows.length === 0) {
      errores.push("El archivo está vacío.");
      return { productos, errores };
    }

    // Detectar si la primera fila es encabezado (no numérica en columna C)
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

      // Columnas por posición: A=0, B=1, C=2, D=3
      const codigo = String(row[0] ?? "").trim();
      const nombre = String(row[1] ?? "").trim();
      const stockRaw = row[2];
      const imei = String(row[3] ?? "").trim();

      // Saltar filas completamente vacías
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
    // En web: descarga directa por el navegador
    const wbout = write(wb, { type: "array", bookType: "xlsx" });
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
    // En nativo: escribir y compartir
    const wbout = write(wb, { type: "base64", bookType: "xlsx" });
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
}
