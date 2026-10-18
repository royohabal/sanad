import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sanadSettlementsTable,
  sanadTipsTable,
  sanadWorkersTable,
} from "@workspace/db";
import {
  CreateDemoTipBody,
  CreateDemoTipResponse,
  CreateWorkerBody,
  CreateWorkerResponse,
  DeleteWorkerParams,
  GetAdminOverviewResponse,
  GetCompanySummaryResponse,
  GetTipReceiptParams,
  GetTipReceiptResponse,
  GetWorkerByPublicIdParams,
  GetWorkerByPublicIdResponse,
  GetWorkerDashboardParams,
  GetWorkerDashboardResponse,
  ListSettlementsResponse,
  ListTipsQueryParams,
  ListTipsResponse,
  ListWorkersResponse,
  UpdateSettlementStatusBody,
  UpdateSettlementStatusParams,
  UpdateSettlementStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end,
  };
}

function workerDto(worker: typeof sanadWorkersTable.$inferSelect) {
  return {
    ...worker,
    createdAt: worker.createdAt.toISOString(),
  };
}

function publicWorkerDto(worker: typeof sanadWorkersTable.$inferSelect) {
  return {
    publicId: worker.publicId,
    name: worker.name,
    avatarUrl: worker.avatarUrl,
    workplace: worker.workplace,
    jobTitle: worker.jobTitle,
    company: worker.company,
    createdAt: worker.createdAt.toISOString(),
  };
}

function isPublicId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function tipDto(
  tip: typeof sanadTipsTable.$inferSelect,
  worker: typeof sanadWorkersTable.$inferSelect,
) {
  return {
    reference: tip.reference,
    publicId: worker.publicId,
    workerName: worker.name,
    amountFils: tip.amountFils,
    rating: tip.rating,
    message: tip.message,
    status: "demo_completed" as const,
    createdAt: tip.createdAt.toISOString(),
  };
}

router.get("/workers", async (_req, res): Promise<void> => {
  const workers = await db
    .select()
    .from(sanadWorkersTable)
    .orderBy(desc(sanadWorkersTable.createdAt));
  res.json(ListWorkersResponse.parse(workers.map(workerDto)));
});

router.post("/workers", async (req, res): Promise<void> => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [worker] = await db
    .insert(sanadWorkersTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(CreateWorkerResponse.parse(workerDto(worker)));
});

router.get("/workers/:publicId", async (req, res): Promise<void> => {
  const params = GetWorkerByPublicIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isPublicId(params.data.publicId)) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const [worker] = await db
    .select()
    .from(sanadWorkersTable)
    .where(eq(sanadWorkersTable.publicId, params.data.publicId))
    .limit(1);
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.json(GetWorkerByPublicIdResponse.parse(publicWorkerDto(worker)));
});

router.delete("/workers/:publicId", async (req, res): Promise<void> => {
  const params = DeleteWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isPublicId(params.data.publicId)) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const [worker] = await db
    .delete(sanadWorkersTable)
    .where(eq(sanadWorkersTable.publicId, params.data.publicId))
    .returning({ id: sanadWorkersTable.id });
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/workers/:publicId/dashboard", async (req, res): Promise<void> => {
  const params = GetWorkerDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isPublicId(params.data.publicId)) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const [worker] = await db
    .select()
    .from(sanadWorkersTable)
    .where(eq(sanadWorkersTable.publicId, params.data.publicId))
    .limit(1);
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const tips = await db
    .select()
    .from(sanadTipsTable)
    .where(eq(sanadTipsTable.workerId, worker.id))
    .orderBy(desc(sanadTipsTable.createdAt));
  const { month, start, end } = monthRange();
  const monthlyFils = tips
    .filter((tip) => tip.createdAt >= start && tip.createdAt < end)
    .reduce((total, tip) => total + tip.amountFils, 0);
  const ratings = tips.flatMap((tip) => (tip.rating == null ? [] : [tip.rating]));
  const [settlement] = await db
    .select()
    .from(sanadSettlementsTable)
    .where(
      and(
        eq(sanadSettlementsTable.workerId, worker.id),
        eq(sanadSettlementsTable.month, month),
      ),
    )
    .limit(1);
  const settlementHistory = await db
    .select()
    .from(sanadSettlementsTable)
    .where(eq(sanadSettlementsTable.workerId, worker.id))
    .orderBy(desc(sanadSettlementsTable.month), desc(sanadSettlementsTable.updatedAt));

  const result = {
    worker: publicWorkerDto(worker),
    monthlyFils,
    totalTips: tips.length,
    averageRating:
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((total, rating) => total + rating, 0) / ratings.length) *
              10,
          ) / 10
        : null,
    recentTips: tips.slice(0, 8).map((tip) => tipDto(tip, worker)),
    settlements: settlementHistory.map((item) => ({
      id: item.id,
      publicId: worker.publicId,
      workerName: worker.name,
      month: item.month,
      amountFils: item.amountFils,
      status: item.status,
      updatedAt: item.updatedAt.toISOString(),
    })),
    settlementStatus: settlement?.status ?? "pending",
    qrUrl: `/tip/${worker.publicId}`,
  };
  res.json(GetWorkerDashboardResponse.parse(result));
});

