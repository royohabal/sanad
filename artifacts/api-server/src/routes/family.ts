import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type CashOutRequestRecord,
  type ApprovalRequestRecord,
  type ChildActivityRecord,
  type ChildRecord,
  type MongoSession,
  type SavingsGoalRecord,
} from "@workspace/db";
import {
  CreateAllowanceBody,
  CreateAllowanceParams,
  CreateAllowanceResponse,
  CreateApprovalRequestBody,
  CreateApprovalRequestParams,
  CreateApprovalRequestResponse,
  CreateCashOutRequestBody,
  CreateCashOutRequestParams,
  CreateCashOutRequestResponse,
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
  GetPublicChildRecipientParams,
  GetPublicChildRecipientResponse,
  ListChildrenResponse,
  UpdateApprovalRequestBody,
  UpdateApprovalRequestParams,
  UpdateApprovalRequestResponse,
  UpdateCashOutRequestBody,
  UpdateCashOutRequestParams,
  UpdateCashOutRequestResponse,
  UpdateChildBody,
  UpdateChildParams,
  UpdateChildResponse,
} from "@workspace/api-zod";
import { isAdminUser, signedInUserId } from "../middleware/authz";
import { rateLimitPublicRequests } from "../lib/publicRateLimit";

const router: IRouter = Router();
const children = () => getMongoDb().collection<ChildRecord>("sanad_children");
const activities = () =>
  getMongoDb().collection<ChildActivityRecord>("sanad_child_activity");
const goals = () =>
  getMongoDb().collection<SavingsGoalRecord>("sanad_savings_goals");
const approvals = () =>
  getMongoDb().collection<ApprovalRequestRecord>("sanad_approval_requests");
const cashOutRequests = () =>
  getMongoDb().collection<CashOutRequestRecord>("sanad_cash_out_requests");

