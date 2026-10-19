import { Router, type IRouter } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type CompanyRecord,
  type TipRecord,
  type WorkerCompanyRequestRecord,
  type WorkerRecord,
  type WorkerWithdrawalRecord,
} from "@workspace/db";
import {
  AssignLegacyWorkerTipsBody,
  AssignLegacyWorkerTipsResponse,
  CancelWorkerWithdrawalParams,
  CancelWorkerWithdrawalResponse,
  CreateWorkerWithdrawalBody,
  CreateWorkerWithdrawalResponse,
  GetWorkerWalletTransactionsQueryParams,
  GetWorkerWalletTransactionsResponse,
  LeaveWorkerCompanyResponse,
  ListAdminWorkerWithdrawalsResponse,
  UpdateAdminWorkerWithdrawalBody,
  UpdateAdminWorkerWithdrawalParams,
  UpdateAdminWorkerWithdrawalResponse,
  UpdateWorkerDemoPayoutProfileBody,
  UpdateWorkerDemoPayoutProfileResponse,
} from "@workspace/api-zod";
import {
  requireAdmin,
  requireSignedIn,
  signedInUserId,
} from "../middleware/authz";
import {
  appendWorkerLedgerEvent,
  minimumWorkerWithdrawalFils,
  workerWithdrawalTransitionAllowed,
  workerLedgerBalance,
  withdrawalAmountError,
  workerWalletLedger,
  workerWithdrawalDto,
  workerWithdrawals,
} from "../lib/workerFinance";

const router: IRouter = Router();
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const workerCompanyRequests = () =>
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

function isSensitiveDemoLabel(value: string): boolean {
  return (
    /\d{7,}/.test(value) ||
    /[A-Z]{2}\d{2}[A-Z0-9]{10,}/i.test(value) ||
    /\b(iban|account number|routing number|password|pin)\b/i.test(value)
  );
}

