import { Router, type IRouter } from "express";
import { getMongoDb, type DemoTransferRecord } from "@workspace/db";
import { ListDemoTransfersResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/authz";

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
  requireAdmin,
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
  (_req, res): void => {
    res.status(410).json({
      error: "Public demo transfer writes are disabled. Sign in to use a SANAD wallet.",
    });
  },
);

export default router;
