import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type CompanyRecord,
  type SettlementRecord,
  type TipRecord,
  type WorkerCompanyRequestRecord,
  type WorkerRecord,
} from "@workspace/db";
import {
  CreateMyWorkerProfileBody,
  CreateMyWorkerProfileResponse,
  CreateWorkerBody,
  CreateWorkerResponse,
  DeleteWorkerParams,
  GetAdminOverviewResponse,
  GetCompanySummaryResponse,
  GetMyWorkerDashboardResponse,
  GetMyWorkerProfileResponse,
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
import {
  isAdminUser,
  requireAdmin,
  requireSignedIn,
  signedInUserId,
} from "../middleware/authz";
import { rateLimitPublicRequests } from "../lib/publicRateLimit";
import {
  appendWorkerLedgerEvent,
  minimumWorkerWithdrawalFils,
  workerLedgerBalance,
  workerWithdrawalDto,
  workerWithdrawals,
} from "../lib/workerFinance";

const router: IRouter = Router();
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const settlements = () =>
  getMongoDb().collection<SettlementRecord>("sanad_settlements");
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const workerCompanyRequests = () =>
  getMongoDb().collection<WorkerCompanyRequestRecord>(
    "sanad_worker_company_requests",
  );

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
    customerName: tip.customerName?.trim() || "Anonymous",
    amountFils: tip.amountFils,
    rating: tip.rating,
    message: tip.message,
    status: tip.status === "paid" ? "paid" as const : "demo_completed" as const,
    createdAt: tip.createdAt.toISOString(),
  };
}

function settlementDto(settlement: SettlementRecord, worker: WorkerRecord) {
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(settlement.month);
  const periodStart = monthMatch
    ? `${settlement.month}-01`
    : null;
  const periodEnd = monthMatch
    ? new Date(
        Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 0),
      )
        .toISOString()
        .slice(0, 10)
    : null;
  return {
    id: settlement.id,
    publicId: worker.publicId,
    workerName: worker.name,
    month: settlement.month,
    amountFils: settlement.amountFils,
    companyName: settlement.companyName ?? null,
    salaryFils: settlement.salaryFils ?? null,
    tipsFils: settlement.tipsFils ?? null,
    adjustmentsFils: settlement.adjustmentsFils ?? null,
    tipCount: settlement.tipCount ?? null,
    periodStart,
    periodEnd,
    isLegacy: settlement.companyId == null,
    status: settlement.status,
    updatedAt: settlement.updatedAt.toISOString(),
  };
}