function workerProfileDto(worker: WorkerRecord) {
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

async function workerProfileState(worker: WorkerRecord) {
  const request = await workerCompanyRequests()
    .find({ workerId: worker.id })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
  const company = request
    ? await companies().findOne({ id: request.companyId })
    : null;
  return {
    worker: workerProfileDto(worker),
    companyStatus: worker.companyStatus ?? "none",
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

router.put(
  "/workers/me/wallet/demo-payout",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = UpdateWorkerDemoPayoutProfileBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const accountLabel = body.data.accountLabel.trim();
    if (accountLabel.length < 2 || isSensitiveDemoLabel(accountLabel)) {
      res.status(400).json({
        error:
          "Use a short demo account label only. Account numbers, IBANs, credentials, and real banking details are not accepted.",
      });
      return;
    }

    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    const demoPayoutProfile = {
      bankName: body.data.bankName,
      accountLabel,
      updatedAt: new Date(),
    };
    await workers().updateOne(
      { id: worker.id, ownerUserId: userId },
      { $set: { demoPayoutProfile } },
    );
    res.json(
      UpdateWorkerDemoPayoutProfileResponse.parse({
        demoPayoutProfile: {
          ...demoPayoutProfile,
          updatedAt: demoPayoutProfile.updatedAt.toISOString(),
        },
      }),
    );
  },
);

router.post(
  "/workers/me/wallet/legacy-tip-route",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = AssignLegacyWorkerTipsBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }

    let company: CompanyRecord | null = null;
    if (body.data.payoutMethod === "company") {
      const availableCompanyIds = new Set([
        ...(worker.companyId != null && worker.companyStatus === "approved"
          ? [worker.companyId]
          : []),
        ...(worker.companyMemberships ?? []).map(
          (membership) => membership.companyId,
        ),
      ]);
      const selectedCompanyId =
        body.data.companyId ??
        (worker.companyId != null && worker.companyStatus === "approved"
          ? worker.companyId
          : availableCompanyIds.size === 1
            ? [...availableCompanyIds][0]
            : null);
      const hasMembership =
        selectedCompanyId != null &&
        (worker.companyId === selectedCompanyId &&
          worker.companyStatus === "approved" ||
          (worker.companyMemberships ?? []).some(
            (membership) => membership.companyId === selectedCompanyId,
          ));
      if (!selectedCompanyId || !hasMembership) {
        res.status(409).json({
          error: "Choose a company you are currently or historically associated with.",
        });
        return;
      }
      company = await companies().findOne({
        id: selectedCompanyId,
        status: "approved",
      });
      if (!company) {
        res.status(409).json({
          error: "This company is not currently approved for SANAD statements.",
        });
        return;
      }
    }

    const assignment = await withMongoTransaction(async (session) => {
      await workers().updateOne(
        { id: worker.id, ownerUserId: userId },
        { $inc: { walletVersion: 1 } },
        { session },
      );
      const legacyTips = await tips()
        .find(
          { workerId: worker.id, payoutMethod: { $exists: false } },
          { session },
        )
        .toArray();
      const routeTips =
        body.data.payoutMethod === "company" && company
          ? legacyTips.filter((tip) => {
              const memberships = (worker.companyMemberships ?? []).filter(
                (membership) => membership.companyId === company!.id,
              );
              if (
                memberships.length === 0 &&
                worker.companyId === company!.id &&
                worker.companyStatus === "approved"
              ) {
                return true;
              }
              return memberships.some(
                (membership) =>
                  (membership.joinedAt == null ||
                    tip.createdAt >= membership.joinedAt) &&
                  (membership.leftAt == null ||
                    tip.createdAt <= membership.leftAt),
              );
            })
          : legacyTips;
      let assignedCount = 0;
      let assignedAmountFils = 0;
      for (const tip of routeTips) {
        const payoutFields =
          body.data.payoutMethod === "company" && company
            ? {
                payoutMethod: "company" as const,
                payoutCompanyId: company.id,
                payoutCompanyName: company.name,
              }
            : { payoutMethod: "independent" as const };
        const result = await tips().updateOne(
          { id: tip.id, payoutMethod: { $exists: false } },
          { $set: payoutFields },
          { session },
        );
        if (result.modifiedCount !== 1) continue;
        assignedCount += 1;
        assignedAmountFils += tip.amountFils;
        if (payoutFields.payoutMethod === "independent") {
          await appendWorkerLedgerEvent({
            workerId: worker.id,
            kind: "tip_credit",
            amountFils: tip.amountFils,
            sourceKey: `worker:${worker.id}:tip:${tip.id}:credit`,
            reference: tip.reference,
            description: "Older demo tip assigned to independent wallet",
            session,
          });
        }
      }
      return { assignedCount, assignedAmountFils };
    });

    res.json(
      AssignLegacyWorkerTipsResponse.parse({
        ...assignment,
        payoutMethod: body.data.payoutMethod,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
      }),
    );
  },
);

router.get(
  "/workers/me/wallet/transactions",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const query = GetWorkerWalletTransactionsQueryParams.safeParse(req.query);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }

    const filter = { workerId: worker.id };
    const [rows, total] = await Promise.all([
      workerWalletLedger()
        .find(filter)
        .sort({ createdAt: -1, id: -1 })
        .skip((query.data.page - 1) * query.data.pageSize)
        .limit(query.data.pageSize)
        .toArray(),
      workerWalletLedger().countDocuments(filter),
    ]);
    res.json(
      GetWorkerWalletTransactionsResponse.parse({
        items: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          amountFils: row.amountFils,
          reference: row.reference,
          description: row.description,
          createdAt: row.createdAt.toISOString(),
        })),
        page: query.data.page,
        pageSize: query.data.pageSize,
        total,
        hasMore: query.data.page * query.data.pageSize < total,
      }),
    );
  },
);

