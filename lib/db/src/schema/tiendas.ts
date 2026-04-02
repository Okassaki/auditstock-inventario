import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tiendasTable = pgTable("tiendas", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const progresoAuditoriasTable = pgTable("progreso_auditorias", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  auditoriaId: text("auditoria_id").notNull(),
  auditoriaNombre: text("auditoria_nombre").notNull(),
  totalProductos: integer("total_productos").notNull().default(0),
  totalContados: integer("total_contados").notNull().default(0),
  estado: text("estado").notNull().default("activa"),
  productosJson: text("productos_json"),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const excelPendientesTable = pgTable("excel_pendientes", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().unique().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  nombreArchivo: text("nombre_archivo").notNull(),
  contenidoBase64: text("contenido_base64").notNull(),
  subidoAt: timestamp("subido_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTiendaSchema = createInsertSchema(tiendasTable).omit({ id: true, creadoAt: true });
export type InsertTienda = z.infer<typeof insertTiendaSchema>;
export type Tienda = typeof tiendasTable.$inferSelect;

export const insertProgresoSchema = createInsertSchema(progresoAuditoriasTable).omit({ id: true });
export type InsertProgreso = z.infer<typeof insertProgresoSchema>;
export type ProgresoAuditoria = typeof progresoAuditoriasTable.$inferSelect;
