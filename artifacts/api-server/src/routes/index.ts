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

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(companiesRouter);
router.use(workersRouter);
router.use(workerFinanceRouter);
router.use(familyRouter);
router.use(transfersRouter);

export default router;