router.post(
  "/workers/me/withdrawals",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = CreateWorkerWithdrawalBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    if (!worker.demoPayoutProfile) {
      res.status(400).json({
        error: "Save a demo payout profile before requesting a withdrawal.",
      });
      return;
    }

    const existing = await workerWithdrawals().findOne({
      workerId: worker.id,
      idempotencyKey: body.data.idempotencyKey,
    });
    if (existing) {
      if (existing.amountFils !== body.data.amountFils) {
        res.status(409).json({
          error: "This request key was already used for a different amount.",
        });
        return;
      }
      res
        .status(200)
        .json(CreateWorkerWithdrawalResponse.parse(workerWithdrawalDto(existing)));
      return;
    }

    const minimumFils = minimumWorkerWithdrawalFils();
    const minimumError = withdrawalAmountError(
      body.data.amountFils,
      Number.MAX_SAFE_INTEGER,
      minimumFils,
    );
    if (minimumError === "below_minimum") {
      res.status(400).json({
        error: `The minimum demo withdrawal is ${minimumFils} fils.`,
      });
      return;
    }
    if (minimumError) {
      res.status(400).json({ error: "Enter a valid amount in whole fils." });
      return;
    }

    let outcome:
      | { kind: "created"; withdrawal: WorkerWithdrawalRecord }
      | { kind: "insufficient"; availableFils: number };
    try {
      outcome = await withMongoTransaction(async (session) => {
        const lock = await workers().updateOne(
          { id: worker.id, ownerUserId: userId },
          { $inc: { walletVersion: 1 } },
          { session },
        );
        if (lock.matchedCount !== 1) {
          throw new Error("Worker wallet owner changed.");
        }
        const availableFils = await workerLedgerBalance(worker.id, session);
        const amountError = withdrawalAmountError(
          body.data.amountFils,
          availableFils,
          minimumFils,
        );
        if (amountError === "insufficient") {
          return { kind: "insufficient", availableFils };
        }
        if (amountError) {
          throw new Error("Worker wallet contains an invalid balance.");
        }
        const now = new Date();
        const withdrawal: WorkerWithdrawalRecord = {
          id: await nextId("sanad_worker_withdrawals", session),
          workerId: worker.id,
          amountFils: body.data.amountFils,
          status: "pending",
          idempotencyKey: body.data.idempotencyKey,
          requestedByUserId: userId,
          demoBankName: worker.demoPayoutProfile!.bankName,
          accountLabel: worker.demoPayoutProfile!.accountLabel,
          createdAt: now,
          updatedAt: now,
        };
        await workerWithdrawals().insertOne(withdrawal, { session });
        await appendWorkerLedgerEvent({
          workerId: worker.id,
          kind: "withdrawal_requested",
          amountFils: -withdrawal.amountFils,
          sourceKey: `worker:${worker.id}:withdrawal:${withdrawal.id}:reserve`,
          reference: `WD-${withdrawal.id}`,
          description: "Demo withdrawal requested; amount reserved",
          status: "pending",
          session,
        });
        return { kind: "created", withdrawal };
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const duplicate = await workerWithdrawals().findOne({
          workerId: worker.id,
          idempotencyKey: body.data.idempotencyKey,
        });
        if (duplicate && duplicate.amountFils === body.data.amountFils) {
          res
            .status(200)
            .json(
              CreateWorkerWithdrawalResponse.parse(
                workerWithdrawalDto(duplicate),
              ),
            );
          return;
        }
        res.status(409).json({
          error: "This request key is already in use.",
        });
        return;
      }
      throw error;
    }
    if (outcome.kind === "insufficient") {
      res.status(409).json({
        error: `Only ${outcome.availableFils} fils are available.`,
      });
      return;
    }
    res
      .status(201)
      .json(
        CreateWorkerWithdrawalResponse.parse(
          workerWithdrawalDto(outcome.withdrawal),
        ),
      );
  },
);

