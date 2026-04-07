import { Router, type IRouter } from "express";
import { db, productosTable, stockTiendasTable, movimientosStockTable, tiendasTable, insertProductoSchema } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.get("/productos", async (_req, res) => {
  try {
    const productos = await db.select().from(productosTable).orderBy(productosTable.nombre);
    res.json(productos);
  } catch {
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

router.get("/productos/:codigo", async (req, res) => {
  try {
    const [p] = await db.select().from(productosTable).where(eq(productosTable.codigo, req.params.codigo)).limit(1);
    if (!p) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    res.json(p);
  } catch {
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

router.post("/productos", async (req, res) => {
  try {
    const body = insertProductoSchema.parse(req.body);
    const existing = await db.select().from(productosTable).where(eq(productosTable.codigo, body.codigo)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Ya existe un producto con ese código" }); return; }
    const [p] = await db.insert(productosTable).values(body).returning();
    res.status(201).json(p);
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos", detalles: err.issues }); return; }
    res.status(500).json({ error: "Error al crear producto" });
  }
});

const updateProductoSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  precio: z.string().optional(),
  stockMinimo: z.number().int().min(0).optional(),
});

router.put("/productos/:codigo", async (req, res) => {
  try {
    const [p] = await db.select().from(productosTable).where(eq(productosTable.codigo, req.params.codigo)).limit(1);
    if (!p) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    const body = updateProductoSchema.parse(req.body);
    const [updated] = await db.update(productosTable)
      .set({ ...body, actualizadoAt: new Date() })
      .where(eq(productosTable.codigo, req.params.codigo))
      .returning();
    res.json(updated);
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos" }); return; }
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

router.delete("/productos/:codigo", async (req, res) => {
  try {
    const [p] = await db.select().from(productosTable).where(eq(productosTable.codigo, req.params.codigo)).limit(1);
    if (!p) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    await db.delete(productosTable).where(eq(productosTable.codigo, req.params.codigo));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar producto" });
  }
});

router.get("/tiendas/:codigo/stock", async (req, res) => {
  try {
    const stocks = await db
      .select({
        producto: productosTable,
        stockActual: stockTiendasTable.stockActual,
        actualizadoAt: stockTiendasTable.actualizadoAt,
      })
      .from(productosTable)
      .leftJoin(
        stockTiendasTable,
        and(
          eq(stockTiendasTable.productoCodigo, productosTable.codigo),
          eq(stockTiendasTable.tiendaCodigo, req.params.codigo)
        )
      )
      .orderBy(productosTable.nombre);
    res.json(stocks.map((s) => ({
      ...s.producto,
      stockActual: s.stockActual ?? 0,
      actualizadoAt: s.actualizadoAt ?? null,
    })));
  } catch {
    res.status(500).json({ error: "Error al obtener stock" });
  }
});

const movimientoSchema = z.object({
  productoCodigo: z.string().min(1),
  tipo: z.enum(["entrada", "salida", "ajuste"]),
  cantidad: z.number().int(),
  motivo: z.string().optional(),
});

router.post("/tiendas/:codigo/stock", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const body = movimientoSchema.parse(req.body);
    const [producto] = await db.select().from(productosTable).where(eq(productosTable.codigo, body.productoCodigo)).limit(1);
    if (!producto) { res.status(404).json({ error: "Producto no encontrado" }); return; }

    const [stockRow] = await db.select().from(stockTiendasTable)
      .where(and(eq(stockTiendasTable.tiendaCodigo, req.params.codigo), eq(stockTiendasTable.productoCodigo, body.productoCodigo)))
      .limit(1);

    const stockActual = stockRow?.stockActual ?? 0;
    let nuevoStock: number;
    if (body.tipo === "ajuste") {
      nuevoStock = body.cantidad;
    } else if (body.tipo === "entrada") {
      nuevoStock = stockActual + body.cantidad;
    } else {
      nuevoStock = Math.max(0, stockActual - body.cantidad);
    }

    if (stockRow) {
      await db.update(stockTiendasTable)
        .set({ stockActual: nuevoStock, actualizadoAt: new Date() })
        .where(and(eq(stockTiendasTable.tiendaCodigo, req.params.codigo), eq(stockTiendasTable.productoCodigo, body.productoCodigo)));
    } else {
      await db.insert(stockTiendasTable).values({
        tiendaCodigo: req.params.codigo,
        productoCodigo: body.productoCodigo,
        stockActual: nuevoStock,
      });
    }

    await db.insert(movimientosStockTable).values({
      tiendaCodigo: req.params.codigo,
      productoCodigo: body.productoCodigo,
      tipo: body.tipo,
      cantidad: body.tipo === "ajuste" ? nuevoStock - stockActual : body.cantidad,
      motivo: body.motivo ?? null,
    });

    res.json({ ok: true, stockActual: nuevoStock });
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos" }); return; }
    res.status(500).json({ error: "Error al registrar movimiento" });
  }
});

router.get("/tiendas/:codigo/stock/movimientos", async (req, res) => {
  try {
    const movimientos = await db.select().from(movimientosStockTable)
      .where(eq(movimientosStockTable.tiendaCodigo, req.params.codigo))
      .orderBy(desc(movimientosStockTable.creadoAt))
      .limit(100);
    res.json(movimientos);
  } catch {
    res.status(500).json({ error: "Error al obtener movimientos" });
  }
});

export default router;
