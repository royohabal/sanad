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
  CreateMyCompanyProfileBody,
  CreateMyCompanyProfileResponse,
  CreateCompanySettlementsBody,
  CreateCompanySettlementsResponse,
  CreateWorkerCompanyRequestBody,
  CreateWorkerCompanyRequestResponse,
  GetMyCompanyDashboardResponse,
  GetMyCompanyProfileResponse,
  ListApprovedCompaniesResponse,
  ListPendingCompaniesResponse,
  ReviewCompanyBody,
  ReviewCompanyParams,
  ReviewCompanyResponse,
  ReviewWorkerCompanyRequestBody,
  ReviewWorkerCompanyRequestParams,
  ReviewWorkerCompanyRequestResponse,
  UpdateCompanySettlementBody,
  UpdateCompanySettlementParams,
  UpdateCompanySettlementResponse,
} from "@workspace/api-zod";
import {
  requireAdmin,
  requireSignedIn,
  signedInUserId,
} from "../middleware/authz";
import { companySettlementTransitionAllowed } from "../lib/workerFinanceRules";

const router: IRouter = Router();
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const settlements = () =>
  getMongoDb().collection<SettlementRecord>("sanad_settlements");
const workerRequests = () =>
  getMongoDb().collection<WorkerCompanyRequestRecord>(
    "sanad_worker_company_requests",
  );

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function companyDto(company: CompanyRecord) {
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
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

function workerRequestDto(
  request: WorkerCompanyRequestRecord,
  company: CompanyRecord,
) {
  return {
    id: request.id,
    companyId: request.companyId,
    companyName: company.name,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  };
}

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
  return {
    month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end,
  };
}

function previousMonthRange(date = new Date()) {
  const current = monthRange(date);
  const start = new Date(
    Date.UTC(current.start.getUTCFullYear(), current.start.getUTCMonth() - 1, 1),
  );
  return {
    month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end: current.start,
  };
}

function monthBounds(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function workerBelongedToCompanyDuring(
  worker: WorkerRecord,
  companyId: number,
  start: Date,
  end: Date,
  hasCompanyTips: boolean,
) {
  if (hasCompanyTips) return true;
  const memberships = (worker.companyMemberships ?? []).filter(
    (membership) => membership.companyId === companyId,
  );
  if (memberships.length > 0) {
    return memberships.some(
      (membership) =>
        (membership.joinedAt == null || membership.joinedAt < end) &&
        (membership.leftAt == null || membership.leftAt >= start),
    );
  }
  return worker.companyId === companyId && worker.companyStatus === "approved";
}

function settlementDto(settlement: SettlementRecord, worker: WorkerRecord) {
  const [year, month] = settlement.month.split("-").map(Number);
  const periodValid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12;
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
    periodStart: periodValid ? `${settlement.month}-01` : null,
    periodEnd: periodValid
      ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
      : null,
    isLegacy: settlement.companyId == null,
    status: settlement.status,
    updatedAt: settlement.updatedAt.toISOString(),
  };
}

router.get("/companies/approved", async (_req, res): Promise<void> => {
  const rows = await companies()
    .find({ status: "approved" }, { projection: { id: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();
  res.json(
    ListApprovedCompaniesResponse.parse(
      rows.map(({ id, name }) => ({ id, name })),
    ),
  );
});

router.get(
  "/companies/me/profile",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    res.json(
      GetMyCompanyProfileResponse.parse({
        company: company ? companyDto(company) : null,
      }),
    );
  },
);

router.post(
  "/companies/me/profile",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = CreateMyCompanyProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const name = parsed.data.name.trim();
    if (name.length < 2) {
      res.status(400).json({ error: "Company name must be at least 2 characters." });
      return;
    }
    if (await companies().findOne({ ownerUserId: userId })) {
      res.status(409).json({ error: "This account already owns a company profile." });
      return;
    }

    const now = new Date();
    const company: CompanyRecord = {
      id: await nextId("sanad_companies"),
      ownerUserId: userId,
      name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await companies().insertOne(company);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({ error: "This account already owns a company profile." });
        return;
      }
      throw error;
    }
    res
      .status(201)
      .json(CreateMyCompanyProfileResponse.parse(companyDto(company)));
  },
);

