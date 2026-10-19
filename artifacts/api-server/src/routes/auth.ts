import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import {
  getMongoDb,
  withMongoTransaction,
  type AdminBootstrapRecord,
  type SanadUserRoleRecord,
} from "@workspace/db";
import {
  isAdminUser,
  requireSignedIn,
  signedInUserId,
} from "../middleware/authz";

const router: IRouter = Router();
const userRoles = () =>
  getMongoDb().collection<SanadUserRoleRecord>("sanad_user_roles");
const adminBootstrap = () =>
  getMongoDb().collection<AdminBootstrapRecord>("sanad_admin_bootstrap");

router.get("/auth/me", requireSignedIn, async (req, res): Promise<void> => {
  const userId = signedInUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  res.json({
    userId,
    role: (await isAdminUser(userId)) ? "admin" : "parent",
  });
});

router.post(
  "/auth/bootstrap-admin",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (await isAdminUser(userId)) {
      res.json({ userId, role: "admin" });
      return;
    }

    const allowedEmail = process.env.SANAD_ADMIN_EMAIL?.trim().toLowerCase();
    if (!allowedEmail) {
      res.status(503).json({
        error: "The first SANAD administrator has not been configured.",
      });
      return;
    }

    let matchesAllowedEmail = false;
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      matchesAllowedEmail = clerkUser.emailAddresses.some(
        (entry) => entry.emailAddress.trim().toLowerCase() === allowedEmail,
      );
    } catch {
      res.status(503).json({
        error: "Could not verify the signed-in account with the identity provider.",
      });
      return;
    }
    if (!matchesAllowedEmail) {
      res.status(403).json({
        error: "This signed-in account is not allowed to claim the first admin role.",
      });
      return;
    }

    const existingBootstrap = await adminBootstrap().findOne({
      _id: "first-admin",
    });
    if (existingBootstrap) {
      if (existingBootstrap.userId === userId) {
        res.json({ userId, role: "admin" });
        return;
      }
      res.status(409).json({
        error: "The first SANAD administrator role has already been claimed.",
      });
      return;
    }

    try {
      await withMongoTransaction(async (session) => {
        await adminBootstrap().insertOne(
          {
            _id: "first-admin",
            userId,
            createdAt: new Date(),
          },
          { session },
        );
        await userRoles().insertOne(
          { userId, role: "admin", createdAt: new Date() },
          { session },
        );
      });
    } catch (error) {
      const current = await adminBootstrap().findOne({ _id: "first-admin" });
      if (current?.userId !== userId) {
        if (current) {
          res.status(409).json({
            error: "The first SANAD administrator role has already been claimed.",
          });
          return;
        }
        throw error;
      }
    }

    res.status(201).json({ userId, role: "admin" });
  },
);

export default router;
