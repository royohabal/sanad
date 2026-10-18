import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sanadChildrenTable = pgTable("sanad_children", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  age: integer("age").notNull(),
  spendingLimitFils: integer("spending_limit_fils").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadChildSchema = createInsertSchema(sanadChildrenTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSanadChild = z.infer<typeof insertSanadChildSchema>;
export type SanadChild = typeof sanadChildrenTable.$inferSelect;

export const sanadChildActivityTable = pgTable("sanad_child_activity", {
  id: serial("id").primaryKey(),
  childId: integer("child_id")
    .notNull()
    .references(() => sanadChildrenTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  amountFils: integer("amount_fils").notNull(),
  kind: varchar("kind", { length: 16 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadChildActivitySchema = createInsertSchema(
  sanadChildActivityTable,
).omit({ id: true, createdAt: true });
export type InsertSanadChildActivity = z.infer<
  typeof insertSanadChildActivitySchema
>;
export type SanadChildActivity = typeof sanadChildActivityTable.$inferSelect;

export const sanadSavingsGoalsTable = pgTable("sanad_savings_goals", {
  id: serial("id").primaryKey(),
  childId: integer("child_id")
    .notNull()
    .references(() => sanadChildrenTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  targetFils: integer("target_fils").notNull(),
  savedFils: integer("saved_fils").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadSavingsGoalSchema = createInsertSchema(
  sanadSavingsGoalsTable,
).omit({ id: true, savedFils: true, createdAt: true });
export type InsertSanadSavingsGoal = z.infer<
  typeof insertSanadSavingsGoalSchema
>;
export type SanadSavingsGoal = typeof sanadSavingsGoalsTable.$inferSelect;

export const sanadApprovalRequestsTable = pgTable("sanad_approval_requests", {
  id: serial("id").primaryKey(),
  childId: integer("child_id")
    .notNull()
    .references(() => sanadChildrenTable.id, { onDelete: "cascade" }),
  item: varchar("item", { length: 100 }).notNull(),
  amountFils: integer("amount_fils").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSanadApprovalRequestSchema = createInsertSchema(
  sanadApprovalRequestsTable,
).omit({ id: true, status: true, createdAt: true });
export type InsertSanadApprovalRequest = z.infer<
  typeof insertSanadApprovalRequestSchema
>;
export type SanadApprovalRequest = typeof sanadApprovalRequestsTable.$inferSelect;

