import { createHmac } from "node:crypto";
import type { RequestHandler } from "express";
import { getMongoDb } from "@workspace/db";
import { logger } from "./logger";

interface PublicRateLimitBucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

interface PublicRateLimitOptions {
  scope: string;
  limit: number;
  windowMs: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export function rateLimitPublicRequests({
  scope,
  limit,
  windowMs,
}: PublicRateLimitOptions): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const secret = process.env.SESSION_SECRET;
    const clientAddress = req.ip || req.socket.remoteAddress;
    if (!secret || !clientAddress) {
      res.status(503).json({
        error: "Demo protection is temporarily unavailable. Please try again.",
      });
      return;
    }

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    const bucketId = createHmac("sha256", secret)
      .update(`${scope}\n${clientAddress}\n${windowStart}`)
      .digest("hex");

    let bucket: PublicRateLimitBucket | null;
    try {
      const buckets =
        getMongoDb().collection<PublicRateLimitBucket>("sanad_public_rate_limits");
      try {
        bucket = await buckets.findOneAndUpdate(
          { _id: bucketId },
          {
            $inc: { count: 1 },
            $setOnInsert: { expiresAt: new Date(windowEnd) },
          },
          { upsert: true, returnDocument: "after" },
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        bucket = await buckets.findOneAndUpdate(
          { _id: bucketId },
          { $inc: { count: 1 } },
          { returnDocument: "after" },
        );
      }
    } catch (error) {
      logger.warn(
        {
          scope,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "Public request rate limit check failed",
      );
      res.status(503).json({
        error: "Demo protection is temporarily unavailable. Please try again.",
      });
      return;
    }

    if (!bucket) {
      res.status(503).json({
        error: "Demo protection is temporarily unavailable. Please try again.",
      });
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
    res.setHeader(
      "RateLimit-Policy",
      `${limit};w=${Math.ceil(windowMs / 1000)}`,
    );

    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "Too many demo requests. Please wait before trying again.",
      });
      return;
    }

    next();
  };
}