router.get(
  "/companies/me/dashboard",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }

    const currentPeriod = monthRange();
    const priorPeriod = previousMonthRange();
    const members =
      company.status === "approved"
        ? await workers()
            .find({
              companyId: company.id,
              companyStatus: "approved",
              archivedAt: { $exists: false },
            })
            .sort({ createdAt: -1 })
            .toArray()
        : [];
    const [monthTips, priorTips, settlementRows, requestRows] = await Promise.all([
      company.status === "approved"
        ? tips()
            .find({
              payoutMethod: "company",
              payoutCompanyId: company.id,
              createdAt: {
                $gte: currentPeriod.start,
                $lt: currentPeriod.end,
              },
            })
            .toArray()
        : Promise.resolve([]),
      company.status === "approved"
        ? tips()
            .find({
              payoutMethod: "company",
              payoutCompanyId: company.id,
              createdAt: {
                $gte: priorPeriod.start,
                $lt: priorPeriod.end,
              },
            })
            .toArray()
        : Promise.resolve([]),
      settlements()
        .find({ companyId: company.id })
        .sort({ month: -1, updatedAt: -1 })
        .toArray(),
      company.status === "approved"
        ? workerRequests()
            .find({ companyId: company.id, status: "pending" })
            .sort({ createdAt: 1 })
            .toArray()
        : Promise.resolve([]),
    ]);

    const memberIds = members.map((worker) => worker.id);
    const previousEligibleTips =
      company.status === "approved"
        ? await tips()
            .find({
              payoutMethod: "company",
              payoutCompanyId: company.id,
              settlementId: { $exists: false },
              createdAt: {
                $gte: priorPeriod.start,
                $lt: priorPeriod.end,
              },
            })
            .toArray()
        : [];
    const statementWorkerIds = settlementRows.map(
      (settlement) => settlement.workerId,
    );
    const allWorkerIds = [
      ...new Set([
        ...memberIds,
        ...statementWorkerIds,
        ...previousEligibleTips.map((tip) => tip.workerId),
      ]),
    ];
    const workerRows = allWorkerIds.length
      ? await workers().find({ id: { $in: allWorkerIds } }).toArray()
      : [];
    const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
    const currentMonthTipByWorker = new Map<number, TipRecord[]>();
    for (const tip of monthTips) {
      const list = currentMonthTipByWorker.get(tip.workerId) ?? [];
      list.push(tip);
      currentMonthTipByWorker.set(tip.workerId, list);
    }
    const priorMonthTipByWorker = new Map<number, TipRecord[]>();
    for (const tip of priorTips) {
      const list = priorMonthTipByWorker.get(tip.workerId) ?? [];
      list.push(tip);
      priorMonthTipByWorker.set(tip.workerId, list);
    }
    const eligibleTipByWorker = new Map<number, TipRecord[]>();
    for (const tip of previousEligibleTips) {
      const list = eligibleTipByWorker.get(tip.workerId) ?? [];
      list.push(tip);
      eligibleTipByWorker.set(tip.workerId, list);
    }
    const nextSettlementDate = new Date(
      Date.UTC(
        currentPeriod.start.getUTCFullYear(),
        currentPeriod.start.getUTCMonth() + 1,
        1,
      ),
    )
      .toISOString()
      .slice(0, 10);
    const workerSummaries = members.map((worker) => {
      const workerTips = currentMonthTipByWorker.get(worker.id) ?? [];
      const priorWorkerTips = priorMonthTipByWorker.get(worker.id) ?? [];
      const ratings = workerTips.flatMap((tip) =>
        tip.rating == null ? [] : [tip.rating],
      );
      return {
        worker: publicWorkerDto(worker),
        monthFils: workerTips.reduce((total, tip) => total + tip.amountFils, 0),
        previousMonthFils: priorWorkerTips.reduce(
          (total, tip) => total + tip.amountFils,
          0,
        ),
        totalTips: workerTips.length,
        averageRating:
          ratings.length > 0
            ? Math.round(
                (ratings.reduce((total, rating) => total + rating, 0) /
                  ratings.length) *
                  10,
              ) / 10
            : null,
        settlements: settlementRows
          .filter((settlement) => settlement.workerId === worker.id)
          .map((settlement) => settlementDto(settlement, worker)),
        estimatedNextSettlement: nextSettlementDate,
      };
    });

    const requests = requestRows.flatMap((request) => {
      const worker = workerById.get(request.workerId);
      return worker
        ? [
            {
              id: request.id,
              worker: publicWorkerDto(worker),
              status: request.status,
              createdAt: request.createdAt.toISOString(),
            },
          ]
        : [];
    });

    const alreadySettledPriorWorkerIds = new Set(
      settlementRows
        .filter((settlement) => settlement.month === priorPeriod.month)
        .map((settlement) => settlement.workerId),
    );
    const priorPeriodMemberIds = members
      .filter((worker) =>
        workerBelongedToCompanyDuring(
          worker,
          company.id,
          priorPeriod.start,
          priorPeriod.end,
          false,
        ),
      )
      .map((worker) => worker.id);
    const settlementCandidates = [...new Set([
      ...priorPeriodMemberIds,
      ...previousEligibleTips.map((tip) => tip.workerId),
    ])]
      .filter((workerId) => !alreadySettledPriorWorkerIds.has(workerId))
      .flatMap((workerId) => {
        const worker = workerById.get(workerId);
        if (!worker) return [];
        const candidateTips = eligibleTipByWorker.get(workerId) ?? [];
        return [
          {
            workerId,
            worker: publicWorkerDto(worker),
            month: priorPeriod.month,
            tipsFils: candidateTips.reduce(
              (total, tip) => total + tip.amountFils,
              0,
            ),
            tipCount: candidateTips.length,
          },
        ];
      });
    const settlementDtos = settlementRows.flatMap((settlement) => {
      const worker = workerById.get(settlement.workerId);
      return worker ? [settlementDto(settlement, worker)] : [];
    });

    res.json(
      GetMyCompanyDashboardResponse.parse({
        company: companyDto(company),
        workers: workerSummaries,
        requests,
        monthFils: monthTips.reduce((total, tip) => total + tip.amountFils, 0),
        previousMonthFils: priorTips.reduce(
          (total, tip) => total + tip.amountFils,
          0,
        ),
        totalTips: monthTips.length,
        settlements: settlementDtos,
        settlementCandidates,
        settlementMonth: priorPeriod.month,
      }),
    );
  },
);

