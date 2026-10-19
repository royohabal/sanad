import { Router, type IRouter } from "express";
import { getMongoDb } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  try {
    await getMongoDb().command({ ping: 1 });
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch (error) {
    logger.warn(
      {
        errorName: error instanceof Error ? error.name : "UnknownDatabaseError",
      },
      "MongoDB health check failed",
    );
    res.status(503).json({ error: "Database unavailable" });
  }
});

export default router;