router.post("/tips", async (req, res): Promise<void> => {
  const parsed = CreateDemoTipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isPublicId(parsed.data.publicId)) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const [worker] = await db
    .select()
    .from(sanadWorkersTable)
    .where(eq(sanadWorkersTable.publicId, parsed.data.publicId))
    .limit(1);
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const [tip] = await db
    .insert(sanadTipsTable)
    .values({
      workerId: worker.id,
      amountFils: parsed.data.amountFils,
      rating: parsed.data.rating ?? null,
      message: parsed.data.message?.trim() || null,
      status: "demo_completed",
    })
    .returning();
  res.status(201).json(CreateDemoTipResponse.parse(tipDto(tip, worker)));
});

router.get("/tips", async (req, res): Promise<void> => {
  const parsed = ListTipsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({ tip: sanadTipsTable, worker: sanadWorkersTable })
    .from(sanadTipsTable)
    .innerJoin(sanadWorkersTable, eq(sanadTipsTable.workerId, sanadWorkersTable.id))
    .where(
      parsed.data.publicId
        ? eq(sanadWorkersTable.publicId, parsed.data.publicId)
        : undefined,
    )
    .orderBy(desc(sanadTipsTable.createdAt))
    .limit(100);
  res.json(ListTipsResponse.parse(rows.map(({ tip, worker }) => tipDto(tip, worker))));
});

router.get("/tips/:reference", async (req, res): Promise<void> => {
  const params = GetTipReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ tip: sanadTipsTable, worker: sanadWorkersTable })
    .from(sanadTipsTable)
    .innerJoin(sanadWorkersTable, eq(sanadTipsTable.workerId, sanadWorkersTable.id))
    .where(eq(sanadTipsTable.reference, params.data.reference))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Tip receipt not found" });
    return;
  }
  res.json(GetTipReceiptResponse.parse(tipDto(row.tip, row.worker)));
});

router.get("/companies/summary", async (_req, res): Promise<void> => {
  const { start, end } = monthRange();
  const workers = await db.select().from(sanadWorkersTable);
  const tips = await db
    .select()
    .from(sanadTipsTable)
    .where(
      and(gte(sanadTipsTable.createdAt, start), lt(sanadTipsTable.createdAt, end)),
    );
  const workerSummaries = workers.map((worker) => {
    const workerTips = tips.filter((tip) => tip.workerId === worker.id);
    const ratings = workerTips.flatMap((tip) =>
      tip.rating == null ? [] : [tip.rating],
    );
    return {
      worker: workerDto(worker),
      monthFils: workerTips.reduce((total, tip) => total + tip.amountFils, 0),
      totalTips: workerTips.length,
      averageRating:
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((total, rating) => total + rating, 0) /
                ratings.length) *
                10,
            ) / 10
          : null,
    };
  });
  res.json(
    GetCompanySummaryResponse.parse({
      workers: workerSummaries,
      monthFils: workerSummaries.reduce((total, item) => total + item.monthFils, 0),
      totalTips: workerSummaries.reduce((total, item) => total + item.totalTips, 0),
    }),
  );
});

