import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sanadApprovalRequestsTable,
  sanadChildActivityTable,
  sanadChildrenTable,
  sanadSavingsGoalsTable,
} from "@workspace/db";
import {
  CreateAllowanceBody,
  CreateAllowanceParams,
  CreateAllowanceResponse,
  CreateApprovalRequestBody,
  CreateApprovalRequestParams,
  CreateApprovalRequestResponse,
  CreateChildBody,
  CreateChildResponse,
  CreateSavingsGoalBody,
  CreateSavingsGoalParams,
  CreateSavingsGoalResponse,
  ContributeToSavingsGoalBody,
  ContributeToSavingsGoalParams,
  ContributeToSavingsGoalResponse,
  GetChildDashboardParams,
  GetChildDashboardResponse,
  ListChildrenResponse,
  UpdateApprovalRequestBody,
  UpdateApprovalRequestParams,
  UpdateApprovalRequestResponse,
  UpdateChildBody,
  UpdateChildParams,
  UpdateChildResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function activityDto(activity: typeof sanadChildActivityTable.$inferSelect) {
  return {
    ...activity,
    createdAt: activity.createdAt.toISOString(),
  };
}

function goalDto(goal: typeof sanadSavingsGoalsTable.$inferSelect) {
  return {
    ...goal,
    createdAt: goal.createdAt.toISOString(),
  };
}

function approvalDto(
  approval: typeof sanadApprovalRequestsTable.$inferSelect,
  childName: string,
) {
  return {
    ...approval,
    childName,
    createdAt: approval.createdAt.toISOString(),
  };
}

async function getChildBalance(childId: number) {
  const activity = await db
    .select({ amountFils: sanadChildActivityTable.amountFils })
    .from(sanadChildActivityTable)
    .where(eq(sanadChildActivityTable.childId, childId));
  return activity.reduce((total, item) => total + item.amountFils, 0);
}

router.get("/children", async (_req, res): Promise<void> => {
  const children = await db
    .select()
    .from(sanadChildrenTable)
    .orderBy(desc(sanadChildrenTable.createdAt));
  const activity = await db.select().from(sanadChildActivityTable);
  const response = children.map((child) => ({
    ...child,
    balanceFils: activity
      .filter((item) => item.childId === child.id)
      .reduce((total, item) => total + item.amountFils, 0),
    createdAt: child.createdAt.toISOString(),
  }));
  res.json(ListChildrenResponse.parse(response));
});

router.post("/children", async (req, res): Promise<void> => {
  const parsed = CreateChildBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [child] = await db
    .insert(sanadChildrenTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(
    CreateChildResponse.parse({
      ...child,
      balanceFils: 0,
      createdAt: child.createdAt.toISOString(),
    }),
  );
});

router.patch("/children/:id", async (req, res): Promise<void> => {
  const params = UpdateChildParams.safeParse(req.params);
  const body = UpdateChildBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid child profile",
    });
    return;
  }
  const [child] = await db
    .update(sanadChildrenTable)
    .set({ spendingLimitFils: body.data.spendingLimitFils })
    .where(eq(sanadChildrenTable.id, params.data.id))
    .returning();
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  res.json(
    UpdateChildResponse.parse({
      ...child,
      balanceFils: await getChildBalance(child.id),
      createdAt: child.createdAt.toISOString(),
    }),
  );
});

router.get("/children/:id/dashboard", async (req, res): Promise<void> => {
  const params = GetChildDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const childId = params.data.id;
  const [child] = await db
    .select()
    .from(sanadChildrenTable)
    .where(eq(sanadChildrenTable.id, childId))
    .limit(1);
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }

  const [activity, goals, approvals] = await Promise.all([
    db
      .select()
      .from(sanadChildActivityTable)
      .where(eq(sanadChildActivityTable.childId, childId))
      .orderBy(desc(sanadChildActivityTable.createdAt))
      .limit(20),
    db
      .select()
      .from(sanadSavingsGoalsTable)
      .where(eq(sanadSavingsGoalsTable.childId, childId))
      .orderBy(desc(sanadSavingsGoalsTable.createdAt)),
    db
      .select()
      .from(sanadApprovalRequestsTable)
      .where(eq(sanadApprovalRequestsTable.childId, childId))
      .orderBy(desc(sanadApprovalRequestsTable.createdAt)),
  ]);
  res.json(
    GetChildDashboardResponse.parse({
      child: {
        ...child,
        balanceFils: await getChildBalance(childId),
        createdAt: child.createdAt.toISOString(),
      },
      activity: activity.map(activityDto),
      goals: goals.map(goalDto),
      approvals: approvals.map((approval) => approvalDto(approval, child.name)),
    }),
  );
});

router.post("/children/:id/allowances", async (req, res): Promise<void> => {
  const params = CreateAllowanceParams.safeParse(req.params);
  const body = CreateAllowanceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid allowance",
    });
    return;
  }
  const [child] = await db
    .select({ id: sanadChildrenTable.id })
    .from(sanadChildrenTable)
    .where(eq(sanadChildrenTable.id, params.data.id))
    .limit(1);
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const [activity] = await db
    .insert(sanadChildActivityTable)
    .values({
      childId: params.data.id,
      title: body.data.kind === "eidiyah" ? "Eidiyah" : "Allowance",
      amountFils: body.data.amountFils,
      kind: body.data.kind,
    })
    .returning();
  res.status(201).json(CreateAllowanceResponse.parse(activityDto(activity)));
});

