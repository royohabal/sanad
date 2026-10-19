import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type SettlementRecord,
  type TipRecord,
  type WorkerRecord,
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
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const settlements = () =>
  getMongoDb().collection<SettlementRecord>("sanad_settlements");

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end,
  };
}

function workerDto(worker: WorkerRecord) {
  return {
    id: worker.id,
    publicId: worker.publicId,
    name: worker.name,
    avatarUrl: worker.avatarUrl,
    workplace: worker.workplace,
    jobTitle: worker.jobTitle,
    company: worker.company,
    createdAt: worker.createdAt.toISOString(),
  };
}

function publicWorkerDto(worker: WorkerRecord) {
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

function tipDto(tip: TipRecord, worker: WorkerRecord) {
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

function settlementDto(settlement: SettlementRecord, worker: WorkerRecord) {
  return {
    id: settlement.id,
    publicId: worker.publicId,
    workerName: worker.name,
    month: settlement.month,
    amountFils: settlement.amountFils,
    status: settlement.status,
    updatedAt: settlement.updatedAt.toISOString(),
  };
}

router.get("/workers", async (_req, res): Promise<void> => {
  const rows = await workers().find({}).sort({ createdAt: -1 }).toArray();
  res.json(ListWorkersResponse.parse(rows.map(workerDto)));
});

router.post("/workers", async (req, res): Promise<void> => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const worker: WorkerRecord = {
    ...parsed.data,
    avatarUrl: parsed.data.avatarUrl ?? null,
    id: await nextId("sanad_workers"),
    publicId: randomUUID(),
    createdAt: new Date(),
  };
  await workers().insertOne(worker);
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

  const worker = await workers().findOne({
    publicId: params.data.publicId,
  });
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.json(
    GetWorkerByPublicIdResponse.parse(publicWorkerDto(worker)),
  );
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

  const workerId = await withMongoTransaction(async (session) => {
    const worker = await workers().findOne(
      { publicId: params.data.publicId },
      { projection: { id: 1 }, session },
    );
    if (!worker) return null;
    await tips().deleteMany({ workerId: worker.id }, { session });
    await settlements().deleteMany({ workerId: worker.id }, { session });
    await workers().deleteOne({ id: worker.id }, { session });
    return worker.id;
  });
  if (workerId == null) {
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

  const worker = await workers().findOne({
    publicId: params.data.publicId,
  });
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const workerTips = await tips()
    .find({ workerId: worker.id })
    .sort({ createdAt: -1 })
    .toArray();
  const { month, start, end } = monthRange();
  const monthlyFils = workerTips
    .filter((tip) => tip.createdAt >= start && tip.createdAt < end)
    .reduce((total, tip) => total + tip.amountFils, 0);
  const ratings = workerTips.flatMap((tip) =>
    tip.rating == null ? [] : [tip.rating],
  );
  const settlementHistory = await settlements()
    .find({ workerId: worker.id })
    .sort({ month: -1, updatedAt: -1 })
    .toArray();
  const settlement = settlementHistory.find((item) => item.month === month);

  res.json(
    GetWorkerDashboardResponse.parse({
      worker: publicWorkerDto(worker),
      monthlyFils,
      totalTips: workerTips.length,
      averageRating:
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((total, rating) => total + rating, 0) /
                ratings.length) *
                10,
            ) / 10
          : null,
      recentTips: workerTips.slice(0, 8).map((tip) => tipDto(tip, worker)),
      settlements: settlementHistory.map((item) =>
        settlementDto(item, worker),
      ),
      settlementStatus: settlement?.status ?? "pending",
      qrUrl: `/tip/${worker.publicId}`,
    }),
  );
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

  const worker = await workers().findOne({
    publicId: parsed.data.publicId,
  });
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  const tip: TipRecord = {
    id: await nextId("sanad_tips"),
    reference: randomUUID(),
    workerId: worker.id,
    amountFils: parsed.data.amountFils,
    rating: parsed.data.rating ?? null,
    message: parsed.data.message?.trim() || null,
    status: "demo_completed",
    createdAt: new Date(),
  };
  await tips().insertOne(tip);
  res.status(201).json(
    CreateDemoTipResponse.parse(tipDto(tip, worker)),
  );
});

