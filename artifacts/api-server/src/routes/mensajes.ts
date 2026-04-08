import { Router, type IRouter } from "express";
import { db, mensajesTable, pushTokensTable } from "@workspace/db";
import { eq, or, isNull, desc, and, gt, ne, sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { broadcastNewMessage } from "../lib/signaling";

const router: IRouter = Router();

type MensajeRow = typeof mensajesTable.$inferSelect;

async function sendPushNotifications(msg: MensajeRow) {
  const { deTienda, paraTienda, texto, adjuntoTipo, reenviado } = msg;
  const preview = adjuntoTipo === "imagen" ? "📷 Imagen" : adjuntoTipo === "documento" ? "📎 Documento" : adjuntoTipo === "contacto" ? "👤 Contacto" : texto || "";
  const title = `${reenviado ? "↩ Reenviado • " : ""}${deTienda}`;

  let tokens: string[] = [];
  if (paraTienda) {
    const rows = await db.select().from(pushTokensTable).where(eq(pushTokensTable.tiendaCodigo, paraTienda));
    tokens = rows.map((r) => r.token);
  } else {
    const rows = await db.select().from(pushTokensTable).where(ne(pushTokensTable.tiendaCodigo, deTienda));
    tokens = rows.map((r) => r.token);
  }
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body: preview,
    sound: "default",
    channelId: "mensajes",
    priority: "high",
    data: { deTienda, paraTienda: paraTienda ?? "GENERAL" },
  }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
    body: JSON.stringify(messages),
  });
}

const enviarSchema = z.object({
  deTienda: z.string().min(1),
  paraTienda: z.string().min(1).optional(),
  texto: z.string().max(1000).default(""),
  adjuntoUrl: z.string().url().optional(),
  adjuntoTipo: z.enum(["imagen", "documento", "contacto"]).optional(),
  adjuntoNombre: z.string().max(255).optional(),
  reenviado: z.boolean().optional().default(false),
});