router.post("/children/:id/goals", async (req, res): Promise<void> => {
  const params = CreateSavingsGoalParams.safeParse(req.params);
  const body = CreateSavingsGoalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid savings goal",
    });
    return;
  }
  const [child] = await db
    .select({ id: sanadChildrenTable.id })
    .from(sanadChildrenTable)
    .where(eq(sanadChildrenTable.id, params.data.id))
    .limit(1);
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const [goal] = await db
    .insert(sanadSavingsGoalsTable)
    .values({
      childId: params.data.id,
      name: body.data.name,
      targetFils: body.data.targetFils,
    })
    .returning();
  res.status(201).json(CreateSavingsGoalResponse.parse(goalDto(goal)));
});

router.post(
  "/children/:id/goals/:goalId/contributions",
  async (req, res): Promise<void> => {
    const params = ContributeToSavingsGoalParams.safeParse(req.params);
    const body = ContributeToSavingsGoalBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.error?.message ?? body.error?.message ?? "Invalid contribution",
      });
      return;
    }

    const childId = params.data.id;
    const goalId = params.data.goalId;
    const amountFils = body.data.amountFils;
    const outcome = await db.transaction(async (tx) => {
      const [goal] = await tx
        .select()
        .from(sanadSavingsGoalsTable)
        .where(
          eq(sanadSavingsGoalsTable.id, goalId),
        )
        .for("update")
        .limit(1);
      if (!goal || goal.childId !== childId) return { error: "not-found" as const };
      if (goal.savedFils + amountFils > goal.targetFils) {
        return { error: "goal-limit" as const };
      }

      const activity = await tx
        .select({ amountFils: sanadChildActivityTable.amountFils })
        .from(sanadChildActivityTable)
        .where(eq(sanadChildActivityTable.childId, childId));
      const balance = activity.reduce((total, item) => total + item.amountFils, 0);
      if (balance < amountFils) return { error: "balance" as const };

      await tx.insert(sanadChildActivityTable).values({
        childId,
        title: `Saved for ${goal.name}`,
        amountFils: -amountFils,
        kind: "goal",
      });
      const [updatedGoal] = await tx
        .update(sanadSavingsGoalsTable)
        .set({ savedFils: goal.savedFils + amountFils })
        .where(eq(sanadSavingsGoalsTable.id, goalId))
        .returning();
      return { goal: updatedGoal };
    });

    if ("error" in outcome) {
      const status = outcome.error === "not-found" ? 404 : 409;
      const message =
        outcome.error === "not-found"
          ? "Child or savings goal not found"
          : outcome.error === "goal-limit"
            ? "Contribution exceeds the remaining goal amount"
            : "Not enough demo balance for this contribution";
      res.status(status).json({ error: message });
      return;
    }
    res.json(ContributeToSavingsGoalResponse.parse(goalDto(outcome.goal)));
  },
);

router.post("/children/:id/approvals", async (req, res): Promise<void> => {
  const params = CreateApprovalRequestParams.safeParse(req.params);
  const body = CreateApprovalRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid request",
    });
    return;
  }
  const [child] = await db
    .select()
    .from(sanadChildrenTable)
    .where(eq(sanadChildrenTable.id, params.data.id))
    .limit(1);
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const [approval] = await db
    .insert(sanadApprovalRequestsTable)
    .values({ childId: child.id, ...body.data })
    .returning();
  res
    .status(201)
    .json(
      CreateApprovalRequestResponse.parse(approvalDto(approval, child.name)),
    );
});

router.patch("/approvals/:id", async (req, res): Promise<void> => {
  const params = UpdateApprovalRequestParams.safeParse(req.params);
  const body = UpdateApprovalRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid approval",
    });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(sanadApprovalRequestsTable)
      .where(eq(sanadApprovalRequestsTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!approval) return { error: "not-found" as const };
    if (approval.status !== "pending") return { error: "already-decided" as const };
    const [child] = await tx
      .select()
      .from(sanadChildrenTable)
      .where(eq(sanadChildrenTable.id, approval.childId))
      .for("update")
      .limit(1);
    if (!child) return { error: "not-found" as const };

    if (body.data.status === "approved") {
      if (approval.amountFils > child.spendingLimitFils) {
        return { error: "limit" as const };
      }
      const activity = await tx
        .select({ amountFils: sanadChildActivityTable.amountFils })
        .from(sanadChildActivityTable)
        .where(eq(sanadChildActivityTable.childId, child.id));
      const balance = activity.reduce((total, item) => total + item.amountFils, 0);
      if (balance < approval.amountFils) return { error: "balance" as const };
      await tx.insert(sanadChildActivityTable).values({
        childId: child.id,
        title: approval.item,
        amountFils: -approval.amountFils,
        kind: "purchase",
      });
    }
    const [updated] = await tx
      .update(sanadApprovalRequestsTable)
      .set({ status: body.data.status })
      .where(eq(sanadApprovalRequestsTable.id, approval.id))
      .returning();
    return { approval: updated, childName: child.name };
  });

  if ("error" in outcome) {
    const status = outcome.error === "not-found" ? 404 : 409;
    const message =
      outcome.error === "not-found"
        ? "Approval request not found"
        : outcome.error === "already-decided"
          ? "This request has already been decided"
          : outcome.error === "limit"
            ? "The purchase exceeds this child's spending limit"
            : "Not enough demo balance for this purchase";
    res.status(status).json({ error: message });
    return;
  }
  res.json(
    UpdateApprovalRequestResponse.parse(
      approvalDto(outcome.approval, outcome.childName),
    ),
  );
});

export default router;