router.get("/tips", async (req, res): Promise<void> => {
  const parsed = ListTipsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filter: { workerId?: number } = {};
  if (parsed.data.publicId) {
    const worker = await workers().findOne(
      { publicId: parsed.data.publicId },
      { projection: { id: 1 } },
    );
    if (!worker) {
      res.json(ListTipsResponse.parse([]));
      return;
    }
    filter.workerId = worker.id;
  }
  const tipRows = await tips()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const workerIds = [...new Set(tipRows.map((tip) => tip.workerId))];
  const workerRows = await workers()
    .find({ id: { $in: workerIds } })
    .toArray();
  const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
  res.json(
    ListTipsResponse.parse(
      tipRows.flatMap((tip) => {
        const worker = workerById.get(tip.workerId);
        return worker ? [tipDto(tip, worker)] : [];
      }),
    ),
  );
});

router.get("/tips/:reference", async (req, res): Promise<void> => {
  const params = GetTipReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tip = await tips().findOne({ reference: params.data.reference });
  const worker = tip ? await workers().findOne({ id: tip.workerId }) : null;
  if (!tip || !worker) {
    res.status(404).json({ error: "Tip receipt not found" });
    return;
  }
  res.json(GetTipReceiptResponse.parse(tipDto(tip, worker)));
});

router.get("/companies/summary", async (_req, res): Promise<void> => {
  const { start, end } = monthRange();
  const [workerRows, tipRows] = await Promise.all([
    workers().find({}).toArray(),
    tips()
      .find({ createdAt: { $gte: start, $lt: end } })
      .toArray(),
  ]);
  const workerSummaries = workerRows.map((worker) => {
    const workerTips = tipRows.filter((tip) => tip.workerId === worker.id);
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
      monthFils: workerSummaries.reduce(
        (total, item) => total + item.monthFils,
        0,
      ),
      totalTips: workerSummaries.reduce(
        (total, item) => total + item.totalTips,
        0,
      ),
    }),
  );
});

router.get("/settlements", async (_req, res): Promise<void> => {
  const settlementRows = await settlements()
    .find({})
    .sort({ month: -1, updatedAt: -1 })
    .toArray();
  const workerIds = [...new Set(settlementRows.map((row) => row.workerId))];
  const workerRows = await workers()
    .find({ id: { $in: workerIds } })
    .toArray();
  const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
  res.json(
    ListSettlementsResponse.parse(
      settlementRows.flatMap((settlement) => {
        const worker = workerById.get(settlement.workerId);
        return worker ? [settlementDto(settlement, worker)] : [];
      }),
    ),
  );
});

router.post("/settlements", async (_req, res): Promise<void> => {
  const { month, start, end } = monthRange();
  const [workerRows, monthTips] = await Promise.all([
    workers().find({}).toArray(),
    tips()
      .find({ createdAt: { $gte: start, $lt: end } })
      .toArray(),
  ]);
  const rows = [];
  for (const worker of workerRows) {
    const amountFils = monthTips
      .filter((tip) => tip.workerId === worker.id)
      .reduce((total, tip) => total + tip.amountFils, 0);
    const id = await nextId("sanad_settlements");
    try {
      await settlements().updateOne(
        { workerId: worker.id, month },
        {
          $setOnInsert: {
            id,
            workerId: worker.id,
            month,
            amountFils,
            status: "pending",
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
    }
    const settlement = await settlements().findOne({
      workerId: worker.id,
      month,
    });
    if (settlement) rows.push(settlementDto(settlement, worker));
  }
  res.status(201).json(ListSettlementsResponse.parse(rows));
});

router.patch("/settlements/:id", async (req, res): Promise<void> => {
  const params = UpdateSettlementStatusParams.safeParse(req.params);
  const body = UpdateSettlementStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error:
        params.error?.message ??
        body.error?.message ??
        "Invalid settlement",
    });
    return;
  }

  const updated = await settlements().findOneAndUpdate(
    { id: params.data.id },
    { $set: { status: body.data.status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  const worker = await workers().findOne({ id: updated.workerId });
  if (!worker) {
    res.status(404).json({ error: "Settlement worker not found" });
    return;
  }
  res.json(
    UpdateSettlementStatusResponse.parse(
      settlementDto(updated, worker),
    ),
  );
});

router.get("/admin/overview", async (_req, res): Promise<void> => {
  const [workerRows, tipRows] = await Promise.all([
    workers().find({}).sort({ createdAt: -1 }).toArray(),
    tips().find({}).sort({ createdAt: -1 }).toArray(),
  ]);
  const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
  const recentTips = tipRows.flatMap((tip) => {
    const worker = workerById.get(tip.workerId);
    return worker ? [tipDto(tip, worker)] : [];
  });
  res.json(
    GetAdminOverviewResponse.parse({
      workerCount: workerRows.length,
      tipCount: tipRows.length,
      totalFils: tipRows.reduce((total, tip) => total + tip.amountFils, 0),
      workers: workerRows.map(workerDto),
      recentTips: recentTips.slice(0, 12),
    }),
  );
});

export default router;