router.use(async (req, res, next) => {
  const protectedFamilyPath =
    req.path === "/children" ||
    req.path.startsWith("/children/") ||
    req.path.startsWith("/approvals/") ||
    req.path.startsWith("/cash-outs/");
  if (!protectedFamilyPath) {
    next();
    return;
  }

  try {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to access family accounts." });
      return;
    }
    if (await isAdminUser(userId)) {
      next();
      return;
    }

    let childId: number | undefined;
    const childPath = req.path.match(/^\/children\/(\d+)(?:\/|$)/);
    const approvalPath = req.path.match(/^\/approvals\/(\d+)$/);
    const cashOutPath = req.path.match(/^\/cash-outs\/(\d+)$/);
    if (childPath) {
      childId = Number(childPath[1]);
    } else if (approvalPath) {
      childId = (
        await approvals().findOne(
          { id: Number(approvalPath[1]) },
          { projection: { childId: 1 } },
        )
      )?.childId;
    } else if (cashOutPath) {
      childId = (
        await cashOutRequests().findOne(
          { id: Number(cashOutPath[1]) },
          { projection: { childId: 1 } },
        )
      )?.childId;
    }

    if (childId !== undefined) {
      const child = await children().findOne(
        { id: childId },
        { projection: { ownerUserId: 1 } },
      );
      if (child && child.ownerUserId !== userId) {
        res.status(404).json({ error: "Child profile not found." });
        return;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

function activityDto(activity: ChildActivityRecord) {
  return {
    id: activity.id,
    childId: activity.childId,
    title: activity.title,
    amountFils: activity.amountFils,
    kind: activity.kind,
    createdAt: activity.createdAt.toISOString(),
  };
}

function goalDto(goal: SavingsGoalRecord) {
  return {
    id: goal.id,
    childId: goal.childId,
    name: goal.name,
    targetFils: goal.targetFils,
    savedFils: goal.savedFils,
    createdAt: goal.createdAt.toISOString(),
  };
}

function approvalDto(approval: ApprovalRequestRecord, childName: string) {
  return {
    id: approval.id,
    childId: approval.childId,
    item: approval.item,
    amountFils: approval.amountFils,
    status: approval.status,
    childName,
    createdAt: approval.createdAt.toISOString(),
  };
}

function cashOutRequestDto(
  request: CashOutRequestRecord,
  childName: string,
) {
  return {
    id: request.id,
    childId: request.childId,
    childName,
    amountFils: request.amountFils,
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function childDto(child: ChildRecord, balanceFils: number) {
  return {
    id: child.id,
    publicId: child.publicId,
    name: child.name,
    age: child.age,
    spendingLimitFils: child.spendingLimitFils,
    balanceFils,
    createdAt: child.createdAt.toISOString(),
  };
}

async function getChildBalance(childId: number, session?: MongoSession) {
  const [result] = await activities()
    .aggregate<{ _id: number | null; balanceFils: number }>([
      { $match: { childId } },
      { $group: { _id: null, balanceFils: { $sum: "$amountFils" } } },
    ], session ? { session } : {})
    .toArray();
  return result?.balanceFils ?? 0;
}

function childFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Child";
}

router.get(
  "/child-recipients/:publicId",
  rateLimitPublicRequests({
    scope: "child-qr-lookup",
    limit: 120,
    windowMs: 60 * 1000,
  }),
  async (req, res): Promise<void> => {
    const params = GetPublicChildRecipientParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const child = await children().findOne(
      { publicId: params.data.publicId },
      { projection: { publicId: 1, name: 1 } },
    );
    if (!child) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    res.json(
      GetPublicChildRecipientResponse.parse({
        publicId: child.publicId,
        firstName: childFirstName(child.name),
      }),
    );
  },
);

router.post(
  "/child-recipients/:publicId/transfers",
  rateLimitPublicRequests({
    scope: "child-qr-transfer",
    limit: 60,
    windowMs: 15 * 60 * 1000,
  }),
  async (_req, res): Promise<void> => {
    res.status(410).json({
      error: "Direct QR credits are disabled. Start a SANAD checkout instead.",
    });
  },
);

router.get("/children", async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access family accounts." });
    return;
  }
  const admin = await isAdminUser(userId);
  const childFilter = admin ? {} : { ownerUserId: userId };
  const [childRows, balanceRows] = await Promise.all([
    children().find(childFilter).sort({ createdAt: -1 }).toArray(),
    children()
      .find(childFilter, { projection: { id: 1 } })
      .toArray()
      .then((ownedChildren) =>
        activities()
          .aggregate<{ _id: number; balanceFils: number }>([
            { $match: { childId: { $in: ownedChildren.map((child) => child.id) } } },
            {
              $group: {
                _id: "$childId",
                balanceFils: { $sum: "$amountFils" },
              },
            },
          ])
          .toArray(),
      ),
  ]);
  const balances = new Map(
    balanceRows.map((row) => [row._id, row.balanceFils]),
  );
  res.json(
    ListChildrenResponse.parse(
      childRows.map((child) => childDto(child, balances.get(child.id) ?? 0)),
    ),
  );
});

router.post("/children", async (req, res): Promise<void> => {
  const parsed = CreateChildBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ownerUserId = signedInUserId(req);
  if (!ownerUserId) {
    res.status(401).json({ error: "Sign in to create a child profile." });
    return;
  }
  const child: ChildRecord = {
    ...parsed.data,
    id: await nextId("sanad_children"),
    publicId: randomUUID(),
    ownerUserId,
    cashOutReservedFils: 0,
    createdAt: new Date(),
  };
  await children().insertOne(child);
  res.status(201).json(CreateChildResponse.parse(childDto(child, 0)));
});

router.patch("/children/:id", async (req, res): Promise<void> => {
  const params = UpdateChildParams.safeParse(req.params);
  const body = UpdateChildBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error:
        params.error?.message ??
        body.error?.message ??
        "Invalid child profile",
    });
    return;
  }

  const child = await children().findOneAndUpdate(
    { id: params.data.id },
    { $set: { spendingLimitFils: body.data.spendingLimitFils } },
    { returnDocument: "after" },
  );
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  res.json(
    UpdateChildResponse.parse(
      childDto(child, await getChildBalance(child.id)),
    ),
  );
});