router.post(
  "/companies/me/settlements",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = CreateCompanySettlementsBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }
    if (company.status !== "approved") {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    if (body.data.month >= monthRange().month) {
      res.status(400).json({
        error: "Company statements can only be generated for a completed month.",
      });
      return;
    }
    const workerIds = body.data.workers.map((item) => item.workerId);
    if (new Set(workerIds).size !== workerIds.length) {
      res.status(400).json({ error: "A worker may appear only once per statement batch." });
      return;
    }
    const period = monthBounds(body.data.month);
    if (!period) {
      res.status(400).json({ error: "Invalid settlement month." });
      return;
    }

    class CompanySettlementConflictError extends Error {}
    class CompanySettlementAccessError extends Error {}
    class CompanySettlementInputError extends Error {}
    let outcome:
      | { kind: "created"; statements: SettlementRecord[]; workers: WorkerRecord[] }
      | { kind: "duplicate" }
      | { kind: "forbidden" }
      | { kind: "invalid"; message: string };
    try {
      outcome = await withMongoTransaction(async (session) => {
        const currentCompany = await companies().findOne(
          { id: company.id, ownerUserId: userId, status: "approved" },
          { session },
        );
        if (!currentCompany) return { kind: "forbidden" as const };
        const existing = await settlements()
          .find(
            {
              companyId: company.id,
              month: body.data.month,
              workerId: { $in: workerIds },
            },
            { session, projection: { id: 1 } },
          )
          .toArray();
        if (existing.length > 0) return { kind: "duplicate" as const };

        const [workerRows, eligibleTipRows] = await Promise.all([
          workers()
            .find({ id: { $in: workerIds } }, { session })
            .toArray(),
          tips()
            .find(
              {
                workerId: { $in: workerIds },
                payoutMethod: "company",
                payoutCompanyId: company.id,
                createdAt: { $gte: period.start, $lt: period.end },
                settlementId: { $exists: false },
              },
              { session },
            )
            .toArray(),
        ]);
        const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
        const tipsByWorker = new Map<number, TipRecord[]>();
        for (const tip of eligibleTipRows) {
          const list = tipsByWorker.get(tip.workerId) ?? [];
          list.push(tip);
          tipsByWorker.set(tip.workerId, list);
        }

        const prepared: Array<{
          worker: WorkerRecord;
          salaryFils: number;
          tipsFils: number;
          adjustmentsFils: number;
          amountFils: number;
          eligibleTips: TipRecord[];
        }> = [];
        for (const item of body.data.workers) {
          const worker = workerById.get(item.workerId);
          const eligibleTips = tipsByWorker.get(item.workerId) ?? [];
          if (
            !worker ||
            !workerBelongedToCompanyDuring(
              worker,
              company.id,
              period.start,
              period.end,
              eligibleTips.length > 0,
            )
          ) {
            throw new CompanySettlementAccessError();
          }
          const tipsFils = eligibleTips.reduce(
            (total, tip) => total + tip.amountFils,
            0,
          );
          if (
            !Number.isSafeInteger(item.salaryFils) ||
            item.salaryFils < 0 ||
            !Number.isSafeInteger(item.adjustmentsFils)
          ) {
            throw new CompanySettlementInputError(
              "Salary must be a non-negative whole-fils amount and adjustments must be whole fils.",
            );
          }
          const amountFils =
            item.salaryFils + tipsFils + item.adjustmentsFils;
          if (!Number.isSafeInteger(amountFils) || amountFils < 0) {
            throw new CompanySettlementInputError(
              "Salary, tips, and adjustments must produce a non-negative KWD total.",
            );
          }
          if (amountFils === 0 && eligibleTips.length === 0) continue;
          prepared.push({
            worker,
            salaryFils: item.salaryFils,
            tipsFils,
            adjustmentsFils: item.adjustmentsFils,
            amountFils,
            eligibleTips,
          });
        }
        if (prepared.length === 0) {
          throw new CompanySettlementInputError(
            "Add a salary, adjustment, or eligible tip amount before creating statements.",
          );
        }

        const now = new Date();
        const records: SettlementRecord[] = [];
        for (const item of prepared) {
          const record: SettlementRecord = {
            id: await nextId("sanad_settlements", session),
            workerId: item.worker.id,
            companyId: company.id,
            companyName: company.name,
            month: body.data.month,
            salaryFils: item.salaryFils,
            tipsFils: item.tipsFils,
            adjustmentsFils: item.adjustmentsFils,
            amountFils: item.amountFils,
            tipCount: item.eligibleTips.length,
            tipIds: item.eligibleTips.map((tip) => tip.id),
            createdByUserId: userId,
            createdAt: now,
            status: "pending",
            statusHistory: [
              { status: "pending", changedByUserId: userId, changedAt: now },
            ],
            updatedAt: now,
          };
          await settlements().insertOne(record, { session });
          if (item.eligibleTips.length > 0) {
            const linkedTips = await tips().updateMany(
              {
                id: { $in: item.eligibleTips.map((tip) => tip.id) },
                workerId: item.worker.id,
                payoutMethod: "company",
                payoutCompanyId: company.id,
                settlementId: { $exists: false },
              },
              { $set: { settlementId: record.id } },
              { session },
            );
            if (linkedTips.modifiedCount !== item.eligibleTips.length) {
              throw new CompanySettlementConflictError();
            }
          }
          records.push(record);
        }
        return {
          kind: "created" as const,
          statements: records,
          workers: prepared.map((item) => item.worker),
        };
      });
    } catch (error) {
      if (error instanceof CompanySettlementConflictError || isDuplicateKeyError(error)) {
        res.status(409).json({
          error: "A statement or tip allocation changed while this batch was being saved.",
        });
        return;
      }
      if (error instanceof CompanySettlementAccessError) {
        res.status(403).json({
          error: "This company can only create statements for its current or historical workers.",
        });
        return;
      }
      if (error instanceof CompanySettlementInputError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (outcome.kind === "forbidden") {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    if (outcome.kind === "duplicate") {
      res.status(409).json({
        error: "A statement already exists for one or more workers in this month.",
      });
      return;
    }
    const workerById = new Map(outcome.workers.map((worker) => [worker.id, worker]));
    res.status(201).json(
      CreateCompanySettlementsResponse.parse(
        outcome.statements.flatMap((statement) => {
          const worker = workerById.get(statement.workerId);
          return worker ? [settlementDto(statement, worker)] : [];
        }),
      ),
    );
  },
);

router.patch(
  "/companies/me/settlements/:id",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = UpdateCompanySettlementParams.safeParse(req.params);
    const body = UpdateCompanySettlementBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          params.error?.message ??
          body.error?.message ??
          "Invalid settlement update.",
      });
      return;
    }
    const company = await companies().findOne({
      ownerUserId: userId,
      status: "approved",
    });
    if (!company) {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const existing = await settlements().findOne({
      id: params.data.id,
      companyId: company.id,
    });
    if (!existing) {
      res.status(404).json({ error: "Settlement not found for this company." });
      return;
    }
    if (
      !companySettlementTransitionAllowed(
        existing.status as
          | "pending"
          | "approved"
          | "processing"
          | "paid"
          | "rejected",
        body.data.status,
      )
    ) {
      res.status(409).json({ error: "This settlement status transition is not allowed." });
      return;
    }
    if (existing.status === body.data.status) {
      const worker = await workers().findOne({ id: existing.workerId });
      if (!worker) {
        res.status(404).json({ error: "Settlement worker not found." });
        return;
      }
      res.json(
        UpdateCompanySettlementResponse.parse(
          settlementDto(existing, worker),
        ),
      );
      return;
    }
    const now = new Date();
    const updated = await settlements().findOneAndUpdate(
      {
        id: existing.id,
        companyId: company.id,
        status: existing.status,
      },
      {
        $set: { status: body.data.status, updatedAt: now },
        $push: {
          statusHistory: {
            status: body.data.status,
            changedByUserId: userId,
            changedAt: now,
          },
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) {
      res.status(409).json({ error: "This settlement status changed. Refresh and retry." });
      return;
    }
    const worker = await workers().findOne({ id: updated.workerId });
    if (!worker) {
      res.status(404).json({ error: "Settlement worker not found." });
      return;
    }
    res.json(
      UpdateCompanySettlementResponse.parse(settlementDto(updated, worker)),
    );
  },
);

router.patch(
  "/companies/me/worker-requests/:id",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = ReviewWorkerCompanyRequestParams.safeParse(req.params);
    const body = ReviewWorkerCompanyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.error?.message ?? body.error?.message ?? "Invalid request.",
      });
      return;
    }

    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }
    if (company.status !== "approved") {
      res.status(403).json({ error: "Company approval is required first." });
      return;
    }

    class AssociationChangedError extends Error {}
    let outcome: "ok" | "not-found" | "conflict";
    try {
      outcome = await withMongoTransaction(async (session) => {
        const request = await workerRequests().findOne(
          { id: params.data.id, companyId: company.id },
          { session },
        );
        if (!request) return "not-found";
        if (request.status !== "pending") return "conflict";
        const worker = await workers().findOne(
          {
            id: request.workerId,
            requestedCompanyId: company.id,
            companyStatus: "pending",
          },
          { session },
        );
        if (!worker || worker.companyId != null) return "conflict";

        const now = new Date();
        const requestUpdate = await workerRequests().updateOne(
          { id: request.id, companyId: company.id, status: "pending" },
          { $set: { status: body.data.status, updatedAt: now } },
          { session },
        );
        if (requestUpdate.modifiedCount !== 1) return "conflict";

        const workerUpdate =
          body.data.status === "approved"
            ? await workers().updateOne(
                {
                  id: worker.id,
                  requestedCompanyId: company.id,
                  companyStatus: "pending",
                  companyId: { $exists: false },
                },
                {
                  $set: {
                    companyId: company.id,
                    company: company.name,
                    companyStatus: "approved",
                  },
                  $push: {
                    companyMemberships: {
                      companyId: company.id,
                      companyName: company.name,
                      joinedAt: now,
                    },
                  },
                  $inc: { walletVersion: 1 },
                  $unset: { requestedCompanyId: "" },
                },
                { session },
              )
            : await workers().updateOne(
                {
                  id: worker.id,
                  requestedCompanyId: company.id,
                  companyStatus: "pending",
                },
                {
                  $set: { companyStatus: "rejected" },
                  $unset: { requestedCompanyId: "" },
                },
                { session },
              );
        if (workerUpdate.modifiedCount !== 1) throw new AssociationChangedError();
        return "ok";
      });
    } catch (error) {
      if (!(error instanceof AssociationChangedError)) throw error;
      outcome = "conflict";
    }
    if (outcome === "not-found") {
      res.status(404).json({ error: "Request not found for this company." });
      return;
    }
    if (outcome === "conflict") {
      res.status(409).json({ error: "Request is no longer pending." });
      return;
    }

    const reviewedRequest = await workerRequests().findOne({
      id: params.data.id,
      companyId: company.id,
    });
    const reviewedWorker = reviewedRequest
      ? await workers().findOne({ id: reviewedRequest.workerId })
      : null;
    if (!reviewedRequest || !reviewedWorker) {
      res.status(404).json({ error: "Request not found for this company." });
      return;
    }
    res.json(
      ReviewWorkerCompanyRequestResponse.parse({
        id: reviewedRequest.id,
        worker: publicWorkerDto(reviewedWorker),
        status: reviewedRequest.status,
        createdAt: reviewedRequest.createdAt.toISOString(),
      }),
    );
  },
);

