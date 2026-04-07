import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  tiendaCodigo: text("tienda_codigo").notNull().unique(),
  token: text("token").notNull(),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushToken = typeof pushTokensTable.$inferSelect;
