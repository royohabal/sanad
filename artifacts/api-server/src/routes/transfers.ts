import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { getMongoDb, nextId, type DemoTransferRecord } from "@workspace/db";
import {
  CreateDemoTransferBody,
  CreateDemoTransferResponse,
  ListDemoTransfersResponse,
} from "@workspace/api-zod";
import { rateLimitPublicRequests } from "../lib/publicRateLimit";

const router: IRouter = Router();
const transfers = () =>
  getMongoDb().collection<DemoTransferRecord>("sanad_demo_transfers");

function transferDto(transfer: DemoTransferRecord) {
  return {
    id: transfer.id,
    reference: transfer.reference,
    sender: transfer.sender,
    recipient: transfer.recipient,
    amountFils: transfer.amountFils,
    status: "demo_completed" as const,
    createdAt: transfer.createdAt.toISOString(),
  };
}

router.get(
  "/demo-transfers",
  rateLimitPublicRequests({
    scope: "demo-transfer-history",
    limit: 120,
    windowMs: 60 * 1000,
  }),
  async (_req, res): Promise<void> => {
    const rows = await transfers()
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(ListDemoTransfersResponse.parse(rows.map(transferDto)));
  },
);

router.post(
  "/demo-transfers",
  rateLimitPublicRequests({
    scope: "demo-transfer-submit",
    limit: 60,
    windowMs: 15 * 60 * 1000,
  }),
  async (req, res): Promise<void> => {
  const parsed = CreateDemoTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const normalized = CreateDemoTransferBody.safeParse({
    ...parsed.data,
    sender: parsed.data.sender.trim(),
    recipient: parsed.data.recipient.trim(),
  });
  if (!normalized.success) {
    res.status(400).json({ error: normalized.error.message });
    return;
  }
  const transfer: DemoTransferRecord = {
    ...normalized.data,
    id: await nextId("sanad_demo_transfers"),
    reference: randomUUID(),
    status: "demo_completed",
    createdAt: new Date(),
  };
  await transfers().insertOne(transfer);
  res.status(201).json(
    CreateDemoTransferResponse.parse(transferDto(transfer)),
  );
  },
);

export default router;
