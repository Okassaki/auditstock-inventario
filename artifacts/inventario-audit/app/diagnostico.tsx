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
        try {
          const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
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
            const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
            let conCodigo = 0;
            for (let i = 1; i < rows.length; i++) {
              const r = rows[i] as unknown[];
              if (String(r[0] ?? "").trim()) conCodigo++;
            }
            txt += "--- Hoja: " + name + " ---\n";
            txt += "Ref: " + ref + "\n";
            txt += "Filas según ref: " + nrows + "\n";
            txt += "Filas leídas: " + rows.length + "\n";
            txt += "Columnas: " + ncols + "\n";
            txt += "Filas con código (col A): " + conCodigo + "\n\n";
            txt += "ENCABEZADO:\n" + JSON.stringify(rows[0]) + "\n\n";
            txt += "PRIMERAS 5 FILAS DE DATOS:\n";
            for (let i = 1; i <= 5 && i < rows.length; i++) {
              txt += "F" + i + ": " + JSON.stringify(rows[i]) + "\n";
            }
            txt += "\nÚLTIMAS 3 FILAS:\n";
            for (let i = Math.max(6, rows.length - 3); i < rows.length; i++) {
              txt += "F" + i + ": " + JSON.stringify(rows[i]) + "\n";
            }
            txt += "================\n\n";
          });
          setResultado(txt);
        } catch (err) {
          setResultado("ERROR: " + String(err));
        } finally {
          setCargando(false);
        }
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
