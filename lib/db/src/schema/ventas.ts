import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tiendasTable } from "./tiendas";
import { productosTable } from "./productos";

export const ventasTable = pgTable("ventas", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  clienteNombre: text("cliente_nombre"),
  clienteContacto: text("cliente_contacto"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  metodoPago: text("metodo_pago").notNull().default("efectivo"), // "efectivo" | "tarjeta" | "transferencia" | "otro"
  notas: text("notas"),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ventaItemsTable = pgTable("venta_items", {
  id: serial("id").primaryKey(),
  ventaId: integer("venta_id").notNull().references(() => ventasTable.id, { onDelete: "cascade" }),
  productoCodigo: text("producto_codigo").notNull(),
  productoNombre: text("producto_nombre").notNull(),
  cantidad: integer("cantidad").notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertVentaSchema = createInsertSchema(ventasTable).omit({ id: true, creadoAt: true });
export type InsertVenta = z.infer<typeof insertVentaSchema>;
export type Venta = typeof ventasTable.$inferSelect;
export type VentaItem = typeof ventaItemsTable.$inferSelect;
