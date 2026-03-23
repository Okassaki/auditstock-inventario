import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
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

// ---- AsyncStorage-based store (web + fallback) ----
const AUDITORIAS_KEY = "auditstock_auditorias";
const PRODUCTOS_KEY = "auditstock_productos";

let nextAudId = 1;
let nextProdId = 1;

async function loadStore() {
  try {
    const [audsRaw, prodsRaw] = await Promise.all([
      AsyncStorage.getItem(AUDITORIAS_KEY),
      AsyncStorage.getItem(PRODUCTOS_KEY),
    ]);
    const auds: Auditoria[] = audsRaw ? JSON.parse(audsRaw) : [];
    const prods: ProductoInventario[] = prodsRaw ? JSON.parse(prodsRaw) : [];
    if (auds.length > 0) nextAudId = Math.max(...auds.map((a) => a.id)) + 1;
    if (prods.length > 0) nextProdId = Math.max(...prods.map((p) => p.id)) + 1;
    return { auds, prods };
  } catch {
    return { auds: [], prods: [] };
  }
}

async function saveAuditorias(auds: Auditoria[]) {
  await AsyncStorage.setItem(AUDITORIAS_KEY, JSON.stringify(auds));
}

async function saveProductos(prods: ProductoInventario[]) {
  await AsyncStorage.setItem(PRODUCTOS_KEY, JSON.stringify(prods));
}

// ---- SQLite-based store (native) ----
async function getSQLiteModule() {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("expo-sqlite");
    return mod;
  } catch {
    return null;
  }
}

interface DBContextValue {
  auditoriaActual: Auditoria | null;
  productos: ProductoInventario[];
  inconsistencias: Inconsistencia[];
  isLoading: boolean;
  crearAuditoria: (nombre: string) => Promise<number>;
  cargarAuditorias: () => Promise<Auditoria[]>;
  cargarAuditoria: (id: number) => Promise<void>;
  importarProductos: (
    productos: Omit<ProductoInventario, "id" | "stock_fisico" | "auditoria_id" | "imeis_fisicos" | "inconsistencias">[],
    auditoriaId: number,
    omitirDuplicados?: boolean
  ) => Promise<{ insertados: number; duplicados: number; errores: string[] }>;
  verificarCodigosExistentes: (codigos: string[], auditoriaId: number) => Promise<string[]>;
  actualizarConteo: (
    productoId: number,
    stockFisico: number,
    imeisFisicos?: string[]
  ) => Promise<void>;
  eliminarAuditoria: (id: number) => Promise<void>;
  limpiarAuditoriaActual: () => void;
  detectarInconsistencias: () => Inconsistencia[];
  refreshProductos: () => Promise<void>;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [auditoriaActual, setAuditoriaActual] = useState<Auditoria | null>(null);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // For native SQLite
  const dbRef = useRef<any>(null);
  // For web AsyncStorage store
  const storeRef = useRef<{ auds: Auditoria[]; prods: ProductoInventario[] }>({
    auds: [],
    prods: [],
  });

  const isWeb = Platform.OS === "web";

  useEffect(() => {
    initDB();
  }, []);

