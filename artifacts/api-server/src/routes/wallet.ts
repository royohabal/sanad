import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { Router, type IRouter } from "express";
import {
  getMongoDb,
  withMongoTransaction,
  type MongoSession,
  type SanadMoneyRequestRecord,
  type SanadUserTransferRecord,
  type SanadUserWalletLedgerRecord,
  type SanadUserWalletRecord,
} from "@workspace/db";
import {
  ActOnWalletMoneyRequestBody,
  ActOnWalletMoneyRequestParams,
  ActOnWalletMoneyRequestResponse,
  CreateWalletMoneyRequestBody,
  CreateWalletMoneyRequestResponse,
  CreateWalletTransferBody,
  CreateWalletTransferResponse,
  GetWalletDashboardResponse,
  LookupWalletRecipientQueryParams,
  LookupWalletRecipientResponse,
} from "@workspace/api-zod";
import { requireSignedIn, signedInUserId } from "../middleware/authz";
import { rateLimitPublicRequests } from "../lib/publicRateLimit";
import { moneyRequestActionDecision } from "../lib/paymentRules";

const router: IRouter = Router();
const wallets = () =>
  getMongoDb().collection<SanadUserWalletRecord>("sanad_user_wallets");
const ledger = () =>
  getMongoDb().collection<SanadUserWalletLedgerRecord>(
    "sanad_user_wallet_ledger",
  );
const transfers = () =>
  getMongoDb().collection<SanadUserTransferRecord>("sanad_user_transfers");
const requests = () =>
  getMongoDb().collection<SanadMoneyRequestRecord>("sanad_money_requests");

type AccountLabel = { userId: string; displayName: string };

async function accountLabel(userId: string): Promise<AccountLabel | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const firstName = user.firstName?.trim();
    const lastInitial = user.lastName?.trim().charAt(0);
    const displayName = firstName
      ? `${firstName}${lastInitial ? ` ${lastInitial}.` : ""}`
      : "SANAD member";
    return { userId, displayName };
  } catch {
    return null;
  }
}

async function ensureWallet(
  ownerUserId: string,
  session?: MongoSession,
): Promise<SanadUserWalletRecord> {
  const now = new Date();
  await wallets().updateOne(
    { ownerUserId },
    { $setOnInsert: { balanceFils: 0, createdAt: now, updatedAt: now } },
    { upsert: true, session },
  );
  const wallet = await wallets().findOne({ ownerUserId }, { session });
  if (!wallet) throw new Error("Could not initialize the SANAD wallet.");
  return wallet;
}

function sameTransfer(
  transfer: SanadUserTransferRecord,
  recipientUserId: string,
  amountFils: number,
  note: string | undefined,
): boolean {
  return (
    transfer.toUserId === recipientUserId &&
    transfer.amountFils === amountFils &&
    (transfer.note ?? "") === (note ?? "") &&
    transfer.origin === "send"
  );
}

function moneyRequestDto(
  request: SanadMoneyRequestRecord,
  viewerUserId: string,
) {
  const outgoing = request.fromUserId === viewerUserId;
  return {
    id: request.id,
    direction: outgoing ? ("sent" as const) : ("received" as const),
    counterparty: outgoing ? request.toLabel : request.fromLabel,
    amountFils: request.amountFils,
    status: request.status,
    note: request.note ?? null,
    createdAt: request.createdAt,
  };
}

async function addLedgerPair(input: {
  transferId: string;
  reference: string;
  fromUserId: string;
  toUserId: string;
  fromLabel: string;
  toLabel: string;
  amountFils: number;
  description: string;
  session: MongoSession;
}): Promise<void> {
  const createdAt = new Date();
  await ledger().insertMany(
    [
      {
        id: randomUUID(),
        ownerUserId: input.fromUserId,
        kind: "sent",
        amountFils: input.amountFils,
        sourceKey: `transfer:${input.transferId}:debit`,
        reference: input.reference,
        description: `${input.description} to ${input.toLabel}`,
        status: "completed",
        peerUserId: input.toUserId,
        peerLabel: input.toLabel,
        createdAt,
      },
      {
        id: randomUUID(),
        ownerUserId: input.toUserId,
        kind: "received",
        amountFils: input.amountFils,
        sourceKey: `transfer:${input.transferId}:credit`,
        reference: input.reference,
        description: `${input.description} from ${input.fromLabel}`,
        status: "completed",
        peerUserId: input.fromUserId,
        peerLabel: input.fromLabel,
        createdAt,
      },
    ],
    { session: input.session },
  );
}