// Enviar mensaje
router.post("/mensajes", async (req, res) => {
  try {
    const body = enviarSchema.parse(req.body);
    const [msg] = await db.insert(mensajesTable).values({
      deTienda: body.deTienda,
      paraTienda: body.paraTienda ?? null,
      texto: body.texto,
      adjuntoUrl: body.adjuntoUrl ?? null,
      adjuntoTipo: body.adjuntoTipo ?? null,
      adjuntoNombre: body.adjuntoNombre ?? null,
      reenviado: body.reenviado ?? false,
    }).returning();

    // Notificar en tiempo real via WebSocket
    broadcastNewMessage(msg.deTienda, msg.paraTienda ?? null);

    // Enviar push notifications de forma asíncrona
    sendPushNotifications(msg).catch((e) => console.error("Push error:", e));

    res.status(201).json(msg);
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Datos inválidos", detail: err.message });
      return;
    }
    console.error("Error al enviar mensaje:", err);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

// Lista de conversaciones para una tienda (estilo WhatsApp)
router.get("/mensajes/conversaciones", async (req, res) => {
  try {
    const { yo } = req.query as { yo?: string };
    if (!yo) { res.status(400).json({ error: "Falta parámetro 'yo'" }); return; }

    const msgs = await db.select().from(mensajesTable)
      .where(or(
        eq(mensajesTable.deTienda, yo),
        eq(mensajesTable.paraTienda, yo),
        isNull(mensajesTable.paraTienda),
      ))
      .orderBy(mensajesTable.id)
      .limit(500);

    const convMap = new Map<string, { ultimoMensaje: typeof msgs[0]; noLeidos: number }>();

    for (const m of msgs) {
      let contraparte: string;
      if (m.paraTienda === null) {
        contraparte = "GENERAL";
      } else if (m.deTienda === yo) {
        contraparte = m.paraTienda;
      } else {
        contraparte = m.deTienda;
      }

      if (!convMap.has(contraparte)) {
        convMap.set(contraparte, { ultimoMensaje: m, noLeidos: 0 });
      } else {
        convMap.get(contraparte)!.ultimoMensaje = m;
      }

      const esDeMi = m.deTienda === yo;
      const esParaMi = m.paraTienda === yo || m.paraTienda === null;
      if (!esDeMi && esParaMi && !m.leido) {
        convMap.get(contraparte)!.noLeidos++;
      }
    }

    const result = Array.from(convMap.entries())
      .map(([contraparte, data]) => ({ contraparte, ...data }))
      .sort((a, b) => b.ultimoMensaje.id - a.ultimoMensaje.id);

    res.json(result);
  } catch (err) {
    console.error("Error en conversaciones:", err);
    res.status(500).json({ error: "Error al obtener conversaciones" });
  }
});

// Mensajes de una conversación privada entre yo y con
router.get("/mensajes/conversacion", async (req, res) => {
  try {
    const { yo, con, desde } = req.query as { yo?: string; con?: string; desde?: string };
    if (!yo || !con) { res.status(400).json({ error: "Faltan parámetros 'yo' y 'con'" }); return; }

    const desdeId = desde ? parseInt(desde, 10) : 0;
    const filtroDesde = desdeId > 0 ? gt(mensajesTable.id, desdeId) : undefined;

    let msgs;
    if (con === "GENERAL") {
      msgs = await db.select().from(mensajesTable)
        .where(and(isNull(mensajesTable.paraTienda), filtroDesde))
        .orderBy(mensajesTable.id)
        .limit(100);
    } else {
      msgs = await db.select().from(mensajesTable)
        .where(and(
          or(
            and(eq(mensajesTable.deTienda, yo), eq(mensajesTable.paraTienda, con)),
            and(eq(mensajesTable.deTienda, con), eq(mensajesTable.paraTienda, yo)),
          ),
          filtroDesde,
        ))
        .orderBy(mensajesTable.id)
        .limit(100);
    }

    res.json(msgs);
  } catch (err) {
    console.error("Error en conversacion:", err);
    res.status(500).json({ error: "Error al obtener conversación" });
  }
});

// Marcar mensajes como leídos en una conversación
router.patch("/mensajes/marcarLeidos", async (req, res) => {
  try {
    const { yo, con } = req.query as { yo?: string; con?: string };
    if (!yo || !con) { res.status(400).json({ error: "Faltan parámetros" }); return; }

    if (con === "GENERAL") {
      await db.update(mensajesTable)
        .set({ leido: true })
        .where(and(isNull(mensajesTable.paraTienda), eq(mensajesTable.leido, false)));
    } else {
      await db.update(mensajesTable)
        .set({ leido: true })
        .where(and(
          eq(mensajesTable.deTienda, con),
          eq(mensajesTable.paraTienda, yo),
          eq(mensajesTable.leido, false),
        ));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marcarLeidos:", err);
    res.status(500).json({ error: "Error" });
  }
});

// Todos los mensajes (vista boss global - legacy)
router.get("/mensajes", async (req, res) => {
  try {
    const { desde } = req.query as { desde?: string };
    const desdeId = desde ? parseInt(desde, 10) : 0;
    const msgs = await db.select().from(mensajesTable)
      .where(desdeId > 0 ? gt(mensajesTable.id, desdeId) : undefined)
      .orderBy(desc(mensajesTable.id))
      .limit(200);
    res.json(msgs.reverse());
  } catch {
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
});

// ── Eliminar mensaje ─────────────────────────────────────────────────────────
// DELETE /mensajes/:id?tipo=todos|yo&yo=TIENDA01
router.delete("/mensajes/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "id inválido" });
  const { tipo, yo } = req.query as { tipo?: string; yo?: string };

  try {
    if (tipo === "todos") {
      if (!yo) return res.status(400).json({ error: "yo requerido para eliminar para todos" });
      // Solo el remitente puede eliminar para todos
      const msg = await db.select({ deTienda: mensajesTable.deTienda })
        .from(mensajesTable)
        .where(eq(mensajesTable.id, id))
        .limit(1);
      if (!msg.length) return res.status(404).json({ error: "Mensaje no encontrado" });
      if (msg[0].deTienda !== yo) return res.status(403).json({ error: "Solo podés eliminar tus propios mensajes para todos" });
      await db.update(mensajesTable)
        .set({ eliminadoTodos: true })
        .where(eq(mensajesTable.id, id));
    } else if (tipo === "yo" && yo) {
      await db.execute(
        drizzleSql`UPDATE mensajes SET eliminados_para = array_append(eliminados_para, ${yo}) WHERE id = ${id} AND NOT (${yo} = ANY(eliminados_para))`
      );
    } else {
      return res.status(400).json({ error: "tipo requerido (todos|yo) y yo" });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al eliminar mensaje" });
  }
});

export default router;
