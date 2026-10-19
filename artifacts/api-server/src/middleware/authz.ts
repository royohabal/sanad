import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { getMongoDb, type SanadUserRoleRecord } from "@workspace/db";

const userRoles = () =>
  getMongoDb().collection<SanadUserRoleRecord>("sanad_user_roles");

export function signedInUserId(req: Parameters<RequestHandler>[0]) {
  return getAuth(req).userId ?? null;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return Boolean(await userRoles().findOne({ userId, role: "admin" }));
}

export const requireSignedIn: RequestHandler = (req, res, next) => {
  if (!signedInUserId(req)) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!(await isAdminUser(userId))) {
      res.status(403).json({ error: "Admin access is required." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
