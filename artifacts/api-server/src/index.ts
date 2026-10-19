import app from "./app";
import {
  connectMongo,
  migratePostgresToMongo,
} from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  const db = await connectMongo();
  if (process.env.MONGODB_MIGRATE_FROM_POSTGRES === "true") {
    const migration = await migratePostgresToMongo(db);
    logger.info(
      {
        alreadyComplete: migration.alreadyComplete,
        counts: migration.counts,
      },
      "MongoDB data migration verified",
    );
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ errorName: err.name }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

startServer().catch((error: unknown) => {
  const errorName =
    error instanceof Error ? error.name : "UnknownStartupError";
  logger.error(
    { errorName },
    "API startup failed; check MongoDB connectivity and migration configuration",
  );
  process.exit(1);
});
