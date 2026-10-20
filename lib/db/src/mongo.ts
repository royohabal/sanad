import {
  MongoClient,
  type ClientSession,
  type Db,
} from "mongodb";

export type SequenceName =
  | "sanad_children"
  | "sanad_child_activity"
  | "sanad_savings_goals"
  | "sanad_approval_requests"
  | "sanad_workers"
  | "sanad_tips"
  | "sanad_settlements"
  | "sanad_companies"
  | "sanad_worker_company_requests"
  | "sanad_cash_out_requests"
  | "sanad_demo_transfers"
  | "sanad_worker_withdrawals"
  | "sanad_worker_wallet_ledger";
export type MongoSession = ClientSession;

interface CounterRecord {
  _id: SequenceName;
  sequence: number;
}

let client: MongoClient | undefined;
let database: Db | undefined;

function databaseName() {
  return process.env.NODE_ENV === "production"
    ? process.env.MONGODB_DATABASE_PRODUCTION || "sanad_production"
    : process.env.MONGODB_DATABASE_DEVELOPMENT || "sanad_development";
}

async function ensureIndexes(db: Db) {
  const settlementCollection = db.collection("sanad_settlements");
  const existingSettlementIndexes = await settlementCollection.indexes();
  const oldWorkerMonthIndex = existingSettlementIndexes.find(
    (index) =>
      index.unique === true &&
      index.key.workerId === 1 &&
      index.key.month === 1 &&
      index.key.companyId === undefined,
  );
  if (oldWorkerMonthIndex?.name) {
    await settlementCollection.dropIndex(oldWorkerMonthIndex.name);
  }

  await Promise.all([
    db.collection("sanad_children").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_children").createIndex({ publicId: 1 }, { unique: true }),
    db.collection("sanad_children").createIndex({ ownerUserId: 1, createdAt: -1 }),
    db.collection("sanad_child_activity").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_child_activity").createIndex({ childId: 1, createdAt: -1 }),
    db.collection("sanad_savings_goals").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_savings_goals").createIndex({ childId: 1, createdAt: -1 }),
    db.collection("sanad_approval_requests").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_approval_requests").createIndex({ childId: 1, createdAt: -1 }),
    db.collection("sanad_workers").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_workers").createIndex({ publicId: 1 }, { unique: true }),
    db.collection("sanad_workers").createIndex(
      { ownerUserId: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_workers").createIndex(
      { emailNormalized: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_workers").createIndex({ companyId: 1 }),
    db.collection("sanad_workers").createIndex({
      invitedCompanyId: 1,
      workerAccountStatus: 1,
    }),
    db.collection("sanad_worker_invitations").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_invitations").createIndex(
      { clerkInvitationId: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_invitations").createIndex(
      { emailNormalized: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } },
    ),
    db.collection("sanad_worker_invitations").createIndex(
      { workerId: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } },
    ),
    db.collection("sanad_worker_invitations").createIndex({
      companyId: 1,
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_worker_invitations").createIndex({
      workerId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_tips").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_tips").createIndex({ reference: 1 }, { unique: true }),
    db.collection("sanad_tips").createIndex(
      { idempotencyKey: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_tips").createIndex({ workerId: 1, createdAt: -1 }),
    db.collection("sanad_tips").createIndex({
      workerId: 1,
      payoutMethod: 1,
      createdAt: -1,
    }),
    db.collection("sanad_tips").createIndex({
      payoutCompanyId: 1,
      settlementId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_payments").createIndex(
      { paymentId: 1 },
      { unique: true },
    ),
    db.collection("sanad_payments").createIndex(
      { idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_payments").createIndex(
      { checkoutSessionId: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_payments").createIndex({
      flow: 1,
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_user_wallets").createIndex(
      { ownerUserId: 1 },
      { unique: true },
    ),
    db.collection("sanad_user_wallet_ledger").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_user_wallet_ledger").createIndex(
      { sourceKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_user_wallet_ledger").createIndex({
      ownerUserId: 1,
      createdAt: -1,
      id: -1,
    }),
    db.collection("sanad_user_transfers").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_user_transfers").createIndex(
      { fromUserId: 1, idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_user_transfers").createIndex(
      { requestId: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_user_transfers").createIndex({
      fromUserId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_user_transfers").createIndex({
      toUserId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_money_requests").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_money_requests").createIndex(
      { fromUserId: 1, idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_money_requests").createIndex({
      fromUserId: 1,
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_money_requests").createIndex({
      toUserId: 1,
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_settlements").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_settlements").createIndex(
      { workerId: 1, companyId: 1, month: 1 },
      { unique: true, name: "worker_company_month_unique" },
    ),
    db.collection("sanad_settlements").createIndex({
      companyId: 1,
      month: -1,
      updatedAt: -1,
    }),
    db.collection("sanad_worker_withdrawals").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_withdrawals").createIndex(
      { workerId: 1, idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_withdrawals").createIndex({
      workerId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_worker_withdrawals").createIndex({
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_worker_wallet_ledger").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_wallet_ledger").createIndex(
      { sourceKey: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_wallet_ledger").createIndex({
      workerId: 1,
      createdAt: -1,
      id: -1,
    }),
    db.collection("sanad_demo_transfers").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_demo_transfers").createIndex(
      { reference: 1 },
      { unique: true },
    ),
    db.collection("sanad_demo_transfers").createIndex({ createdAt: -1 }),
    db.collection("sanad_public_rate_limits").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db.collection("sanad_user_roles").createIndex(
      { userId: 1 },
      { unique: true },
    ),
    db.collection("sanad_companies").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_companies").createIndex(
      { ownerUserId: 1 },
      { unique: true },
    ),
    db.collection("sanad_companies").createIndex({ status: 1, createdAt: -1 }),
    db.collection("sanad_worker_company_requests").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_worker_company_requests").createIndex({
      companyId: 1,
      status: 1,
      createdAt: -1,
    }),
    db.collection("sanad_worker_company_requests").createIndex(
      { workerId: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } },
    ),
    db.collection("sanad_cash_out_requests").createIndex(
      { id: 1 },
      { unique: true },
    ),
    db.collection("sanad_cash_out_requests").createIndex({
      childId: 1,
      createdAt: -1,
    }),
    db.collection("sanad_cash_out_requests").createIndex({
      childId: 1,
      status: 1,
    }),
  ]);
}

export async function connectMongo(): Promise<Db> {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required before SANAD can start.");
  }

  client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(databaseName());
  await db.command({ ping: 1 });

  const topology = await client.db("admin").command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    throw new Error(
      "SANAD requires a MongoDB replica set or sharded cluster because wallet actions use multi-document transactions.",
    );
  }

  await ensureIndexes(db);
  database = db;
  return db;
}

export function getMongoDb(): Db {
  if (!database) {
    throw new Error("MongoDB has not been initialized. Call connectMongo() first.");
  }
  return database;
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error("MongoDB has not been initialized. Call connectMongo() first.");
  }
  return client;
}

export async function nextId(
  name: SequenceName,
  session?: ClientSession,
): Promise<number> {
  const counter = await getMongoDb()
    .collection<CounterRecord>("sanad_counters")
    .findOneAndUpdate(
      { _id: name },
      { $inc: { sequence: 1 } },
      { upsert: true, returnDocument: "after", session },
    );

  if (!counter) {
    throw new Error(`Could not allocate an ID for ${name}.`);
  }
  return counter.sequence;
}

export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = getMongoClient().startSession();
  let result!: T;
  try {
    await session.withTransaction(async () => {
      result = await operation(session);
      return result;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
