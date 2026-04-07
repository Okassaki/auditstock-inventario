import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tiendasTable } from "./tiendas";

export const productosTable = pgTable("productos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  precio: numeric("precio", { precision: 12, scale: 2 }).notNull().default("0"),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockTiendasTable = pgTable("stock_tiendas", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  productoCodigo: text("producto_codigo").notNull().references(() => productosTable.codigo, { onDelete: "cascade" }),
  stockActual: integer("stock_actual").notNull().default(0),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const movimientosStockTable = pgTable("movimientos_stock", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().references(() => tiendasTable.codigo, { onDelete: "cascade" }),
  productoCodigo: text("producto_codigo").notNull().references(() => productosTable.codigo, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // "entrada" | "salida" | "ajuste"
  cantidad: integer("cantidad").notNull(),
  motivo: text("motivo"),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductoSchema = createInsertSchema(productosTable).omit({ id: true, creadoAt: true, actualizadoAt: true });
export type InsertProducto = z.infer<typeof insertProductoSchema>;
export type Producto = typeof productosTable.$inferSelect;
export type StockTienda = typeof stockTiendasTable.$inferSelect;
export type MovimientoStock = typeof movimientosStockTable.$inferSelect;
