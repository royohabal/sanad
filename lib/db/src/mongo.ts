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
  | "sanad_demo_transfers";
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
    db.collection("sanad_workers").createIndex({ companyId: 1 }),
    db.collection("sanad_tips").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_tips").createIndex({ reference: 1 }, { unique: true }),
    db.collection("sanad_tips").createIndex(
      { idempotencyKey: 1 },
      { unique: true, sparse: true },
    ),
    db.collection("sanad_tips").createIndex({ workerId: 1, createdAt: -1 }),
    db.collection("sanad_settlements").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_settlements").createIndex(
      { workerId: 1, month: 1 },
      { unique: true },
    ),
    db.collection("sanad_demo_transfers").createIndex({ id: 1 }, { unique: true }),
    db.collection("sanad_demo_transfers").createIndex(
      { reference: 1 },
      { unique: true },
    ),
    db.collection("sanad_demo_transfers").createIndex({ createdAt: -1 }),
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
