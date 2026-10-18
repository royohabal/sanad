import { desc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, sanadDemoTransfersTable } from "@workspace/db";
import {
  CreateDemoTransferBody,
  CreateDemoTransferResponse,
  ListDemoTransfersResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function transferDto(
  transfer: typeof sanadDemoTransfersTable.$inferSelect,
) {
  return {
    ...transfer,
    status: "demo_completed" as const,
    createdAt: transfer.createdAt.toISOString(),
  };
}

router.get("/demo-transfers", async (_req, res): Promise<void> => {
  const transfers = await db
    .select()
    .from(sanadDemoTransfersTable)
    .orderBy(desc(sanadDemoTransfersTable.createdAt))
    .limit(50);
  res.json(ListDemoTransfersResponse.parse(transfers.map(transferDto)));
});

router.post("/demo-transfers", async (req, res): Promise<void> => {
  const parsed = CreateDemoTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [transfer] = await db
    .insert(sanadDemoTransfersTable)
    .values(parsed.data)
    .returning();
  res
    .status(201)
    .json(CreateDemoTransferResponse.parse(transferDto(transfer)));
});

export default router;
