import { Router, type IRouter } from "express";
import { db, ordenesTrabajoTable, tiendasTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const crearOrdenSchema = z.object({
  clienteNombre: z.string().min(1),
  clienteContacto: z.string().optional(),
  descripcion: z.string().min(1),
  diagnostico: z.string().optional(),
  tecnico: z.string().optional(),
  prioridad: z.enum(["baja", "normal", "alta", "urgente"]).default("normal"),
  presupuesto: z.string().optional(),
  notas: z.string().optional(),
});

function generarNumero(tiendaCodigo: string) {
  const ts = Date.now().toString(36).toUpperCase();
  return `OT-${tiendaCodigo}-${ts}`;
}

router.post("/tiendas/:codigo/ordenes", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const body = crearOrdenSchema.parse(req.body);
    const numero = generarNumero(req.params.codigo);
    const [orden] = await db.insert(ordenesTrabajoTable).values({
      tiendaCodigo: req.params.codigo,
      numero,
      ...body,
      presupuesto: body.presupuesto ?? null,
      clienteContacto: body.clienteContacto ?? null,
      diagnostico: body.diagnostico ?? null,
      tecnico: body.tecnico ?? null,
      notas: body.notas ?? null,
    }).returning();
    res.status(201).json(orden);
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos", detalles: err.issues }); return; }
    res.status(500).json({ error: "Error al crear orden" });
  }
});

router.get("/tiendas/:codigo/ordenes", async (req, res) => {
  try {
    const ordenes = await db.select().from(ordenesTrabajoTable)
      .where(eq(ordenesTrabajoTable.tiendaCodigo, req.params.codigo))
      .orderBy(desc(ordenesTrabajoTable.creadoAt))
      .limit(100);
    res.json(ordenes);
  } catch {
    res.status(500).json({ error: "Error al obtener órdenes" });
  }
});

router.get("/tiendas/:codigo/ordenes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [orden] = await db.select().from(ordenesTrabajoTable).where(eq(ordenesTrabajoTable.id, id)).limit(1);
    if (!orden || orden.tiendaCodigo !== req.params.codigo) {
      res.status(404).json({ error: "Orden no encontrada" }); return;
    }
    res.json(orden);
  } catch {
    res.status(500).json({ error: "Error al obtener orden" });
  }
});

const updateOrdenSchema = z.object({
  estado: z.enum(["pendiente", "en_proceso", "listo", "entregado", "cancelado"]).optional(),
  diagnostico: z.string().optional(),
  tecnico: z.string().optional(),
  prioridad: z.enum(["baja", "normal", "alta", "urgente"]).optional(),
  presupuesto: z.string().optional(),
  costoFinal: z.string().optional(),
  notas: z.string().optional(),
});

router.put("/tiendas/:codigo/ordenes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [orden] = await db.select().from(ordenesTrabajoTable).where(eq(ordenesTrabajoTable.id, id)).limit(1);
    if (!orden || orden.tiendaCodigo !== req.params.codigo) {
      res.status(404).json({ error: "Orden no encontrada" }); return;
    }
    const body = updateOrdenSchema.parse(req.body);
    const [updated] = await db.update(ordenesTrabajoTable)
      .set({ ...body, actualizadoAt: new Date() })
      .where(eq(ordenesTrabajoTable.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos" }); return; }
    res.status(500).json({ error: "Error al actualizar orden" });
  }
});

router.delete("/tiendas/:codigo/ordenes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [orden] = await db.select().from(ordenesTrabajoTable).where(eq(ordenesTrabajoTable.id, id)).limit(1);
    if (!orden || orden.tiendaCodigo !== req.params.codigo) {
      res.status(404).json({ error: "Orden no encontrada" }); return;
    }
    await db.delete(ordenesTrabajoTable).where(eq(ordenesTrabajoTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar orden" });
  }
});

router.get("/ordenes", async (_req, res) => {
  try {
    const ordenes = await db.select().from(ordenesTrabajoTable)
      .orderBy(desc(ordenesTrabajoTable.creadoAt))
      .limit(200);
    res.json(ordenes);
  } catch {
    res.status(500).json({ error: "Error al obtener órdenes" });
  }
});

export default router;