async function workerDashboardData(worker: WorkerRecord) {
  const workerTips = await tips()
    .find({ workerId: worker.id })
    .sort({ createdAt: -1 })
    .toArray();
  const { month, start, end } = monthRange();
  const previousStart = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
  );
  const monthlyFils = workerTips
    .filter((tip) => tip.createdAt >= start && tip.createdAt < end)
    .reduce((total, tip) => total + tip.amountFils, 0);
  const previousMonthTipsFils = workerTips
    .filter((tip) => tip.createdAt >= previousStart && tip.createdAt < start)
    .reduce((total, tip) => total + tip.amountFils, 0);
  const currentMonthIndependentTipsFils = workerTips
    .filter(
      (tip) =>
        tip.createdAt >= start &&
        tip.createdAt < end &&
        tip.payoutMethod === "independent",
    )
    .reduce((total, tip) => total + tip.amountFils, 0);
  const currentMonthCompanyTipsFils = workerTips
    .filter(
      (tip) =>
        tip.createdAt >= start &&
        tip.createdAt < end &&
        tip.payoutMethod === "company",
    )
    .reduce((total, tip) => total + tip.amountFils, 0);
  const independentTipsFils = workerTips
    .filter((tip) => tip.payoutMethod === "independent")
    .reduce((total, tip) => total + tip.amountFils, 0);
  const companyTipsFils = workerTips
    .filter((tip) => tip.payoutMethod === "company")
    .reduce((total, tip) => total + tip.amountFils, 0);
  const legacyUnassignedFils = workerTips
    .filter((tip) => tip.payoutMethod == null)
    .reduce((total, tip) => total + tip.amountFils, 0);
  const ratings = workerTips.flatMap((tip) =>
    tip.rating == null ? [] : [tip.rating],
  );
  const [
    settlementHistory,
    availableFils,
    withdrawalRows,
    reservedRows,
  ] = await Promise.all([
    settlements().find({ workerId: worker.id }).sort({ month: -1, updatedAt: -1 }).toArray(),
    workerLedgerBalance(worker.id),
    workerWithdrawals()
      .find({ workerId: worker.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    workerWithdrawals()
      .aggregate<{ reservedFils: number }>([
        {
          $match: {
            workerId: worker.id,
            status: { $in: ["pending", "processing"] },
          },
        },
        { $group: { _id: null, reservedFils: { $sum: "$amountFils" } } },
      ])
      .next(),
  ]);
  const settlement = settlementHistory[0];
  const companyName =
    worker.companyId != null && worker.companyStatus === "approved"
      ? worker.company
      : null;
  const legacyCompanyIds = [
    ...new Set([
      ...(worker.companyId != null && worker.companyStatus === "approved"
        ? [worker.companyId]
        : []),
      ...(worker.companyMemberships ?? []).map(
        (membership) => membership.companyId,
      ),
    ]),
  ];
  const legacyCompanies = legacyCompanyIds.length
    ? await companies()
        .find(
          { id: { $in: legacyCompanyIds }, status: "approved" },
          { projection: { id: 1, name: 1 } },
        )
        .sort({ name: 1 })
        .toArray()
    : [];
  const estimatedNextSettlement =
    companyName || currentMonthCompanyTipsFils > 0
      ? new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
        )
          .toISOString()
          .slice(0, 10)
      : null;

  return {
    worker: publicWorkerDto(worker),
    monthlyFils,
    currentMonthIndependentTipsFils,
    currentMonthCompanyTipsFils,
    previousMonthTipsFils,
    estimatedNextSettlement,
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
    settlements: settlementHistory.map((item) => settlementDto(item, worker)),
    settlementStatus: settlement?.status ?? "pending",
    qrUrl: `/tip/${worker.publicId}`,
    wallet: {
      availableFils,
      reservedFils: reservedRows?.reservedFils ?? 0,
      independentTipsFils,
      companyTipsFils,
      legacyUnassignedFils,
      minimumWithdrawalFils: minimumWorkerWithdrawalFils(),
      payoutMethod: companyName ? "company" : "independent",
      companyName,
      legacyCompanies: legacyCompanies.map(({ id, name }) => ({ id, name })),
      demoPayoutProfile: worker.demoPayoutProfile
        ? {
            bankName: worker.demoPayoutProfile.bankName,
            accountLabel: worker.demoPayoutProfile.accountLabel,
            updatedAt: worker.demoPayoutProfile.updatedAt.toISOString(),
          }
        : null,
      withdrawals: withdrawalRows.map(workerWithdrawalDto),
    },
  };
}

async function workerProfileState(worker: WorkerRecord | null) {
  const accountStatus = worker?.workerAccountStatus ??
    (worker?.companyId != null && worker.companyStatus === "approved"
      ? "active"
      : "none");
  const visibleWorker = accountStatus === "none" ? null : worker;
  const request = worker
    ? await workerCompanyRequests()
        .find({ workerId: worker.id })
        .sort({ createdAt: -1 })
        .limit(1)
        .next()
    : null;
  const company = request
    ? await companies().findOne({ id: request.companyId })
    : null;
  return {
    worker: visibleWorker ? workerDto(visibleWorker) : null,
    companyStatus:
      accountStatus === "active"
        ? worker?.companyStatus ?? "approved"
        : worker?.companyStatus ?? "none",
    accountStatus,
    companyRequest:
      request && company
        ? {
            id: request.id,
            companyId: request.companyId,
            companyName: company.name,
            status: request.status,
            createdAt: request.createdAt.toISOString(),
          }
        : null,
  };
}

