import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  connectMongo,
  getMongoClient,
  getMongoDb,
  nextId,
} from "../../../lib/db/src/mongo.ts";

const workerId = Number(process.env.SANAD_FINANCE_TEST_WORKER_ID);
const marker = process.env.SANAD_FINANCE_TEST_MARKER;
const mode = process.argv[2] ?? "run";

async function closeMongo() {
  try {
    await getMongoClient().close();
  } catch {
    // A child process may close the connection after a failed setup.
  }
}

async function verify() {
  await connectMongo();
  const db = getMongoDb();
  const worker = await db.collection("sanad_workers").findOne({ id: workerId });
  const tip = await db
    .collection("sanad_tips")
    .findOne({ idempotencyKey: marker, workerId });
  const ledgerEvent = tip
    ? await db
        .collection("sanad_worker_wallet_ledger")
        .findOne({
          sourceKey: `worker:${workerId}:tip:${tip.id}:credit`,
          workerId,
        })
    : null;
  assert.ok(worker, "test worker should exist after reconnect");
  assert.ok(tip, "API-recorded simulated tip should exist after reconnect");
  assert.ok(ledgerEvent, "API-created wallet ledger credit should exist after reconnect");
  assert.equal(tip.amountFils, 250);
  assert.equal(tip.status, "demo_completed");
  assert.equal(tip.payoutMethod, "independent");
  assert.equal(ledgerEvent.amountFils, 250);
  console.log("Verified an API-recorded simulated tip and wallet credit after a fresh Mongo connection.");
  await closeMongo();
}

async function cleanup() {
  if (!Number.isSafeInteger(workerId) || workerId <= 0 || !marker) return;
  await connectMongo();
  const db = getMongoDb();
  await Promise.all([
    db.collection("sanad_worker_wallet_ledger").deleteMany({ workerId }),
    db.collection("sanad_tips").deleteMany({ workerId }),
    db.collection("sanad_worker_withdrawals").deleteMany({ workerId }),
    db.collection("sanad_settlements").deleteMany({ workerId }),
    db.collection("sanad_workers").deleteOne({ id: workerId }),
  ]);
  await closeMongo();
}

if (mode === "verify") {
  try {
    await verify();
  } catch {
    console.error("Mongo persistence verification failed.");
    process.exitCode = 1;
    await closeMongo();
  }
} else if (mode === "cleanup") {
  try {
    await cleanup();
  } catch {
    console.error("Temporary test-record cleanup failed.");
    process.exitCode = 1;
    await closeMongo();
  }
} else {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Persistence check refuses to write to a production database.");
  }
  if (process.env.SANAD_RUN_MONGO_PERSISTENCE_TESTS !== "true") {
    throw new Error("Set SANAD_RUN_MONGO_PERSISTENCE_TESTS=true to run this isolated development check.");
  }
  if (!process.env.REPLIT_DEV_DOMAIN) {
    throw new Error("REPLIT_DEV_DOMAIN is required to exercise the public simulated-tip API.");
  }
  const testMarker = randomUUID();
  let testWorkerId;
  try {
    await connectMongo();
    const db = getMongoDb();
    assert.ok(
      !/prod(uction)?/i.test(db.databaseName),
      "Persistence check refuses a database name that looks like production.",
    );
    const session = getMongoClient().startSession();
    try {
      await session.withTransaction(async () => {
        testWorkerId = await nextId("sanad_workers", session);
        const now = new Date();
        await db.collection("sanad_workers").insertOne(
          {
            id: testWorkerId,
            publicId: testMarker,
            ownerUserId: `persistence-test-${testMarker}`,
            name: "SANAD persistence test worker",
            avatarUrl: null,
            workplace: "SANAD test",
            jobTitle: "Persistence test",
            company: "Independent",
            companyStatus: "none",
            createdAt: now,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    const publicId = testMarker;
    const response = await fetch(
      `https://${process.env.REPLIT_DEV_DOMAIN}/api/tips`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicId,
          amountFils: 250,
          idempotencyKey: testMarker,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Simulated-tip API returned HTTP ${response.status}.`);
    }
    await closeMongo();
    const childEnv = {
      ...process.env,
      NODE_ENV: "development",
      SANAD_FINANCE_TEST_WORKER_ID: String(testWorkerId),
      SANAD_FINANCE_TEST_MARKER: testMarker,
    };
    const script = fileURLToPath(import.meta.url);
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", script, "verify"],
      { env: childEnv, encoding: "utf8" },
    );
    if (child.status !== 0) {
      throw new Error("Fresh-process persistence check did not pass.");
    }
    process.stdout.write(child.stdout);
  } finally {
    await closeMongo();
    if (Number.isSafeInteger(testWorkerId)) {
      const cleanupEnv = {
        ...process.env,
        NODE_ENV: "development",
        SANAD_FINANCE_TEST_WORKER_ID: String(testWorkerId),
        SANAD_FINANCE_TEST_MARKER: testMarker,
      };
      const cleanupChild = spawnSync(
        process.execPath,
        ["--experimental-strip-types", fileURLToPath(import.meta.url), "cleanup"],
        { env: cleanupEnv, encoding: "utf8" },
      );
      if (cleanupChild.status !== 0) {
        throw new Error("Temporary persistence test records could not be cleaned up.");
      }
    }
  }
}
