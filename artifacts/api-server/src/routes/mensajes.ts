import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mensajesTable } from "@workspace/db";
import { eq, or, isNull, desc, and, gt } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const enviarSchema = z.object({
  deTienda: z.string().min(1),
  paraTienda: z.string().min(1).optional(),
  texto: z.string().min(1).max(1000),
});

router.post("/mensajes", async (req, res) => {
  try {
    const body = enviarSchema.parse(req.body);
    const [msg] = await db.insert(mensajesTable).values({
      deTienda: body.deTienda,
      paraTienda: body.paraTienda ?? null,
      texto: body.texto,
    }).returning();
    res.status(201).json(msg);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Datos inválidos" });
      return;
    }
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

router.get("/mensajes", async (req, res) => {
  try {
    const { tienda, desde } = req.query as { tienda?: string; desde?: string };

    if (!tienda) {
      const msgs = await db.select().from(mensajesTable)
        .orderBy(desc(mensajesTable.creadoAt))
        .limit(200);
      res.json(msgs);
      return;
    }

    const desdeId = desde ? parseInt(desde, 10) : 0;

    const msgs = await db.select().from(mensajesTable)
      .where(
        and(
          or(
            eq(mensajesTable.deTienda, tienda),
            eq(mensajesTable.paraTienda, tienda),
            isNull(mensajesTable.paraTienda),
          ),
          desdeId > 0 ? gt(mensajesTable.id, desdeId) : undefined,
        )
      )
      .orderBy(desc(mensajesTable.creadoAt))
      .limit(100);

    res.json(msgs.reverse());
  } catch {
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
});

router.patch("/mensajes/:id/leido", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(mensajesTable).set({ leido: true }).where(eq(mensajesTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al marcar como leído" });
  }
});

router.get("/mensajes/noLeidos/:tienda", async (req, res) => {
  try {
    const { tienda } = req.params;
    const msgs = await db.select().from(mensajesTable)
      .where(
        and(
          eq(mensajesTable.leido, false),
          or(
            eq(mensajesTable.paraTienda, tienda),
            isNull(mensajesTable.paraTienda),
          ),
        )
      );
    res.json({ count: msgs.length });
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

export default router;
