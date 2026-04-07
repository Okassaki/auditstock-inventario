import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const mensajesTable = pgTable("mensajes", {
  id: serial("id").primaryKey(),
  deTienda: text("de_tienda").notNull(),
  paraTienda: text("para_tienda"),
  texto: text("texto").notNull(),
  leido: boolean("leido").notNull().default(false),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
  adjuntoUrl: text("adjunto_url"),
  adjuntoTipo: text("adjunto_tipo"),
  adjuntoNombre: text("adjunto_nombre"),
  reenviado: boolean("reenviado").notNull().default(false),
});

export type Mensaje = typeof mensajesTable.$inferSelect;
