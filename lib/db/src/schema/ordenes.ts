import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tiendasTable } from "./tiendas";

export const ordenesTrabajoTable = pgTable("ordenes_trabajo", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  numero: text("numero").notNull().unique(),
  clienteNombre: text("cliente_nombre").notNull(),
  clienteContacto: text("cliente_contacto"),
  descripcion: text("descripcion").notNull(),
  diagnostico: text("diagnostico"),
  tecnico: text("tecnico"),
  estado: text("estado").notNull().default("pendiente"), // "pendiente" | "en_proceso" | "listo" | "entregado" | "cancelado"
  prioridad: text("prioridad").notNull().default("normal"), // "baja" | "normal" | "alta" | "urgente"
  presupuesto: numeric("presupuesto", { precision: 12, scale: 2 }),
  costoFinal: numeric("costo_final", { precision: 12, scale: 2 }),
  notas: text("notas"),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrdenSchema = createInsertSchema(ordenesTrabajoTable).omit({ id: true, creadoAt: true, actualizadoAt: true });
export type InsertOrden = z.infer<typeof insertOrdenSchema>;
export type OrdenTrabajo = typeof ordenesTrabajoTable.$inferSelect;
