import { Pool } from "pg";
import type { Db } from "mongodb";

interface IdentifiedRecord {
  id: number;
}

interface MigrationMarker {
  _id: string;
  status: "in_progress" | "complete";
  startedAt?: Date;
  completedAt?: Date;
  counts?: Record<string, number>;
}

interface CounterRecord {
  _id: string;
  sequence: number;
}

const migrationId = "postgres-to-mongodb-v1";

const sourceQueries = [
  {
    name: "sanad_children",
    sql: `SELECT id, public_id::text AS "publicId", name, age,
      spending_limit_fils AS "spendingLimitFils", created_at AS "createdAt"
      FROM sanad_children ORDER BY id`,
  },
  {
    name: "sanad_child_activity",
    sql: `SELECT id, child_id AS "childId", title, amount_fils AS "amountFils",
      kind, created_at AS "createdAt"
      FROM sanad_child_activity ORDER BY id`,
  },
  {
    name: "sanad_savings_goals",
    sql: `SELECT id, child_id AS "childId", name, target_fils AS "targetFils",
      saved_fils AS "savedFils", created_at AS "createdAt"
      FROM sanad_savings_goals ORDER BY id`,
  },
  {
    name: "sanad_approval_requests",
    sql: `SELECT id, child_id AS "childId", item, amount_fils AS "amountFils",
      status, created_at AS "createdAt"
      FROM sanad_approval_requests ORDER BY id`,
  },
  {
    name: "sanad_workers",
    sql: `SELECT id, public_id::text AS "publicId", name, avatar_url AS "avatarUrl",
      workplace, job_title AS "jobTitle", company, created_at AS "createdAt"
      FROM sanad_workers ORDER BY id`,
  },
  {
    name: "sanad_tips",
    sql: `SELECT id, reference::text AS reference, worker_id AS "workerId",
      amount_fils AS "amountFils", rating, message, status,
      created_at AS "createdAt" FROM sanad_tips ORDER BY id`,
  },
  {
    name: "sanad_settlements",
    sql: `SELECT id, worker_id AS "workerId", month, amount_fils AS "amountFils",
      status, updated_at AS "updatedAt" FROM sanad_settlements ORDER BY id`,
  },
  {
    name: "sanad_demo_transfers",
    sql: `SELECT id, reference::text AS reference, sender, recipient,
      amount_fils AS "amountFils", status, created_at AS "createdAt"
      FROM sanad_demo_transfers ORDER BY id`,
  },
] as const;

async function copyRows<T extends IdentifiedRecord>(
  db: Db,
  name: string,
  rows: T[],
) {
  if (rows.length === 0) return;
  await db.collection<IdentifiedRecord>(name).bulkWrite(
    rows.map((row) => ({
      replaceOne: {
        filter: { id: row.id },
        replacement: row,
        upsert: true,
      },
    })),
    { ordered: true },
  );
}

export async function migratePostgresToMongo(db: Db) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("The PostgreSQL import is restricted to the development environment.");
  }
  if (process.env.MONGODB_MIGRATE_FROM_POSTGRES !== "true") {
    throw new Error("Set MONGODB_MIGRATE_FROM_POSTGRES=true to run this import.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the one-time PostgreSQL import.");
  }

  const markers = db.collection<MigrationMarker>("sanad_migrations");
  const existingMarker = await markers.findOne({ _id: migrationId });
  if (existingMarker?.status === "complete") {
    return { alreadyComplete: true, counts: existingMarker.counts ?? {} };
  }

  if (!existingMarker) {
    const targetNames = [
      ...sourceQueries.map((query) => query.name),
      "sanad_counters",
    ];
    const targetCounts = await Promise.all(
      targetNames.map((name) => db.collection(name).countDocuments()),
    );
    if (targetCounts.some((count) => count > 0)) {
      throw new Error(
        "MongoDB already contains SANAD data but has no completed migration marker; import stopped to avoid overwriting it.",
      );
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const duplicates = await pool.query(
      `SELECT public_id::text AS public_id FROM sanad_children
       GROUP BY public_id HAVING COUNT(*) > 1 LIMIT 1`,
    );
    if (duplicates.rowCount) {
      throw new Error(
        "PostgreSQL contains duplicate child QR identifiers; import stopped before writing data.",
      );
    }

    await markers.updateOne(
      { _id: migrationId },
      { $setOnInsert: { status: "in_progress", startedAt: new Date() } },
      { upsert: true },
    );

    const counts: Record<string, number> = {};
    for (const query of sourceQueries) {
      const result = await pool.query<IdentifiedRecord & Record<string, unknown>>(
        query.sql,
      );
      await copyRows(db, query.name, result.rows);
      counts[query.name] = result.rows.length;
      const maxId = result.rows.reduce((max, row) => Math.max(max, row.id), 0);
      await db.collection<CounterRecord>("sanad_counters").updateOne(
        { _id: query.name },
        { $max: { sequence: maxId } },
        { upsert: true },
      );
    }

    const verifiedCounts: Record<string, number> = {};
    for (const query of sourceQueries) {
      verifiedCounts[query.name] = await db
        .collection(query.name)
        .countDocuments();
    }
    for (const query of sourceQueries) {
      if (verifiedCounts[query.name] !== counts[query.name]) {
        throw new Error(
          `MongoDB count verification failed for ${query.name}; PostgreSQL remains unchanged.`,
        );
      }
    }

    await markers.updateOne(
      { _id: migrationId },
      { $set: { status: "complete", counts, completedAt: new Date() } },
    );
    return { alreadyComplete: false, counts };
  } finally {
    await pool.end();
  }
}