router.post(
  "/workers/me/withdrawals/:id/cancel",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = CancelWorkerWithdrawalParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    const outcome = await withMongoTransaction(async (session) => {
      await workers().updateOne(
        { id: worker.id, ownerUserId: userId },
        { $inc: { walletVersion: 1 } },
        { session },
      );
      const withdrawal = await workerWithdrawals().findOne(
        { id: params.data.id, workerId: worker.id },
        { session },
      );
      if (!withdrawal) return { kind: "not-found" as const };
      if (withdrawal.status === "cancelled") {
        return { kind: "ok" as const, withdrawal };
      }
      if (withdrawal.status !== "pending") {
        return { kind: "conflict" as const };
      }
      const now = new Date();
      const updated = await workerWithdrawals().updateOne(
        { id: withdrawal.id, workerId: worker.id, status: "pending" },
        { $set: { status: "cancelled", updatedAt: now } },
        { session },
      );
      if (updated.modifiedCount !== 1) return { kind: "conflict" as const };
      const cancelled = { ...withdrawal, status: "cancelled" as const, updatedAt: now };
      await appendWorkerLedgerEvent({
        workerId: worker.id,
        kind: "withdrawal_released",
        amountFils: withdrawal.amountFils,
        sourceKey: `worker:${worker.id}:withdrawal:${withdrawal.id}:release`,
        reference: `WD-${withdrawal.id}`,
        description: "Demo withdrawal cancelled; reserved amount released",
        status: "cancelled",
        session,
      });
      return { kind: "ok" as const, withdrawal: cancelled };
    });
    if (outcome.kind === "not-found") {
      res.status(404).json({ error: "Withdrawal not found for this worker." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: "Only a pending withdrawal can be cancelled." });
      return;
    }
    res.json(
      CancelWorkerWithdrawalResponse.parse(
        workerWithdrawalDto(outcome.withdrawal),
      ),
    );
  },
);

router.post(
  "/workers/me/company-exit",
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
    if (worker.companyId == null || worker.companyStatus !== "approved") {
      res.status(409).json({ error: "There is no active company association to end." });
      return;
    }
    const now = new Date();
    const updated = await withMongoTransaction(async (session) => {
      const current = await workers().findOne(
        {
          id: worker.id,
          ownerUserId: userId,
          companyId: worker.companyId,
          companyStatus: "approved",
        },
        { session },
      );
      if (!current) return null;

      const history = [...(current.companyMemberships ?? [])];
      let activeMembershipIndex = -1;
      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (
          history[index].companyId === current.companyId &&
          history[index].leftAt == null
        ) {
          activeMembershipIndex = index;
          break;
        }
      }
      if (activeMembershipIndex >= 0) {
        history[activeMembershipIndex] = {
          ...history[activeMembershipIndex],
          leftAt: now,
        };
      } else {
        history.push({
          companyId: current.companyId!,
          companyName: current.company,
          leftAt: now,
        });
      }
      const result = await workers().findOneAndUpdate(
        {
          id: current.id,
          ownerUserId: userId,
          companyId: current.companyId,
          companyStatus: "approved",
        },
        {
          $set: {
            company: "Independent",
            companyStatus: "none",
            companyMemberships: history,
          },
          $inc: { walletVersion: 1 },
          $unset: { companyId: "", requestedCompanyId: "" },
        },
        { returnDocument: "after", session },
      );
      return result ?? null;
    });
    if (!updated) {
      res.status(409).json({ error: "The company association has changed." });
      return;
    }
    res.json(LeaveWorkerCompanyResponse.parse(await workerProfileState(updated)));
  },
);

router.get(
  "/admin/worker-withdrawals",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await workerWithdrawals()
      .find({})
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();
    const workerRows = await workers()
      .find({ id: { $in: rows.map((row) => row.workerId) } })
      .toArray();
    const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
    res.json(
      ListAdminWorkerWithdrawalsResponse.parse(
        rows.flatMap((withdrawal) => {
          const worker = workerById.get(withdrawal.workerId);
          return worker
            ? [
                {
                  ...workerWithdrawalDto(withdrawal),
                  workerId: worker.id,
                  publicId: worker.publicId,
                  workerName: worker.name,
                },
              ]
            : [];
        }),
      ),
    );
  },
);

