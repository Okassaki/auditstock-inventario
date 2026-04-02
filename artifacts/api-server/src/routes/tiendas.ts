import { Router, type IRouter } from "express";
import { db, tiendasTable, progresoAuditoriasTable, excelPendientesTable, insertTiendaSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.post("/tiendas", async (req, res) => {
  try {
    const body = insertTiendaSchema.parse(req.body);
    const existing = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, body.codigo)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Ya existe una tienda con ese código" });
      return;
    }
    const [tienda] = await db.insert(tiendasTable).values(body).returning();
    res.status(201).json(tienda);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Datos inválidos", detalles: err.issues });
      return;
    }
    res.status(500).json({ error: "Error al crear tienda" });
  }
});

router.get("/tiendas", async (_req, res) => {
  try {
    const tiendas = await db.select().from(tiendasTable).orderBy(tiendasTable.nombre);
    res.json(tiendas);
  } catch {
    res.status(500).json({ error: "Error al obtener tiendas" });
  }
});

router.get("/tiendas/:codigo", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    res.json(tienda);
  } catch {
    res.status(500).json({ error: "Error al obtener tienda" });
  }
});

const updateTiendaSchema = z.object({
  nombre: z.string().min(1).optional(),
  codigo: z.string().min(1).optional(),
});

router.put("/tiendas/:codigo", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    const body = updateTiendaSchema.parse(req.body);
    if (body.codigo && body.codigo !== req.params.codigo) {
      const existing = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, body.codigo)).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "Ya existe una tienda con ese código" });
        return;
      }
    }
    const [updated] = await db.update(tiendasTable)
      .set({ ...(body.nombre ? { nombre: body.nombre } : {}), ...(body.codigo ? { codigo: body.codigo } : {}) })
      .where(eq(tiendasTable.codigo, req.params.codigo))
      .returning();
    res.json(updated);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Datos inválidos", detalles: err.issues });
      return;
    }
    res.status(500).json({ error: "Error al actualizar tienda" });
  }
});

router.delete("/tiendas/:codigo", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    await db.delete(progresoAuditoriasTable).where(eq(progresoAuditoriasTable.tiendaCodigo, req.params.codigo));
    await db.delete(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar tienda" });
  }
});

router.delete("/tiendas/:codigo/progreso/:auditoriaId", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    const [deleted] = await db.delete(progresoAuditoriasTable)
      .where(eq(progresoAuditoriasTable.auditoriaId, req.params.auditoriaId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Auditoría no encontrada" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar auditoría" });
  }
});

const productoSnapshotSchema = z.object({
  codigo: z.string(),
  nombre: z.string(),
  stock_sistema: z.number(),
  stock_fisico: z.number().nullable(),
  comentario: z.string().nullable(),
});

const progresoSchema = z.object({
  auditoriaId: z.string(),
  auditoriaNombre: z.string(),
  totalProductos: z.number().int().min(0),
  totalContados: z.number().int().min(0),
  estado: z.enum(["activa", "completada", "archivada"]).default("activa"),
  productos: z.array(productoSnapshotSchema).optional(),
});

router.post("/tiendas/:codigo/progreso", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    const body = progresoSchema.parse(req.body);
    const productosJson = body.productos ? JSON.stringify(body.productos) : null;
    const existing = await db.select().from(progresoAuditoriasTable)
      .where(eq(progresoAuditoriasTable.auditoriaId, body.auditoriaId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(progresoAuditoriasTable)
        .set({
          totalProductos: body.totalProductos,
          totalContados: body.totalContados,
          estado: body.estado,
          ...(productosJson !== null ? { productosJson } : {}),
          actualizadoAt: new Date(),
        })
        .where(eq(progresoAuditoriasTable.auditoriaId, body.auditoriaId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(progresoAuditoriasTable).values({
        tiendaCodigo: req.params.codigo,
        auditoriaId: body.auditoriaId,
        auditoriaNombre: body.auditoriaNombre,
        totalProductos: body.totalProductos,
        totalContados: body.totalContados,
        estado: body.estado,
        productosJson,
      }).returning();
      res.status(201).json(created);
    }
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Datos inválidos", detalles: err.issues });
      return;
    }
    res.status(500).json({ error: "Error al reportar progreso" });
  }
});

router.get("/tiendas/:codigo/progreso", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) {
      res.status(404).json({ error: "Tienda no encontrada" });
      return;
    }
    const progresos = await db.select().from(progresoAuditoriasTable)
      .where(eq(progresoAuditoriasTable.tiendaCodigo, req.params.codigo))
      .orderBy(desc(progresoAuditoriasTable.actualizadoAt));
    res.json(progresos);
  } catch {
    res.status(500).json({ error: "Error al obtener progreso" });
  }
});

router.get("/progreso", async (_req, res) => {
  try {
    const tiendas = await db.select().from(tiendasTable).orderBy(tiendasTable.nombre);
    const progresos = await db.select().from(progresoAuditoriasTable)
      .orderBy(desc(progresoAuditoriasTable.actualizadoAt));

    const resultado = tiendas.map((t) => {
      const progresostienda = progresos.filter((p) => p.tiendaCodigo === t.codigo);
      const activa = progresostienda.find((p) => p.estado === "activa");
      return {
        tienda: t,
        progresoActivo: activa ?? null,
        totalAuditorias: progresostienda.length,
      };
    });
    res.json(resultado);
  } catch {
    res.status(500).json({ error: "Error al obtener progreso general" });
  }
});

const excelUploadSchema = z.object({
  nombreArchivo: z.string().min(1),
  contenidoBase64: z.string().min(1),
});

router.post("/tiendas/:codigo/excel", async (req, res) => {
  try {
    const [tienda] = await db.select().from(tiendasTable).where(eq(tiendasTable.codigo, req.params.codigo)).limit(1);
    if (!tienda) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const body = excelUploadSchema.parse(req.body);
    await db.insert(excelPendientesTable)
      .values({ tiendaCodigo: req.params.codigo, nombreArchivo: body.nombreArchivo, contenidoBase64: body.contenidoBase64 })
      .onConflictDoUpdate({
        target: excelPendientesTable.tiendaCodigo,
        set: { nombreArchivo: body.nombreArchivo, contenidoBase64: body.contenidoBase64, subidoAt: new Date() },
      });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "ZodError") { res.status(400).json({ error: "Datos inválidos" }); return; }
    res.status(500).json({ error: "Error al guardar Excel" });
  }
});

router.get("/tiendas/:codigo/excel", async (req, res) => {
  try {
    const [excel] = await db.select().from(excelPendientesTable)
      .where(eq(excelPendientesTable.tiendaCodigo, req.params.codigo))
      .limit(1);
    if (!excel) { res.status(404).json({ error: "No hay Excel pendiente" }); return; }
    res.json({
      nombreArchivo: excel.nombreArchivo,
      contenidoBase64: excel.contenidoBase64,
      subidoAt: excel.subidoAt,
    });
  } catch {
    res.status(500).json({ error: "Error al obtener Excel" });
  }
});

router.delete("/tiendas/:codigo/excel", async (req, res) => {
  try {
    await db.delete(excelPendientesTable).where(eq(excelPendientesTable.tiendaCodigo, req.params.codigo));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar Excel" });
  }
});

export default router;