  async function initDB() {
    try {
      if (isWeb) {
        const { auds, prods } = await loadStore();
        storeRef.current = { auds, prods };
      } else {
        const SQLite = await getSQLiteModule();
        if (SQLite) {
          const database = await SQLite.openDatabaseAsync("inventario_audit.db");
          dbRef.current = database;
          await database.execAsync(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
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
        } else {
          // Fallback to AsyncStorage on native if SQLite fails
          const { auds, prods } = await loadStore();
          storeRef.current = { auds, prods };
        }
      }
    } catch (err) {
      console.error("Error inicializando DB:", err);
      // Fallback
      const { auds, prods } = await loadStore();
      storeRef.current = { auds, prods };
    } finally {
      setIsLoading(false);
    }
  }

  // --- AsyncStorage helpers ---
  const asGetAuditorias = useCallback((): Auditoria[] => {
    return [...storeRef.current.auds].sort(
      (a, b) => new Date(b.fecha_modificacion).getTime() - new Date(a.fecha_modificacion).getTime()
    );
  }, []);

  const asGetProductosByAuditoria = useCallback((audId: number): ProductoInventario[] => {
    return storeRef.current.prods
      .filter((p) => p.auditoria_id === audId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, []);

  // --- Public methods ---
  const cargarAuditorias = useCallback(async (): Promise<Auditoria[]> => {
    if (!dbRef.current) return asGetAuditorias();
    try {
      return await dbRef.current.getAllAsync("SELECT * FROM auditorias ORDER BY fecha_modificacion DESC");
    } catch {
      return asGetAuditorias();
    }
  }, [asGetAuditorias]);

  const cargarAuditoria = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      if (dbRef.current) {
        const aud = await dbRef.current.getFirstAsync("SELECT * FROM auditorias WHERE id = ?", [id]);
        if (aud) {
          setAuditoriaActual(aud as Auditoria);
          const prods = await dbRef.current.getAllAsync(
            "SELECT * FROM productos WHERE auditoria_id = ? ORDER BY nombre ASC",
            [id]
          );
          setProductos(prods as ProductoInventario[]);
        }
      } else {
        const aud = storeRef.current.auds.find((a) => a.id === id);
        if (aud) {
          setAuditoriaActual(aud);
          setProductos(asGetProductosByAuditoria(id));
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [asGetProductosByAuditoria]);

  const refreshProductos = useCallback(async () => {
    if (!auditoriaActual) return;
    let prods: ProductoInventario[];
    if (dbRef.current) {
      prods = await dbRef.current.getAllAsync(
        "SELECT * FROM productos WHERE auditoria_id = ? ORDER BY nombre ASC",
        [auditoriaActual.id]
      );
      const contados = prods.filter((p) => p.stock_fisico !== null).length;
      await dbRef.current.runAsync(
        "UPDATE auditorias SET total_productos = ?, total_contados = ?, fecha_modificacion = ? WHERE id = ?",
        [prods.length, contados, new Date().toISOString(), auditoriaActual.id]
      );
      setAuditoriaActual((prev) =>
        prev ? { ...prev, total_productos: prods.length, total_contados: contados } : null
      );
    } else {
      prods = asGetProductosByAuditoria(auditoriaActual.id);
      const contados = prods.filter((p) => p.stock_fisico !== null).length;
      storeRef.current.auds = storeRef.current.auds.map((a) =>
        a.id === auditoriaActual.id
          ? { ...a, total_productos: prods.length, total_contados: contados, fecha_modificacion: new Date().toISOString() }
          : a
      );
      await saveAuditorias(storeRef.current.auds);
      setAuditoriaActual((prev) =>
        prev ? { ...prev, total_productos: prods.length, total_contados: contados } : null
      );
    }
    setProductos(prods);
  }, [auditoriaActual, asGetProductosByAuditoria]);

  const crearAuditoria = useCallback(async (nombre: string): Promise<number> => {
    const now = new Date().toISOString();
    if (dbRef.current) {
      const result = await dbRef.current.runAsync(
        "INSERT INTO auditorias (nombre, fecha_creacion, fecha_modificacion, estado) VALUES (?, ?, ?, 'activa')",
        [nombre, now, now]
      );
      return result.lastInsertRowId;
    } else {
      const id = nextAudId++;
      const aud: Auditoria = {
        id,
        nombre,
        fecha_creacion: now,
        fecha_modificacion: now,
        estado: "activa",
        total_productos: 0,
        total_contados: 0,
      };
      storeRef.current.auds.push(aud);
      await saveAuditorias(storeRef.current.auds);
      return id;
    }
  }, []);

  const importarProductos = useCallback(
    async (
      productosNuevos: Omit<ProductoInventario, "id" | "stock_fisico" | "auditoria_id" | "imeis_fisicos" | "inconsistencias">[],
      auditoriaId: number,
      omitirDuplicados: boolean = true
    ) => {
      let insertados = 0;
      let duplicados = 0;
      const errores: string[] = [];
      const imeiGlobal = new Map<string, string>();

      if (dbRef.current) {
        for (const prod of productosNuevos) {
          try {
            const existe = await dbRef.current.getFirstAsync(
              "SELECT id FROM productos WHERE codigo = ? AND auditoria_id = ?",
              [prod.codigo, auditoriaId]
            ) as { id: number } | null;

            if (existe) {
              if (omitirDuplicados) { duplicados++; continue; }
              await dbRef.current.runAsync(
                "UPDATE productos SET nombre = ?, stock_sistema = ?, imeis_sistema = ? WHERE id = ?",
                [prod.nombre, prod.stock_sistema, prod.imeis_sistema ?? null, existe.id]
              );
              insertados++;
              continue;
            }

            if (prod.imeis_sistema) {
              const imeis = prod.imeis_sistema.split(",").map((i: string) => i.trim()).filter(Boolean);
              for (const imei of imeis) {
                if (imeiGlobal.has(imei)) {
                  errores.push(`IMEI duplicado: ${imei} en ${prod.codigo} y ${imeiGlobal.get(imei)}`);
                } else { imeiGlobal.set(imei, prod.codigo); }
              }
            }

            await dbRef.current.runAsync(
              "INSERT INTO productos (codigo, nombre, stock_sistema, imeis_sistema, auditoria_id) VALUES (?, ?, ?, ?, ?)",
              [prod.codigo, prod.nombre, prod.stock_sistema, prod.imeis_sistema ?? null, auditoriaId]
            );
            insertados++;
          } catch (e) {
            errores.push(`Error en ${prod.codigo}: ${e}`);
          }
        }
        const cntRow = await dbRef.current.getFirstAsync(
          "SELECT COUNT(*) as cnt FROM productos WHERE auditoria_id = ?",
          [auditoriaId]
        ) as { cnt: number } | null;
        await dbRef.current.runAsync(
          "UPDATE auditorias SET total_productos = ?, fecha_modificacion = ? WHERE id = ?",
          [cntRow?.cnt ?? insertados, new Date().toISOString(), auditoriaId]
        );
      } else {
        const existingCodes = new Set(
          storeRef.current.prods.filter((p) => p.auditoria_id === auditoriaId).map((p) => p.codigo)
        );
        const newProds: ProductoInventario[] = [];
        for (const prod of productosNuevos) {
          if (existingCodes.has(prod.codigo)) {
            if (omitirDuplicados) { duplicados++; continue; }
            const idx = storeRef.current.prods.findIndex(
              (p) => p.codigo === prod.codigo && p.auditoria_id === auditoriaId
            );
            if (idx !== -1) {
              storeRef.current.prods[idx] = {
                ...storeRef.current.prods[idx],
                nombre: prod.nombre,
                stock_sistema: prod.stock_sistema,
                imeis_sistema: prod.imeis_sistema ?? null,
              };
            }
            insertados++;
            continue;
          }
          if (prod.imeis_sistema) {
            const imeis = prod.imeis_sistema.split(",").map((i) => i.trim()).filter(Boolean);
            for (const imei of imeis) {
              if (imeiGlobal.has(imei)) {
                errores.push(`IMEI duplicado: ${imei}`);
              } else { imeiGlobal.set(imei, prod.codigo); }
            }
          }
          newProds.push({
            id: nextProdId++,
            codigo: prod.codigo,
            nombre: prod.nombre,
            stock_sistema: prod.stock_sistema,
            stock_fisico: null,
            imeis_sistema: prod.imeis_sistema ?? null,
            imeis_fisicos: null,
            auditoria_id: auditoriaId,
            inconsistencias: null,
          });
          existingCodes.add(prod.codigo);
          insertados++;
        }
        storeRef.current.prods.push(...newProds);
        const totalReal = storeRef.current.prods.filter((p) => p.auditoria_id === auditoriaId).length;
        storeRef.current.auds = storeRef.current.auds.map((a) =>
          a.id === auditoriaId
            ? { ...a, total_productos: totalReal, fecha_modificacion: new Date().toISOString() }
            : a
        );
        await Promise.all([
          saveProductos(storeRef.current.prods),
          saveAuditorias(storeRef.current.auds),
        ]);
      }

      return { insertados, duplicados, errores };
    },
    []
  );

  const verificarCodigosExistentes = useCallback(
    async (codigos: string[], auditoriaId: number): Promise<string[]> => {
      const existentes: string[] = [];
      if (dbRef.current) {
        for (const codigo of codigos) {
          const existe = await dbRef.current.getFirstAsync(
            "SELECT id FROM productos WHERE codigo = ? AND auditoria_id = ?",
            [codigo, auditoriaId]
          );
          if (existe) existentes.push(codigo);
        }
      } else {
        const existingCodes = new Set(
          storeRef.current.prods
            .filter((p) => p.auditoria_id === auditoriaId)
            .map((p) => p.codigo)
        );
        for (const codigo of codigos) {
          if (existingCodes.has(codigo)) existentes.push(codigo);
        }
      }
      return existentes;
    },
    []
  );

  const actualizarConteo = useCallback(
    async (productoId: number, stockFisico: number, imeisFisicos?: string[]) => {
      if (stockFisico < 0) throw new Error("El stock físico no puede ser negativo");
      const imeisFisicosStr = imeisFisicos && imeisFisicos.length > 0 ? imeisFisicos.join(",") : null;

      if (dbRef.current) {
        await dbRef.current.runAsync(
          "UPDATE productos SET stock_fisico = ?, imeis_fisicos = ? WHERE id = ?",
          [stockFisico, imeisFisicosStr, productoId]
        );
      } else {
        storeRef.current.prods = storeRef.current.prods.map((p) =>
          p.id === productoId ? { ...p, stock_fisico: stockFisico, imeis_fisicos: imeisFisicosStr } : p
        );
        await saveProductos(storeRef.current.prods);
      }
      await refreshProductos();
    },
    [refreshProductos]
  );

  // Solo hace la operación de datos — sin tocar estado React
  const eliminarAuditoria = useCallback(async (id: number) => {
    if (dbRef.current) {
      await dbRef.current.runAsync(
        "DELETE FROM productos WHERE auditoria_id = ?",
        [id]
      );
      await dbRef.current.runAsync(
        "DELETE FROM auditorias WHERE id = ?",
        [id]
      );
    } else {
      storeRef.current.auds = storeRef.current.auds.filter((a) => a.id !== id);
      storeRef.current.prods = storeRef.current.prods.filter((p) => p.auditoria_id !== id);
      await saveAuditorias(storeRef.current.auds);
      await saveProductos(storeRef.current.prods);
    }
  }, []);

  // Limpia el estado React cuando se elimina la auditoría activa
  const limpiarAuditoriaActual = useCallback(() => {
    setAuditoriaActual(null);
    setProductos([]);
    setInconsistencias([]);
  }, []);

  const detectarInconsistencias = useCallback((): Inconsistencia[] => {
    const result: Inconsistencia[] = [];
    const imeiMap = new Map<string, ProductoInventario[]>();

    for (const prod of productos) {
      if (prod.stock_fisico !== null && prod.stock_fisico < 0) {
        result.push({ tipo: "Negativo", descripcion: `Stock físico negativo: ${prod.stock_fisico}`, codigo: prod.codigo, nombre: prod.nombre });
      }
      if (prod.stock_sistema < 0) {
        result.push({ tipo: "Sistema Negativo", descripcion: `Stock en sistema negativo: ${prod.stock_sistema}`, codigo: prod.codigo, nombre: prod.nombre });
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
    if (productos.length > 0) detectarInconsistencias();
  }, [productos]);

  return (
    <DBContext.Provider
      value={{
        auditoriaActual,
        productos,
        inconsistencias,
        isLoading,
        crearAuditoria,
        cargarAuditorias,
        cargarAuditoria,
        importarProductos,
        verificarCodigosExistentes,
        actualizarConteo,
        eliminarAuditoria,
        limpiarAuditoriaActual,
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
