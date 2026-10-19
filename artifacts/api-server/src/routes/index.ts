import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import healthRouter from "./health";
import workersRouter from "./workers";
import familyRouter from "./family";
import transfersRouter from "./transfers";

const router: IRouter = Router();

function disableUnsecuredManagementActions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const path = req.path.replace(/\/+$/, "") || "/";
  const method = req.method;
  const disabled =
    (method === "GET" && path === "/admin/overview") ||
    (method === "POST" &&
      (path === "/workers" ||
        path === "/children" ||
        path === "/settlements" ||
        /^\/children\/\d+\/(?:allowances|goals|approvals)$/.test(path) ||
        /^\/children\/\d+\/goals\/\d+\/contributions$/.test(path))) ||
    (method === "DELETE" && /^\/workers\/[^/]+$/.test(path)) ||
    (method === "PATCH" &&
      (/^\/children\/\d+$/.test(path) ||
        /^\/approvals\/\d+$/.test(path) ||
        /^\/settlements\/\d+$/.test(path)));

  if (!disabled) {
    next();
    return;
  }

  res.status(403).json({
    error: "Management actions are disabled until secure sign-in is configured.",
  });
}

router.use(disableUnsecuredManagementActions);
router.use(healthRouter);
router.use(workersRouter);
router.use(familyRouter);
router.use(transfersRouter);

export default router;
