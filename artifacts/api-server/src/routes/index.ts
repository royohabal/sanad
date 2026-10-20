import {
  Router,
  type IRouter,
} from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companiesRouter from "./companies";
import workersRouter from "./workers";
import familyRouter from "./family";
import transfersRouter from "./transfers";
import workerFinanceRouter from "./worker-finance";
import paymentsRouter from "./payments";
import walletRouter from "./wallet";
import workerInvitationsRouter from "./worker-invitations";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(companiesRouter);
router.use(workersRouter);
router.use(workerFinanceRouter);
router.use(familyRouter);
router.use(transfersRouter);
router.use(paymentsRouter);
router.use(walletRouter);
router.use(workerInvitationsRouter);

export default router;