router.get("/children/:id/dashboard", async (req, res): Promise<void> => {
  const params = GetChildDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const childId = params.data.id;
  const child = await children().findOne({ id: childId });
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }

  const [activity, childGoals, childApprovals, balanceFils] = await Promise.all([
    activities()
      .find({ childId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    goals().find({ childId }).sort({ createdAt: -1 }).toArray(),
    approvals().find({ childId }).sort({ createdAt: -1 }).toArray(),
    getChildBalance(childId),
  ]);
  const childCashOutRequests = await cashOutRequests()
    .find({ childId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(
    GetChildDashboardResponse.parse({
      child: childDto(child, balanceFils),
      availableBalanceFils: Math.max(
        0,
        balanceFils - (child.cashOutReservedFils ?? 0),
      ),
      activity: activity.map(activityDto),
      goals: childGoals.map(goalDto),
      approvals: childApprovals.map((approval) =>
        approvalDto(approval, child.name),
      ),
      cashOutRequests: childCashOutRequests.map((request) =>
        cashOutRequestDto(request, child.name),
      ),
    }),
  );
});

router.post(
  "/children/:id/cash-outs",
  async (req, res): Promise<void> => {
    const params = CreateCashOutRequestParams.safeParse(req.params);
    const body = CreateCashOutRequestBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          params.error?.message ??
          body.error?.message ??
          "Invalid cash-out request.",
      });
      return;
    }
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to request a cash-out." });
      return;
    }

    const outcome = await withMongoTransaction(async (session) => {
      const child = await children().findOne(
        { id: params.data.id },
        { session },
      );
      if (!child) return { error: "not-found" as const };

      const balanceFils = await getChildBalance(child.id, session);
      const reservedFils = child.cashOutReservedFils ?? 0;
      if (body.data.amountFils > balanceFils - reservedFils) {
        return { error: "insufficient-balance" as const };
      }

      const reserveFilter =
        child.cashOutReservedFils == null
          ? { cashOutReservedFils: { $exists: false } }
          : { cashOutReservedFils: child.cashOutReservedFils };
      const reservedChild = await children().findOneAndUpdate(
        { id: child.id, ...reserveFilter },
        { $inc: { cashOutReservedFils: body.data.amountFils } },
        { returnDocument: "after", session },
      );
      if (!reservedChild) return { error: "conflict" as const };

      const now = new Date();
      const request: CashOutRequestRecord = {
        id: await nextId("sanad_cash_out_requests", session),
        childId: child.id,
        amountFils: body.data.amountFils,
        reason: body.data.reason.trim(),
        status: "pending",
        requestedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      };
      await cashOutRequests().insertOne(request, { session });
      return { request, childName: child.name };
    });

    if ("error" in outcome) {
      const status = outcome.error === "not-found" ? 404 : 409;
      const message =
        outcome.error === "not-found"
          ? "Child profile not found."
          : outcome.error === "insufficient-balance"
            ? "The request exceeds the child's available wallet balance."
            : "The wallet changed while the request was being saved. Refresh and try again.";
      res.status(status).json({ error: message });
      return;
    }
    res.status(201).json(
      CreateCashOutRequestResponse.parse(
        cashOutRequestDto(outcome.request, outcome.childName),
      ),
    );
  },
);

router.patch(
  "/cash-outs/:id",
  async (req, res): Promise<void> => {
    const params = UpdateCashOutRequestParams.safeParse(req.params);
    const body = UpdateCashOutRequestBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          params.error?.message ??
          body.error?.message ??
          "Invalid cash-out decision.",
      });
      return;
    }
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to update a cash-out request." });
      return;
    }

    const outcome = await withMongoTransaction(async (session) => {
      const request = await cashOutRequests().findOne(
        { id: params.data.id },
        { session },
      );
      if (!request) return { error: "not-found" as const };
      if (request.status !== "pending") {
        return { error: "already-decided" as const };
      }
      const child = await children().findOne(
        { id: request.childId },
        { session },
      );
      if (!child) return { error: "not-found" as const };

      const reservedFils = child.cashOutReservedFils ?? 0;
      if (reservedFils < request.amountFils) {
        return { error: "reservation" as const };
      }
      if (body.data.status === "approved") {
        const balanceFils = await getChildBalance(child.id, session);
        if (balanceFils < reservedFils) {
          return { error: "insufficient-balance" as const };
        }
      } else {
        const updatedChild = await children().findOneAndUpdate(
          {
            id: child.id,
            cashOutReservedFils: reservedFils,
          },
          { $inc: { cashOutReservedFils: -request.amountFils } },
          { returnDocument: "after", session },
        );
        if (!updatedChild) return { error: "conflict" as const };
      }

      const updatedRequest = await cashOutRequests().findOneAndUpdate(
        { id: request.id, status: "pending" },
        {
          $set: {
            status: body.data.status,
            reviewedByUserId: userId,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after", session },
      );
      if (!updatedRequest) return { error: "already-decided" as const };
      return { request: updatedRequest, childName: child.name };
    });

    if ("error" in outcome) {
      const status = outcome.error === "not-found" ? 404 : 409;
      const message =
        outcome.error === "not-found"
          ? "Cash-out request not found."
          : outcome.error === "already-decided"
            ? "This cash-out request has already been decided."
            : outcome.error === "insufficient-balance"
              ? "The reserved amount is no longer covered by the wallet balance."
              : "The wallet reservation could not be updated. Refresh and try again.";
      res.status(status).json({ error: message });
      return;
    }
    res.json(
      UpdateCashOutRequestResponse.parse(
        cashOutRequestDto(outcome.request, outcome.childName),
      ),
    );
  },
);

