import { Router, type IRouter } from "express";
import { db, ventasTable, ventaItemsTable, tiendasTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ventaItemSchema = z.object({
  productoCodigo: z.string().min(1),
  productoNombre: z.string().min(1),
  cantidad: z.number().int().min(1),
  precioUnitario: z.string().or(z.number()).transform(String),
});

const crearVentaSchema = z.object({
  clienteNombre: z.string().optional(),
  clienteContacto: z.string().optional(),
  metodoPago: z.enum(["efectivo", "tarjeta", "transferencia", "otro"]).default("efectivo"),
  notas: z.string().optional(),
  items: z.array(ventaItemSchema).min(1),
});

router.post("/tiendas/:codigo/ventas", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const body = crearVentaSchema.parse(req.body);

    const total = body.items.reduce((acc, item) => {
      return acc + parseFloat(item.precioUnitario) * item.cantidad;
    }, 0);

    const [venta] = await db.insert(ventasTable).values({
      tiendaCodigo: req.params.codigo,
      clienteNombre: body.clienteNombre ?? null,
      clienteContacto: body.clienteContacto ?? null,
      total: total.toFixed(2),
      metodoPago: body.metodoPago,
      notas: body.notas ?? null,
    }).returning();

    const itemsToInsert = body.items.map((item) => ({
      ventaId: venta.id,
      productoCodigo: item.productoCodigo,
      productoNombre: item.productoNombre,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: (parseFloat(item.precioUnitario) * item.cantidad).toFixed(2),
    }));

    const items = await db.insert(ventaItemsTable).values(itemsToInsert).returning();
    res.status(201).json({ ...venta, items });
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos", detalles: err.issues }); return; }
    res.status(500).json({ error: "Error al registrar venta" });
  }
});

router.get("/tiendas/:codigo/ventas", async (req, res) => {
  try {
    const ventas = await db.select().from(ventasTable)
      .where(eq(ventasTable.tiendaCodigo, req.params.codigo))
      .orderBy(desc(ventasTable.creadoAt))
      .limit(100);
    const ventaIds = ventas.map((v) => v.id);
    let allItems: typeof ventaItemsTable.$inferSelect[] = [];
    if (ventaIds.length > 0) {
      allItems = await db.select().from(ventaItemsTable)
        .where(eq(ventaItemsTable.ventaId, ventas[0].id));
    }
    res.json(ventas);
  } catch {
    res.status(500).json({ error: "Error al obtener ventas" });
  }
});

router.get("/tiendas/:codigo/ventas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [venta] = await db.select().from(ventasTable)
      .where(eq(ventasTable.id, id)).limit(1);
    if (!venta || venta.tiendaCodigo !== req.params.codigo) {
      res.status(404).json({ error: "Venta no encontrada" }); return;
    }
    const items = await db.select().from(ventaItemsTable).where(eq(ventaItemsTable.ventaId, id));
    res.json({ ...venta, items });
  } catch {
    res.status(500).json({ error: "Error al obtener venta" });
  }
});

router.delete("/tiendas/:codigo/ventas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [venta] = await db.select().from(ventasTable).where(eq(ventasTable.id, id)).limit(1);
    if (!venta || venta.tiendaCodigo !== req.params.codigo) {
      res.status(404).json({ error: "Venta no encontrada" }); return;
    }
    await db.delete(ventasTable).where(eq(ventasTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar venta" });
  }
});

router.get("/ventas/resumen", async (_req, res) => {
  try {
    const ventas = await db.select().from(ventasTable).orderBy(desc(ventasTable.creadoAt)).limit(500);
    res.json(ventas);
  } catch {
    res.status(500).json({ error: "Error al obtener resumen" });
  }
});

export default router;
