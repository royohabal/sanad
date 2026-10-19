import {
  Router,
  type IRouter,
} from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import workersRouter from "./workers";
import familyRouter from "./family";
import transfersRouter from "./transfers";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(workersRouter);
router.use(familyRouter);
router.use(transfersRouter);

export default router;