router.get(
  "/admin/companies",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await companies()
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(
      ListPendingCompaniesResponse.parse(rows.map(companyDto)),
    );
  },
);

router.patch(
  "/admin/companies/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ReviewCompanyParams.safeParse(req.params);
    const body = ReviewCompanyBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.error?.message ?? body.error?.message ?? "Invalid review.",
      });
      return;
    }

    const updated = await companies().findOneAndUpdate(
      { id: params.data.id, status: "pending" },
      { $set: { status: body.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) {
      const company = await companies().findOne({ id: params.data.id });
      if (!company) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      res.status(409).json({ error: "Company is no longer pending." });
      return;
    }
    res.json(
      ReviewCompanyResponse.parse(companyDto(updated)),
    );
  },
);

router.post(
  "/workers/me/company-requests",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = CreateWorkerCompanyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const company = await companies().findOne({
      id: body.data.companyId,
      status: "approved",
    });
    if (!company) {
      res.status(404).json({ error: "Approved company not found." });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    if (
      worker.companyId != null ||
      worker.companyStatus === "pending" ||
      (await workerRequests().findOne({ workerId: worker.id, status: "pending" }))
    ) {
      res.status(409).json({ error: "This worker already has a company association or pending request." });
      return;
    }

    const request: WorkerCompanyRequestRecord = {
      id: await nextId("sanad_worker_company_requests"),
      workerId: worker.id,
      companyId: company.id,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await withMongoTransaction(async (session) => {
        await workerRequests().insertOne(request, { session });
        const result = await workers().updateOne(
          {
            id: worker.id,
            ownerUserId: userId,
            companyId: { $exists: false },
            companyStatus: { $ne: "pending" },
          },
          {
            $set: {
              companyStatus: "pending",
              requestedCompanyId: company.id,
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1) throw new Error("Worker association changed.");
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({ error: "A company request is already pending." });
        return;
      }
      if (error instanceof Error && error.message === "Worker association changed.") {
        res.status(409).json({ error: "This worker already has a company association or pending request." });
        return;
      }
      throw error;
    }
    res
      .status(201)
      .json(
        CreateWorkerCompanyRequestResponse.parse(
          workerRequestDto(request, company),
        ),
      );
  },
);

export default router;
