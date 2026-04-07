import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { tiendasTable } from "./tiendas";

export const mensajesTable = pgTable("mensajes", {
  id: serial("id").primaryKey(),
  deTienda: text("de_tienda").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  paraTienda: text("para_tienda"),
  texto: text("texto").notNull(),
  leido: boolean("leido").notNull().default(false),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Mensaje = typeof mensajesTable.$inferSelect;
