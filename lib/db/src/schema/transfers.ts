import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sanadDemoTransfersTable = pgTable("sanad_demo_transfers", {
  id: serial("id").primaryKey(),
  reference: uuid("reference").defaultRandom().notNull().unique(),
  sender: varchar("sender", { length: 80 }).notNull(),
  recipient: varchar("recipient", { length: 80 }).notNull(),
  amountFils: integer("amount_fils").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("demo_completed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadDemoTransferSchema = createInsertSchema(
  sanadDemoTransfersTable,
).omit({ id: true, reference: true, status: true, createdAt: true });
export type InsertSanadDemoTransfer = z.infer<
  typeof insertSanadDemoTransferSchema
>;
export type SanadDemoTransfer = typeof sanadDemoTransfersTable.$inferSelect;
