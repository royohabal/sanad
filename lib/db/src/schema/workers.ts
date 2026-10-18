import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sanadWorkersTable = pgTable("sanad_workers", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  workplace: varchar("workplace", { length: 120 }).notNull(),
  jobTitle: varchar("job_title", { length: 80 }).notNull(),
  company: varchar("company", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadWorkerSchema = createInsertSchema(sanadWorkersTable).omit({
  id: true,
  publicId: true,
  createdAt: true,
});
export type InsertSanadWorker = z.infer<typeof insertSanadWorkerSchema>;
export type SanadWorker = typeof sanadWorkersTable.$inferSelect;

export const sanadTipsTable = pgTable("sanad_tips", {
  id: serial("id").primaryKey(),
  reference: uuid("reference").defaultRandom().notNull().unique(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => sanadWorkersTable.id, { onDelete: "cascade" }),
  amountFils: integer("amount_fils").notNull(),
  rating: integer("rating"),
  message: varchar("message", { length: 240 }),
  status: varchar("status", { length: 24 }).notNull().default("demo_completed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadTipSchema = createInsertSchema(sanadTipsTable).omit({
  id: true,
  reference: true,
  createdAt: true,
});
export type InsertSanadTip = z.infer<typeof insertSanadTipSchema>;
export type SanadTip = typeof sanadTipsTable.$inferSelect;

export const sanadSettlementsTable = pgTable(
  "sanad_settlements",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => sanadWorkersTable.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    amountFils: integer("amount_fils").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("sanad_settlements_worker_month").on(table.workerId, table.month)],
);

export const insertSanadSettlementSchema = createInsertSchema(
  sanadSettlementsTable,
).omit({ id: true, updatedAt: true });
export type InsertSanadSettlement = z.infer<typeof insertSanadSettlementSchema>;
export type SanadSettlement = typeof sanadSettlementsTable.$inferSelect;