router.get(
  "/wallet",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const wallet = await ensureWallet(userId);
    const [transactions, moneyRequests] = await Promise.all([
      ledger()
        .find({ ownerUserId: userId })
        .sort({ createdAt: -1, id: -1 })
        .limit(100)
        .toArray(),
      requests()
        .find({ $or: [{ fromUserId: userId }, { toUserId: userId }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);
    res.json(
      GetWalletDashboardResponse.parse({
        balanceFils: wallet.balanceFils,
        transactions: transactions.map((transaction) => ({
          reference: transaction.reference,
          kind: transaction.kind,
          amountFils: transaction.amountFils,
          status: transaction.status,
          description: transaction.description,
          peerLabel: transaction.peerLabel ?? null,
          createdAt: transaction.createdAt,
        })),
        requests: moneyRequests.map((request) =>
          moneyRequestDto(request, userId),
        ),
      }),
    );
  },
);

router.get(
  "/wallet/recipients",
  requireSignedIn,
  rateLimitPublicRequests({
    scope: "wallet-recipient-lookup",
    limit: 20,
    windowMs: 60 * 1000,
  }),
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = LookupWalletRecipientQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid account email." });
      return;
    }
    try {
      const result = await clerkClient.users.getUserList({
        emailAddress: [parsed.data.email.trim().toLowerCase()],
        limit: 1,
      });
      const user = result.data[0];
      if (!user || user.id === userId) {
        res.status(404).json({ error: "No other SANAD account was found." });
        return;
      }
      const displayName = await accountLabel(user.id);
      if (!displayName) {
        res.status(404).json({ error: "No other SANAD account was found." });
        return;
      }
      res.json(
        LookupWalletRecipientResponse.parse({
          userId: displayName.userId,
          displayName: displayName.displayName,
        }),
      );
    } catch {
      res.status(503).json({
        error: "Recipient lookup is temporarily unavailable.",
      });
    }
  },
);

router.post(
  "/wallet/transfers",
  requireSignedIn,
  rateLimitPublicRequests({
    scope: "wallet-transfer",
    limit: 60,
    windowMs: 15 * 60 * 1000,
  }),
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const parsed = CreateWalletTransferBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (input.recipientUserId === userId) {
      res.status(400).json({ error: "Choose another SANAD account." });
      return;
    }
    const [fromAccount, toAccount] = await Promise.all([
      accountLabel(userId),
      accountLabel(input.recipientUserId),
    ]);
    if (!fromAccount || !toAccount) {
      res.status(404).json({ error: "Recipient account was not found." });
      return;
    }
    const note = input.note?.trim() || undefined;
    const existing = await transfers().findOne({
      fromUserId: userId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      if (
        !sameTransfer(
          existing,
          input.recipientUserId,
          input.amountFils,
          note,
        )
      ) {
        res.status(409).json({ error: "This transfer key was already used." });
        return;
      }
      res.json(
        CreateWalletTransferResponse.parse({
          reference: existing.reference,
          kind: "sent",
          amountFils: existing.amountFils,
          status: "completed",
          description: `Wallet transfer to ${existing.toLabel}`,
          peerLabel: existing.toLabel,
          createdAt: existing.createdAt,
        }),
      );
      return;
    }

    try {
      const result = await withMongoTransaction(async (session) => {
        const duplicate = await transfers().findOne(
          { fromUserId: userId, idempotencyKey: input.idempotencyKey },
          { session },
        );
        if (duplicate) {
          return sameTransfer(
            duplicate,
            input.recipientUserId,
            input.amountFils,
            note,
          )
            ? { kind: "ok" as const, transfer: duplicate }
            : { kind: "conflict" as const };
        }

        await ensureWallet(userId, session);
        await ensureWallet(input.recipientUserId, session);
        const debit = await wallets().updateOne(
          { ownerUserId: userId, balanceFils: { $gte: input.amountFils } },
          {
            $inc: { balanceFils: -input.amountFils },
            $set: { updatedAt: new Date() },
          },
          { session },
        );
        if (debit.matchedCount !== 1) {
          return { kind: "insufficient" as const };
        }
        await wallets().updateOne(
          { ownerUserId: input.recipientUserId },
          {
            $inc: { balanceFils: input.amountFils },
            $set: { updatedAt: new Date() },
          },
          { session },
        );
        const now = new Date();
        const transfer: SanadUserTransferRecord = {
          id: randomUUID(),
          reference: randomUUID(),
          fromUserId: userId,
          toUserId: input.recipientUserId,
          fromLabel: fromAccount.displayName,
          toLabel: toAccount.displayName,
          amountFils: input.amountFils,
          ...(note ? { note } : {}),
          origin: "send",
          idempotencyKey: input.idempotencyKey,
          status: "completed",
          createdAt: now,
        };
        await transfers().insertOne(transfer, { session });
        await addLedgerPair({
          transferId: transfer.id,
          reference: transfer.reference,
          fromUserId: userId,
          toUserId: input.recipientUserId,
          fromLabel: transfer.fromLabel,
          toLabel: transfer.toLabel,
          amountFils: transfer.amountFils,
          description: note ? `Wallet transfer · ${note}` : "Wallet transfer",
          session,
        });
        return { kind: "ok" as const, transfer };
      });
      if (result.kind === "insufficient") {
        res.status(409).json({ error: "Your SANAD wallet balance is too low." });
        return;
      }
      if (result.kind === "conflict") {
        res.status(409).json({ error: "This transfer key was already used." });
        return;
      }
      res.status(201).json(
        CreateWalletTransferResponse.parse({
          reference: result.transfer.reference,
          kind: "sent",
          amountFils: result.transfer.amountFils,
          status: "completed",
          description: `Wallet transfer to ${result.transfer.toLabel}`,
          peerLabel: result.transfer.toLabel,
          createdAt: result.transfer.createdAt,
        }),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const duplicate = await transfers().findOne({
          fromUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        if (
          duplicate &&
          sameTransfer(duplicate, input.recipientUserId, input.amountFils, note)
        ) {
          res.json(
            CreateWalletTransferResponse.parse({
              reference: duplicate.reference,
              kind: "sent",
              amountFils: duplicate.amountFils,
              status: "completed",
              description: `Wallet transfer to ${duplicate.toLabel}`,
              peerLabel: duplicate.toLabel,
              createdAt: duplicate.createdAt,
            }),
          );
          return;
        }
        res.status(409).json({ error: "This transfer key was already used." });
        return;
      }
      throw error;
    }
  },
);

router.post(
  "/wallet/requests",
  requireSignedIn,
  rateLimitPublicRequests({
    scope: "wallet-request",
    limit: 60,
    windowMs: 15 * 60 * 1000,
  }),
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const parsed = CreateWalletMoneyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data;
    if (input.recipientUserId === userId) {
      res.status(400).json({ error: "Choose another SANAD account." });
      return;
    }
    const [fromAccount, toAccount] = await Promise.all([
      accountLabel(userId),
      accountLabel(input.recipientUserId),
    ]);
    if (!fromAccount || !toAccount) {
      res.status(404).json({ error: "Recipient account was not found." });
      return;
    }
    const note = input.note?.trim() || undefined;
    const existing = await requests().findOne({
      fromUserId: userId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      if (
        existing.toUserId !== input.recipientUserId ||
        existing.amountFils !== input.amountFils ||
        (existing.note ?? "") !== (note ?? "")
      ) {
        res.status(409).json({ error: "This request key was already used." });
        return;
      }
      res.json(
        CreateWalletMoneyRequestResponse.parse(
          moneyRequestDto(existing, userId),
        ),
      );
      return;
    }

    const now = new Date();
    const request: SanadMoneyRequestRecord = {
      id: randomUUID(),
      fromUserId: userId,
      toUserId: input.recipientUserId,
      fromLabel: fromAccount.displayName,
      toLabel: toAccount.displayName,
      amountFils: input.amountFils,
      ...(note ? { note } : {}),
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await requests().insertOne(request);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const duplicate = await requests().findOne({
          fromUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        if (
          duplicate &&
          duplicate.toUserId === input.recipientUserId &&
          duplicate.amountFils === input.amountFils &&
          (duplicate.note ?? "") === (note ?? "")
        ) {
          res.json(
            CreateWalletMoneyRequestResponse.parse(
              moneyRequestDto(duplicate, userId),
            ),
          );
          return;
        }
        res.status(409).json({ error: "This request key was already used." });
        return;
      }
      throw error;
    }
    res.status(201).json(
      CreateWalletMoneyRequestResponse.parse(moneyRequestDto(request, userId)),
    );
  },
);

router.post(
  "/wallet/requests/:requestId/action",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = ActOnWalletMoneyRequestParams.safeParse(req.params);
    const body = ActOnWalletMoneyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Money request action is invalid." });
      return;
    }

    const outcome = await withMongoTransaction(async (session) => {
      const request = await requests().findOne(
        { id: params.data.requestId },
        { session },
      );
      if (
        !request ||
        (request.fromUserId !== userId && request.toUserId !== userId)
      ) {
        return { kind: "missing" as const };
      }
      const { action } = body.data;
      const actor = request.fromUserId === userId ? "requester" : "recipient";
      const decision = moneyRequestActionDecision(
        request.status,
        action,
        actor,
      );
      if (decision === "forbidden") {
        return { kind: "missing" as const };
      }
      const terminalStatus =
        action === "pay"
          ? "paid"
          : action === "decline"
            ? "declined"
            : "cancelled";
      if (decision === "already_applied") {
        return { kind: "ok" as const, request };
      }
      if (decision === "conflict") {
        return { kind: "conflict" as const };
      }

      if (action === "pay") {
        const payerId = request.toUserId;
        const recipientId = request.fromUserId;
        await ensureWallet(payerId, session);
        await ensureWallet(recipientId, session);
        const debit = await wallets().updateOne(
          { ownerUserId: payerId, balanceFils: { $gte: request.amountFils } },
          {
            $inc: { balanceFils: -request.amountFils },
            $set: { updatedAt: new Date() },
          },
          { session },
        );
        if (debit.matchedCount !== 1) {
          return { kind: "insufficient" as const };
        }
        await wallets().updateOne(
          { ownerUserId: recipientId },
          {
            $inc: { balanceFils: request.amountFils },
            $set: { updatedAt: new Date() },
          },
          { session },
        );
        const transfer: SanadUserTransferRecord = {
          id: randomUUID(),
          reference: randomUUID(),
          fromUserId: payerId,
          toUserId: recipientId,
          fromLabel: request.toLabel,
          toLabel: request.fromLabel,
          amountFils: request.amountFils,
          ...(request.note ? { note: request.note } : {}),
          origin: "request",
          requestId: request.id,
          idempotencyKey: `request:${request.id}`,
          status: "completed",
          createdAt: new Date(),
        };
        await transfers().insertOne(transfer, { session });
        await addLedgerPair({
          transferId: transfer.id,
          reference: transfer.reference,
          fromUserId: payerId,
          toUserId: recipientId,
          fromLabel: transfer.fromLabel,
          toLabel: transfer.toLabel,
          amountFils: transfer.amountFils,
          description: request.note
            ? `Paid request · ${request.note}`
            : "Paid money request",
          session,
        });
      }

      const updated = await requests().findOneAndUpdate(
        { id: request.id, status: "pending" },
        { $set: { status: terminalStatus, updatedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!updated) return { kind: "conflict" as const };
      return { kind: "ok" as const, request: updated };
    });

    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Money request not found or not accessible." });
      return;
    }
    if (outcome.kind === "insufficient") {
      res.status(409).json({ error: "Your SANAD wallet balance is too low." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: "This money request is no longer pending." });
      return;
    }
    res.json(
      ActOnWalletMoneyRequestResponse.parse(
        moneyRequestDto(outcome.request, userId),
      ),
    );
  },
);

export default router;