router.get("/settlements", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ settlement: sanadSettlementsTable, worker: sanadWorkersTable })
    .from(sanadSettlementsTable)
    .innerJoin(
      sanadWorkersTable,
      eq(sanadSettlementsTable.workerId, sanadWorkersTable.id),
    )
    .orderBy(desc(sanadSettlementsTable.month), desc(sanadSettlementsTable.updatedAt));
  const output = rows.map(({ settlement, worker }) => ({
    id: settlement.id,
    publicId: worker.publicId,
    workerName: worker.name,
    month: settlement.month,
    amountFils: settlement.amountFils,
    status: settlement.status,
    updatedAt: settlement.updatedAt.toISOString(),
  }));
  res.json(ListSettlementsResponse.parse(output));
});

router.post("/settlements", async (_req, res): Promise<void> => {
  const { month, start, end } = monthRange();
  const workers = await db.select().from(sanadWorkersTable);
  const tips = await db
    .select()
    .from(sanadTipsTable)
    .where(
      and(gte(sanadTipsTable.createdAt, start), lt(sanadTipsTable.createdAt, end)),
    );
  const rows = [];
  for (const worker of workers) {
    const amountFils = tips
      .filter((tip) => tip.workerId === worker.id)
      .reduce((total, tip) => total + tip.amountFils, 0);
    const [settlement] = await db
      .insert(sanadSettlementsTable)
      .values({ workerId: worker.id, month, amountFils, status: "pending" })
      .onConflictDoNothing({
        target: [sanadSettlementsTable.workerId, sanadSettlementsTable.month],
      })
      .returning();
    if (settlement) {
      rows.push({ settlement, worker });
      continue;
    }
    const [existing] = await db
      .select()
      .from(sanadSettlementsTable)
      .where(
        and(
          eq(sanadSettlementsTable.workerId, worker.id),
          eq(sanadSettlementsTable.month, month),
        ),
      )
      .limit(1);
    if (existing) rows.push({ settlement: existing, worker });
  }
  res.status(201).json(
    ListSettlementsResponse.parse(
      rows.map(({ settlement, worker }) => ({
        id: settlement.id,
        publicId: worker.publicId,
        workerName: worker.name,
        month: settlement.month,
        amountFils: settlement.amountFils,
        status: settlement.status,
        updatedAt: settlement.updatedAt.toISOString(),
      })),
    ),
  );
});

router.patch("/settlements/:id", async (req, res): Promise<void> => {
  const params = UpdateSettlementStatusParams.safeParse(req.params);
  const body = UpdateSettlementStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.error?.message ?? body.error?.message ?? "Invalid settlement",
    });
    return;
  }

  const [updated] = await db
    .update(sanadSettlementsTable)
    .set({ status: body.data.status })
    .where(eq(sanadSettlementsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }

  const [worker] = await db
    .select()
    .from(sanadWorkersTable)
    .where(eq(sanadWorkersTable.id, updated.workerId))
    .limit(1);
  const result = {
    id: updated.id,
    publicId: worker.publicId,
    workerName: worker.name,
    month: updated.month,
    amountFils: updated.amountFils,
    status: updated.status,
    updatedAt: updated.updatedAt.toISOString(),
  };
  res.json(UpdateSettlementStatusResponse.parse(result));
});

router.get("/admin/overview", async (_req, res): Promise<void> => {
  const workers = await db
    .select()
    .from(sanadWorkersTable)
    .orderBy(desc(sanadWorkersTable.createdAt));
  const rows = await db
    .select({ tip: sanadTipsTable, worker: sanadWorkersTable })
    .from(sanadTipsTable)
    .innerJoin(sanadWorkersTable, eq(sanadTipsTable.workerId, sanadWorkersTable.id))
    .orderBy(desc(sanadTipsTable.createdAt));
  res.json(
    GetAdminOverviewResponse.parse({
      workerCount: workers.length,
      tipCount: rows.length,
      totalFils: rows.reduce((total, row) => total + row.tip.amountFils, 0),
      workers: workers.map(workerDto),
      recentTips: rows.slice(0, 12).map(({ tip, worker }) => tipDto(tip, worker)),
    }),
  );
});

export default router;
