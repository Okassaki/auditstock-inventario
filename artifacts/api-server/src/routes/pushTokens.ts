import { Router, type IRouter } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.post("/push-debug", (req, res) => {
  console.log("[push-debug]", JSON.stringify(req.body));
  res.json({ ok: true });
});

const schema = z.object({
  token: z.string().min(1),
});

router.put("/push-token/:tiendaCodigo", async (req, res) => {
  try {
    const { tiendaCodigo } = req.params;
    const { token } = schema.parse(req.body);

    await db.insert(pushTokensTable)
      .values({ tiendaCodigo, token, actualizadoAt: new Date() })
      .onConflictDoUpdate({
        target: pushTokensTable.tiendaCodigo,
        set: { token, actualizadoAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e?.name === "ZodError") { res.status(400).json({ error: "Token inválido" }); return; }
    console.error("Error guardando push token:", err);
    res.status(500).json({ error: "Error al guardar token" });
  }
});

export default router;
