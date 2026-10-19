import {
  getMongoDb,
  nextId,
  type MongoSession,
  type WorkerWalletLedgerKind,
  type WorkerWalletLedgerRecord,
  type WorkerWithdrawalRecord,
} from "@workspace/db";
export {
  companySettlementTransitionAllowed,
  withdrawalAmountError,
  workerWithdrawalTransitionAllowed,
} from "./workerFinanceRules";

export const workerWalletLedger = () =>
  getMongoDb().collection<WorkerWalletLedgerRecord>(
    "sanad_worker_wallet_ledger",
  );

export const workerWithdrawals = () =>
  getMongoDb().collection<WorkerWithdrawalRecord>(
    "sanad_worker_withdrawals",
  );

export function minimumWorkerWithdrawalFils(): number {
  const configured = process.env.MIN_WORKER_WITHDRAWAL_FILS;
  if (configured == null || configured.trim() === "") return 0;
  if (!/^\d+$/.test(configured.trim())) {
    throw new Error("MIN_WORKER_WITHDRAWAL_FILS must be a non-negative integer.");
  }
  const amount = Number(configured);
  if (!Number.isSafeInteger(amount)) {
    throw new Error("MIN_WORKER_WITHDRAWAL_FILS must be a safe integer.");
  }
  return amount;
}

export async function appendWorkerLedgerEvent(input: {
  workerId: number;
  kind: WorkerWalletLedgerKind;
  amountFils: number;
  sourceKey: string;
  reference: string;
  description: string;
  status?: WorkerWalletLedgerRecord["status"];
  session?: MongoSession;
}): Promise<void> {
  const existing = await workerWalletLedger().findOne(
    { sourceKey: input.sourceKey },
    { session: input.session },
  );
  if (existing) return;

  await workerWalletLedger().insertOne(
    {
      id: await nextId("sanad_worker_wallet_ledger", input.session),
      workerId: input.workerId,
      kind: input.kind,
      amountFils: input.amountFils,
      sourceKey: input.sourceKey,
      reference: input.reference,
      description: input.description,
      ...(input.status ? { status: input.status } : {}),
      createdAt: new Date(),
    },
    { session: input.session },
  );
}

export async function workerLedgerBalance(
  workerId: number,
  session?: MongoSession,
): Promise<number> {
  const result = await workerWalletLedger()
    .aggregate<{ balanceFils: number }>(
      [
        { $match: { workerId } },
        { $group: { _id: null, balanceFils: { $sum: "$amountFils" } } },
      ],
      { session },
    )
    .next();
  const balance = result?.balanceFils ?? 0;
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("Worker wallet ledger balance is invalid.");
  }
  return balance;
}

export function workerWithdrawalDto(withdrawal: WorkerWithdrawalRecord) {
  return {
    id: withdrawal.id,
    amountFils: withdrawal.amountFils,
    status: withdrawal.status,
    demoBankName: withdrawal.demoBankName,
    accountLabel: withdrawal.accountLabel,
    createdAt: withdrawal.createdAt.toISOString(),
    updatedAt: withdrawal.updatedAt.toISOString(),
    paidAt: withdrawal.paidAt?.toISOString() ?? null,
  };
}

