import * as SQLite from "expo-sqlite";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ProductoInventario {
  id: number;
  codigo: string;
  nombre: string;
  stock_sistema: number;
  stock_fisico: number | null;
  imeis_sistema: string | null;
  imeis_fisicos: string | null;
  auditoria_id: number;
  inconsistencias: string | null;
}

export interface Auditoria {
  id: number;
  nombre: string;
  fecha_creacion: string;
  fecha_modificacion: string;
  estado: "activa" | "completada";
  total_productos: number;
  total_contados: number;
}

export interface Inconsistencia {
  tipo: string;
  descripcion: string;
  codigo: string;
  nombre: string;
}

export type EstadoProducto = "correcto" | "sobrante" | "faltante" | "sin_contar";

export function getEstadoProducto(p: ProductoInventario): EstadoProducto {
  if (p.stock_fisico === null) return "sin_contar";
  const diff = p.stock_fisico - p.stock_sistema;
  if (diff === 0) return "correcto";
  if (diff > 0) return "sobrante";
  return "faltante";
}

export function getDiferencia(p: ProductoInventario): number {
  if (p.stock_fisico === null) return 0;
  return p.stock_fisico - p.stock_sistema;
}

interface DBContextValue {
  db: SQLite.SQLiteDatabase | null;
  auditoriaActual: Auditoria | null;
  productos: ProductoInventario[];
  inconsistencias: Inconsistencia[];
  isLoading: boolean;
  crearAuditoria: (nombre: string) => Promise<number>;
  cargarAuditorias: () => Promise<Auditoria[]>;
  cargarAuditoria: (id: number) => Promise<void>;
  importarProductos: (
    productos: Omit<ProductoInventario, "id" | "stock_fisico" | "auditoria_id" | "imeis_fisicos" | "inconsistencias">[],
    auditoriaId: number
  ) => Promise<{ insertados: number; duplicados: number; errores: string[] }>;
  actualizarConteo: (
    productoId: number,
    stockFisico: number,
    imeisFisicos?: string[]
  ) => Promise<void>;
  eliminarAuditoria: (id: number) => Promise<void>;
  detectarInconsistencias: () => Inconsistencia[];
  refreshProductos: () => Promise<void>;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [auditoriaActual, setAuditoriaActual] = useState<Auditoria | null>(null);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dbRef = useRef<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    initDB();
  }, []);

  async function initDB() {
    try {
      const database = await SQLite.openDatabaseAsync("inventario_audit.db");
      dbRef.current = database;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS auditorias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          fecha_creacion TEXT NOT NULL,
          fecha_modificacion TEXT NOT NULL,
          estado TEXT DEFAULT 'activa',
          total_productos INTEGER DEFAULT 0,
          total_contados INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS productos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT NOT NULL,
          nombre TEXT NOT NULL,
          stock_sistema INTEGER NOT NULL DEFAULT 0,
          stock_fisico INTEGER,
          imeis_sistema TEXT,
          imeis_fisicos TEXT,
          auditoria_id INTEGER NOT NULL,
          inconsistencias TEXT,
          FOREIGN KEY (auditoria_id) REFERENCES auditorias(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_productos_auditoria ON productos(auditoria_id);
        CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
      `);
      setDb(database);
    } catch (err) {
      console.error("Error inicializando DB:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const cargarAuditorias = useCallback(async (): Promise<Auditoria[]> => {
    const database = dbRef.current;
    if (!database) return [];
    const rows = await database.getAllAsync<Auditoria>(
      "SELECT * FROM auditorias ORDER BY fecha_modificacion DESC"
    );
    return rows;
  }, []);

  const cargarAuditoria = useCallback(async (id: number) => {
    const database = dbRef.current;
    if (!database) return;
    setIsLoading(true);
    try {
      const aud = await database.getFirstAsync<Auditoria>(
        "SELECT * FROM auditorias WHERE id = ?",
        [id]
      );
      if (aud) {
        setAuditoriaActual(aud);
        const prods = await database.getAllAsync<ProductoInventario>(
          "SELECT * FROM productos WHERE auditoria_id = ? ORDER BY nombre ASC",
          [id]
        );
        setProductos(prods);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProductos = useCallback(async () => {
    const database = dbRef.current;
    if (!database || !auditoriaActual) return;
    const prods = await database.getAllAsync<ProductoInventario>(
      "SELECT * FROM productos WHERE auditoria_id = ? ORDER BY nombre ASC",
      [auditoriaActual.id]
    );
    setProductos(prods);

    const contados = prods.filter((p) => p.stock_fisico !== null).length;
    await database.runAsync(
      "UPDATE auditorias SET total_productos = ?, total_contados = ?, fecha_modificacion = ? WHERE id = ?",
      [prods.length, contados, new Date().toISOString(), auditoriaActual.id]
    );
    setAuditoriaActual((prev) =>
      prev
        ? { ...prev, total_productos: prods.length, total_contados: contados }
        : null
    );
  }, [auditoriaActual]);

  const crearAuditoria = useCallback(async (nombre: string): Promise<number> => {
    const database = dbRef.current;
    if (!database) throw new Error("DB no inicializada");
    const now = new Date().toISOString();
    const result = await database.runAsync(
      "INSERT INTO auditorias (nombre, fecha_creacion, fecha_modificacion, estado) VALUES (?, ?, ?, 'activa')",
      [nombre, now, now]
    );
    return result.lastInsertRowId;
  }, []);

  const importarProductos = useCallback(
    async (
      productosNuevos: Omit<ProductoInventario, "id" | "stock_fisico" | "auditoria_id" | "imeis_fisicos" | "inconsistencias">[],
      auditoriaId: number
    ) => {
      const database = dbRef.current;
      if (!database) throw new Error("DB no inicializada");

      let insertados = 0;
      let duplicados = 0;
      const errores: string[] = [];
      const imeiGlobal = new Map<string, string>();

      for (const prod of productosNuevos) {
        try {
          const existe = await database.getFirstAsync<{ id: number }>(
            "SELECT id FROM productos WHERE codigo = ? AND auditoria_id = ?",
            [prod.codigo, auditoriaId]
          );
          if (existe) {
            duplicados++;
            continue;
          }

          if (prod.imeis_sistema) {
            const imeis = prod.imeis_sistema.split(",").map((i) => i.trim()).filter(Boolean);
            for (const imei of imeis) {
              if (imeiGlobal.has(imei)) {
                errores.push(`IMEI duplicado: ${imei} en ${prod.codigo} y ${imeiGlobal.get(imei)}`);
              } else {
                imeiGlobal.set(imei, prod.codigo);
              }
            }
          }

          await database.runAsync(
            "INSERT INTO productos (codigo, nombre, stock_sistema, imeis_sistema, auditoria_id) VALUES (?, ?, ?, ?, ?)",
            [prod.codigo, prod.nombre, prod.stock_sistema, prod.imeis_sistema ?? null, auditoriaId]
          );
          insertados++;
        } catch (e) {
          errores.push(`Error en ${prod.codigo}: ${e}`);
        }
      }

      await database.runAsync(
        "UPDATE auditorias SET total_productos = ?, fecha_modificacion = ? WHERE id = ?",
        [insertados, new Date().toISOString(), auditoriaId]
      );

      return { insertados, duplicados, errores };
    },
    []
  );

  const actualizarConteo = useCallback(
    async (productoId: number, stockFisico: number, imeisFisicos?: string[]) => {
      const database = dbRef.current;
      if (!database) return;

      if (stockFisico < 0) throw new Error("El stock físico no puede ser negativo");

      const imeisFisicosStr = imeisFisicos && imeisFisicos.length > 0
        ? imeisFisicos.join(",")
        : null;

      await database.runAsync(
        "UPDATE productos SET stock_fisico = ?, imeis_fisicos = ? WHERE id = ?",
        [stockFisico, imeisFisicosStr, productoId]
      );

      await refreshProductos();
    },
    [refreshProductos]
  );

  const eliminarAuditoria = useCallback(async (id: number) => {
    const database = dbRef.current;
    if (!database) return;
    await database.runAsync("DELETE FROM auditorias WHERE id = ?", [id]);
    if (auditoriaActual?.id === id) {
      setAuditoriaActual(null);
      setProductos([]);
    }
  }, [auditoriaActual]);

  const detectarInconsistencias = useCallback((): Inconsistencia[] => {
    const result: Inconsistencia[] = [];
    const imeiMap = new Map<string, ProductoInventario[]>();

    for (const prod of productos) {
      if (prod.stock_fisico !== null && prod.stock_fisico < 0) {
        result.push({
          tipo: "Negativo",
          descripcion: `Stock físico negativo: ${prod.stock_fisico}`,
          codigo: prod.codigo,
          nombre: prod.nombre,
        });
      }

      if (prod.stock_sistema < 0) {
        result.push({
          tipo: "Sistema Negativo",
          descripcion: `Stock en sistema negativo: ${prod.stock_sistema}`,
          codigo: prod.codigo,
          nombre: prod.nombre,
        });
      }

      const imeis = [
        ...(prod.imeis_sistema?.split(",").map((i) => i.trim()).filter(Boolean) ?? []),
        ...(prod.imeis_fisicos?.split(",").map((i) => i.trim()).filter(Boolean) ?? []),
      ];
      for (const imei of imeis) {
        if (!imeiMap.has(imei)) imeiMap.set(imei, []);
        const arr = imeiMap.get(imei)!;
        if (!arr.find((p) => p.id === prod.id)) arr.push(prod);
      }
    }

    for (const [imei, prods] of imeiMap.entries()) {
      if (prods.length > 1) {
        result.push({
          tipo: "IMEI Duplicado",
          descripcion: `IMEI ${imei} aparece en múltiples productos`,
          codigo: prods.map((p) => p.codigo).join(", "),
          nombre: prods.map((p) => p.nombre).join(", "),
        });
      }
    }

    setInconsistencias(result);
    return result;
  }, [productos]);

  useEffect(() => {
    if (productos.length > 0) {
      detectarInconsistencias();
    }
  }, [productos]);

  return (
    <DBContext.Provider
      value={{
        db,
        auditoriaActual,
        productos,
        inconsistencias,
        isLoading,
        crearAuditoria,
        cargarAuditorias,
        cargarAuditoria,
        importarProductos,
        actualizarConteo,
        eliminarAuditoria,
        detectarInconsistencias,
        refreshProductos,
      }}
    >
      {children}
    </DBContext.Provider>
  );
}

export function useDatabase() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error("useDatabase must be used within DatabaseProvider");
  return ctx;
}