router.post("/children/:id/allowances", async (req, res): Promise<void> => {
  const params = CreateAllowanceParams.safeParse(req.params);
  const body = CreateAllowanceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid allowance",
    });
    return;
  }
  const child = await children().findOne(
    { id: params.data.id },
    { projection: { id: 1 } },
  );
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const activity: ChildActivityRecord = {
    id: await nextId("sanad_child_activity"),
    childId: params.data.id,
    title: body.data.kind === "eidiyah" ? "Eidiyah" : "Allowance",
    amountFils: body.data.amountFils,
    kind: body.data.kind,
    createdAt: new Date(),
  };
  await activities().insertOne(activity);
  res.status(201).json(
    CreateAllowanceResponse.parse(activityDto(activity)),
  );
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
  const child = await children().findOne(
    { id: params.data.id },
    { projection: { id: 1 } },
  );
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const goal: SavingsGoalRecord = {
    id: await nextId("sanad_savings_goals"),
    childId: params.data.id,
    name: body.data.name,
    targetFils: body.data.targetFils,
    savedFils: 0,
    createdAt: new Date(),
  };
  await goals().insertOne(goal);
  res.status(201).json(CreateSavingsGoalResponse.parse(goalDto(goal)));
});

router.post(
  "/children/:id/goals/:goalId/contributions",
  async (req, res): Promise<void> => {
    const params = ContributeToSavingsGoalParams.safeParse(req.params);
    const body = ContributeToSavingsGoalBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          params.error?.message ??
          body.error?.message ??
          "Invalid contribution",
      });
      return;
    }

    const { id: childId, goalId } = params.data;
    const amountFils = body.data.amountFils;
    const outcome = await withMongoTransaction(async (session) => {
      const goal = await goals().findOne(
        { id: goalId, childId },
        { session },
      );
      if (!goal) return { error: "not-found" as const };
      const child = await children().findOne({ id: childId }, { session });
      if (!child) return { error: "not-found" as const };
      if (goal.savedFils + amountFils > goal.targetFils) {
        return { error: "goal-limit" as const };
      }
      const balance = await getChildBalance(childId, session);
      if (balance - (child.cashOutReservedFils ?? 0) < amountFils) {
        return { error: "balance" as const };
      }

      const updated = await goals().updateOne(
        { id: goalId, childId, savedFils: goal.savedFils },
        { $set: { savedFils: goal.savedFils + amountFils } },
        { session },
      );
      if (updated.matchedCount !== 1) {
        return { error: "goal-limit" as const };
      }
      await activities().insertOne(
        {
          id: await nextId("sanad_child_activity", session),
          childId,
          title: `Saved for ${goal.name}`,
          amountFils: -amountFils,
          kind: "goal",
          createdAt: new Date(),
        },
        { session },
      );
      return {
        goal: { ...goal, savedFils: goal.savedFils + amountFils },
      };
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
    res.json(
      ContributeToSavingsGoalResponse.parse(goalDto(outcome.goal)),
    );
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
  const child = await children().findOne(
    { id: params.data.id },
    { projection: { id: 1, name: 1 } },
  );
  if (!child) {
    res.status(404).json({ error: "Child profile not found" });
    return;
  }
  const approval: ApprovalRequestRecord = {
    id: await nextId("sanad_approval_requests"),
    childId: child.id,
    item: body.data.item,
    amountFils: body.data.amountFils,
    status: "pending",
    createdAt: new Date(),
  };
  await approvals().insertOne(approval);
  res.status(201).json(
    CreateApprovalRequestResponse.parse(
      approvalDto(approval, child.name),
    ),
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

  const outcome = await withMongoTransaction(async (session) => {
    const approval = await approvals().findOne(
      { id: params.data.id },
      { session },
    );
    if (!approval) return { error: "not-found" as const };
    if (approval.status !== "pending") {
      return { error: "already-decided" as const };
    }
    const child = await children().findOne(
      { id: approval.childId },
      { session },
    );
    if (!child) return { error: "not-found" as const };

    if (body.data.status === "approved") {
      if (approval.amountFils > child.spendingLimitFils) {
        return { error: "limit" as const };
      }
      const balance = await getChildBalance(child.id, session);
      if (
        balance - (child.cashOutReservedFils ?? 0) <
        approval.amountFils
      ) {
        return { error: "balance" as const };
      }
    }

    const updated = await approvals().findOneAndUpdate(
      { id: approval.id, status: "pending" },
      { $set: { status: body.data.status } },
      { returnDocument: "after", session },
    );
    if (!updated) return { error: "already-decided" as const };

    if (body.data.status === "approved") {
      await activities().insertOne(
        {
          id: await nextId("sanad_child_activity", session),
          childId: child.id,
          title: approval.item,
          amountFils: -approval.amountFils,
          kind: "purchase",
          createdAt: new Date(),
        },
        { session },
      );
    }
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
