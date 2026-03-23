import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { utils, read } from "xlsx";

export default function DiagnosticoScreen() {
  const [resultado, setResultado] = useState<string>("Selecciona el archivo Excel para analizarlo.");
  const [cargando, setCargando] = useState(false);

  const analizarArchivo = () => {
    if (Platform.OS !== "web") {
      setResultado("Esta herramienta solo funciona en el navegador web.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setCargando(true);
      setResultado("Leyendo " + file.name + "...");
      const reader = new FileReader();
      reader.onload = (e) => {
        const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
        // Mostrar tamaño inmediatamente
        setResultado("Archivo leído: " + bytes.length + " bytes\nParsing Excel (puede tardar unos segundos)...");
        // Dar tiempo al UI para renderizar antes del parsing CPU-intensivo
        setTimeout(() => {
          try {
            const wb = read(bytes, { type: "array" });
            let txt = "=== ARCHIVO ===\n";
            txt += "Nombre: " + file.name + "\n";
            txt += "Tamaño: " + file.size + " bytes\n";
            txt += "Hojas: " + wb.SheetNames.join(", ") + "\n\n";
            wb.SheetNames.forEach((name) => {
              const ws = wb.Sheets[name];
              const ref = ws["!ref"] ?? "(vacía)";
              const range = utils.decode_range(ref);
              const nrows = range.e.r + 1;
              const ncols = range.e.c + 1;
              const getCell = (r: number, c: number) => {
                const cell = ws[utils.encode_cell({ r, c })];
                return cell ? String(cell.v ?? "") : "";
              };
              let conCodigo = 0;
              for (let r = 1; r <= range.e.r; r++) {
                if (getCell(r, 0).trim()) conCodigo++;
              }
              txt += "--- Hoja: " + name + " ---\n";
              txt += "Ref: " + ref + "\n";
              txt += "Filas en ref: " + nrows + "\n";
              txt += "Columnas: " + ncols + "\n";
              txt += "Filas CON CÓDIGO (col A): " + conCodigo + "\n\n";
              txt += "FILA 1 (encabezado?):\n";
              const h = [];
              for (let c = 0; c < ncols; c++) h.push(getCell(0, c));
              txt += JSON.stringify(h) + "\n\n";
              txt += "FILAS 2-6 (primeros datos):\n";
              for (let r = 1; r <= 5 && r <= range.e.r; r++) {
                const row = [];
                for (let c = 0; c < Math.min(ncols, 5); c++) row.push(getCell(r, c));
                txt += "F" + (r + 1) + ": " + JSON.stringify(row) + "\n";
              }
              txt += "\nFILAS FINALES:\n";
              for (let r = Math.max(1, range.e.r - 2); r <= range.e.r; r++) {
                const row = [];
                for (let c = 0; c < Math.min(ncols, 5); c++) row.push(getCell(r, c));
                txt += "F" + (r + 1) + ": " + JSON.stringify(row) + "\n";
              }
              txt += "================\n\n";
            });
            setResultado(txt);
          } catch (err) {
            setResultado("ERROR: " + String(err));
          } finally {
            setCargando(false);
          }
        }, 100);
      };
      reader.onerror = () => {
        setResultado("Error leyendo el archivo: " + reader.error?.message);
        setCargando(false);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Diagnóstico Excel</Text>
      <Text style={styles.desc}>Selecciona el mismo archivo Excel que usas para importar:</Text>
      <Pressable style={[styles.btn, cargando && styles.btnDis]} onPress={analizarArchivo} disabled={cargando}>
        <Text style={styles.btnTxt}>{cargando ? "Analizando..." : "📂 Seleccionar archivo"}</Text>
      </Pressable>
      <ScrollView style={styles.scroll}>
        <Text style={styles.output} selectable>{resultado}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 20 },
  titulo: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  desc: { fontSize: 14, color: "#aaa", marginBottom: 16 },
  btn: { backgroundColor: "#2563eb", padding: 16, borderRadius: 10, alignItems: "center", marginBottom: 16 },
  btnDis: { backgroundColor: "#555" },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "600" },
  scroll: { flex: 1 },
  output: { fontFamily: "monospace", fontSize: 12, color: "#0f0", lineHeight: 18 },
});