router.patch(
  "/admin/worker-withdrawals/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminUserId = signedInUserId(req);
    const params = UpdateAdminWorkerWithdrawalParams.safeParse(req.params);
    const body = UpdateAdminWorkerWithdrawalBody.safeParse(req.body);
    if (!adminUserId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          params.error?.message ??
          body.error?.message ??
          "Invalid withdrawal update.",
      });
      return;
    }

    const outcome = await withMongoTransaction(async (session) => {
      const withdrawal = await workerWithdrawals().findOne(
        { id: params.data.id },
        { session },
      );
      if (!withdrawal) return { kind: "not-found" as const };
      if (withdrawal.status === body.data.status) {
        return { kind: "ok" as const, withdrawal };
      }
      if (
        !workerWithdrawalTransitionAllowed(
          withdrawal.status,
          body.data.status,
        )
      ) {
        return { kind: "conflict" as const };
      }

      const workerUpdate = await workers().updateOne(
        { id: withdrawal.workerId },
        { $inc: { walletVersion: 1 } },
        { session },
      );
      if (workerUpdate.matchedCount !== 1) {
        return { kind: "not-found" as const };
      }
      const now = new Date();
      const updatedRecord = {
        ...withdrawal,
        status: body.data.status,
        updatedAt: now,
        reviewedByUserId: adminUserId,
        ...(body.data.status === "paid" ? { paidAt: now } : {}),
      };
      const update = await workerWithdrawals().updateOne(
        { id: withdrawal.id, status: withdrawal.status },
        {
          $set: {
            status: body.data.status,
            updatedAt: now,
            reviewedByUserId: adminUserId,
            ...(body.data.status === "paid" ? { paidAt: now } : {}),
          },
        },
        { session },
      );
      if (update.modifiedCount !== 1) return { kind: "conflict" as const };

      if (body.data.status === "processing") {
        await appendWorkerLedgerEvent({
          workerId: withdrawal.workerId,
          kind: "withdrawal_processing",
          amountFils: 0,
          sourceKey: `worker:${withdrawal.workerId}:withdrawal:${withdrawal.id}:processing`,
          reference: `WD-${withdrawal.id}`,
          description: "Demo withdrawal marked processing",
          status: "processing",
          session,
        });
      } else if (body.data.status === "paid") {
        await appendWorkerLedgerEvent({
          workerId: withdrawal.workerId,
          kind: "withdrawal_paid",
          amountFils: 0,
          sourceKey: `worker:${withdrawal.workerId}:withdrawal:${withdrawal.id}:paid`,
          reference: `WD-${withdrawal.id}`,
          description: "Demo status marked paid by an authorized admin; no transfer occurred",
          status: "paid",
          session,
        });
      } else {
        await appendWorkerLedgerEvent({
          workerId: withdrawal.workerId,
          kind: "withdrawal_released",
          amountFils: withdrawal.amountFils,
          sourceKey: `worker:${withdrawal.workerId}:withdrawal:${withdrawal.id}:release`,
          reference: `WD-${withdrawal.id}`,
          description: "Demo withdrawal rejected; reserved amount released",
          status: "rejected",
          session,
        });
      }
      return { kind: "ok" as const, withdrawal: updatedRecord };
    });

    if (outcome.kind === "not-found") {
      res.status(404).json({ error: "Withdrawal not found." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: "This withdrawal status transition is not allowed." });
      return;
    }
    const worker = await workers().findOne({ id: outcome.withdrawal.workerId });
    if (!worker) {
      res.status(404).json({ error: "Withdrawal worker not found." });
      return;
    }
    res.json(
      UpdateAdminWorkerWithdrawalResponse.parse({
        ...workerWithdrawalDto(outcome.withdrawal),
        workerId: worker.id,
        publicId: worker.publicId,
        workerName: worker.name,
      }),
    );
  },
);

export default router;