router.get("/workers", async (_req, res): Promise<void> => {
  const approvedCompanies = await companies()
    .find({ status: "approved" }, { projection: { id: 1 } })
    .toArray();
  const rows = await workers()
    .find({
      companyId: { $in: approvedCompanies.map((company) => company.id) },
      companyStatus: "approved",
      archivedAt: { $exists: false },
      $or: [
        { workerAccountStatus: "active" },
        { workerAccountStatus: { $exists: false } },
      ],
    })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(ListWorkersResponse.parse(rows.map(workerDto)));
});

router.get(
  "/workers/me/profile",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    res.json(
      GetMyWorkerProfileResponse.parse(await workerProfileState(worker)),
    );
  },
);

router.post(
  "/workers/me/profile",
  requireSignedIn,
  async (_req, res): Promise<void> => {
    res.status(410).json({
      error: "Worker profiles are created by approved companies through email invitations.",
    });
  },
);

router.post("/workers", requireAdmin, (_req, res): void => {
  res.status(410).json({
    error: "Only approved companies can create worker profiles and send invitations.",
  });
});

router.get("/workers/:publicId", async (req, res): Promise<void> => {
  const params = GetWorkerByPublicIdParams.safeParse(req.params);
  if (!params.data) {
    res.status(400).json({ error: params.error?.message || "Invalid worker identifier." });
    return;
  }
  if (!isPublicId(params.data.publicId)) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const worker = await workers().findOne({
    publicId: params.data.publicId,
    archivedAt: { $exists: false },
    companyStatus: "approved",
    companyId: { $exists: true },
    $or: [
      { workerAccountStatus: "active" },
      { workerAccountStatus: { $exists: false } },
    ],
  });
  const approvedCompany =
    worker?.companyId != null
      ? await companies().findOne({ id: worker.companyId, status: "approved" })
      : null;
  if (!worker || !approvedCompany) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.json(
    GetWorkerByPublicIdResponse.parse(publicWorkerDto(worker)),
  );
});

router.delete(
  "/workers/:publicId",
  requireAdmin,
  async (_req, res): Promise<void> => {
    res.status(410).json({
      error: "Worker history is retained; use company deactivation instead.",
    });
  },
);

router.get(
  "/workers/me/dashboard",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    const accountStatus = worker.workerAccountStatus ??
      (worker.companyId != null && worker.companyStatus === "approved"
        ? "active"
        : "none");
    if (accountStatus === "none" || accountStatus === "invited") {
      res.status(403).json({ error: "An active company invitation is required." });
      return;
    }
    res.json(
      GetMyWorkerDashboardResponse.parse(await workerDashboardData(worker)),
    );
  },
);

router.get(
  "/workers/:publicId/dashboard",
  requireSignedIn,
  async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
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
    archivedAt: { $exists: false },
  });
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  if (
    worker.ownerUserId !== userId &&
    !(await isAdminUser(userId))
  ) {
    res.status(404).json({ error: "Worker not found." });
    return;
  }
  res.json(
    GetWorkerDashboardResponse.parse(await workerDashboardData(worker)),
  );
  },
);

router.post("/tips", (_req, res): void => {
  res.status(410).json({
    error: "Direct tip writes are disabled. Start a SANAD checkout instead.",
  });
});

router.get(
  "/tips",
  requireAdmin,
  async (req, res): Promise<void> => {
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
  },
);

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

router.get(
  "/companies/summary",
  requireAdmin,
  async (_req, res): Promise<void> => {
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
  },
);

router.get("/settlements", requireAdmin, async (_req, res): Promise<void> => {
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

router.post("/settlements", requireAdmin, async (_req, res): Promise<void> => {
  res.status(409).json({
    error:
      "Legacy platform-wide settlement previews are disabled. Companies create statements from eligible, company-routed tips in their own workspace.",
  });
});

router.patch(
  "/settlements/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
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
    { id: params.data.id, companyId: { $exists: false } },
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
  },
);

router.get(
  "/admin/overview",
  requireAdmin,
  async (_req, res): Promise<void> => {
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
  },
);

export default router;
