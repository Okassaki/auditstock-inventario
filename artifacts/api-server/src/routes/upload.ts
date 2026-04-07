import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/upload", upload.single("archivo"), (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No se recibió archivo" }); return; }
    const host = req.get("host") ?? "";
    const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
    const baseUrl = `${protocol}://${host}`;
    res.json({ url: `${baseUrl}/uploads/${req.file.filename}`, nombre: req.file.originalname });
  } catch (err) {
    console.error("Error en upload:", err);
    res.status(500).json({ error: "Error al subir archivo" });
  }
});

export default router;
