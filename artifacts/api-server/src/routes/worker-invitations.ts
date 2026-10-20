import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { Router, type IRouter, type Request } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type CompanyRecord,
  type WorkerInvitationRecord,
  type WorkerRecord,
} from "@workspace/db";
import {
  AcceptMyWorkerInvitationResponse,
  CreateCompanyWorkerInvitationBody,
  CreateCompanyWorkerInvitationResponse,
  DeactivateCompanyWorkerParams,
  DeactivateCompanyWorkerResponse,
  GetMyWorkerInvitationResponse,
  ListCompanyWorkersResponse,
  ResendCompanyWorkerInvitationBody,
  ResendCompanyWorkerInvitationParams,
  ResendCompanyWorkerInvitationResponse,
  RevokeCompanyWorkerInvitationParams,
  RevokeCompanyWorkerInvitationResponse,
  UpdateCompanyWorkerBody,
  UpdateCompanyWorkerParams,
  UpdateCompanyWorkerResponse,
} from "@workspace/api-zod";
import { requireSignedIn, signedInUserId } from "../middleware/authz";

const router: IRouter = Router();
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const invitations = () =>
  getMongoDb().collection<WorkerInvitationRecord>("sanad_worker_invitations");

const INVITATION_TTL_DAYS = 14;
const invitationExpiresAt = (now = new Date()) =>
  new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function workerStatus(worker: WorkerRecord, companyId: number) {
  if (worker.workerAccountStatus === "deactivated") return "deactivated" as const;
  if (
    worker.workerAccountStatus === "active" ||
    (worker.workerAccountStatus == null &&
      worker.companyId === companyId &&
      worker.companyStatus === "approved")
  ) {
    return "active" as const;
  }
  return "invited" as const;
}

function workerDto(
  worker: WorkerRecord,
  companyId: number,
  invitation?: WorkerInvitationRecord,
) {
  return {
    workerId: worker.id,
    publicId: worker.publicId,
    name: worker.name,
    emailAddress: worker.emailAddress ?? null,
    workplace: worker.workplace,
    jobTitle: worker.jobTitle,
    department: worker.department ?? null,
    status: workerStatus(worker, companyId),
    invitationStatus: invitation?.status ?? null,
    invitationExpiresAt: invitation?.expiresAt.toISOString() ?? null,
    createdAt: worker.createdAt.toISOString(),
  };
}

function inviteRedirectUrl(req: Request, redirectPath: string | undefined) {
  const path = redirectPath || "/worker/invitation";
  if (!/^\/(?:[A-Za-z0-9_-]+\/)?worker\/invitation$/.test(path)) return null;
  const originHeader = req.get("origin");
  const host = req.get("host");
  if (!originHeader || !host) return null;
  try {
    const origin = new URL(originHeader);
    const requestOrigin = new URL(`${req.protocol}://${host}`);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== requestOrigin.origin
    ) {
      return null;
    }
    return new URL(path, origin.origin).toString();
  } catch {
    return null;
  }
}

async function approvedCompanyForUser(userId: string) {
  return companies().findOne({ ownerUserId: userId, status: "approved" });
}

async function latestInvitationForWorker(workerId: number) {
  return invitations()
    .find({ workerId })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
}

async function sendClerkInvitation(
  emailAddress: string,
  redirectUrl: string,
  invitationId: string,
) {
  return clerkClient.invitations.createInvitation({
    emailAddress,
    redirectUrl,
    expiresInDays: INVITATION_TTL_DAYS,
    ignoreExisting: true,
    notify: true,
    publicMetadata: { sanadWorkerInvitationId: invitationId },
  });
}

async function verifiedEmailForUser(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find(
    (entry) =>
      entry.id === user.primaryEmailAddressId &&
      entry.verification?.status === "verified",
  );
  if (!email) return null;
  return {
    emailAddress: email.emailAddress,
    emailNormalized: normalizeEmail(email.emailAddress),
  };
}

async function companyRoster(companyId: number) {
  const now = new Date();
  await invitations().updateMany(
    { companyId, status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired", updatedAt: now } },
  );
  const [workerRows, inviteRows] = await Promise.all([
    workers()
      .find({
        $or: [{ companyId }, { invitedCompanyId: companyId }],
        archivedAt: { $exists: false },
      })
      .sort({ createdAt: -1 })
      .toArray(),
    invitations().find({ companyId }).sort({ createdAt: -1 }).toArray(),
  ]);
  const latestByWorker = new Map<number, WorkerInvitationRecord>();
  for (const invite of inviteRows) {
    if (!latestByWorker.has(invite.workerId)) {
      latestByWorker.set(invite.workerId, invite);
    }
  }
  return workerRows.map((worker) =>
    workerDto(worker, companyId, latestByWorker.get(worker.id)),
  );
}

router.get(
  "/companies/me/workers",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }
    if (company.status !== "approved") {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    res.json(ListCompanyWorkersResponse.parse(await companyRoster(company.id)));
  },
);

router.post(
  "/companies/me/workers",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = CreateCompanyWorkerInvitationBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }
    if (company.status !== "approved") {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const redirectUrl = inviteRedirectUrl(req, body.data.redirectPath);
    if (!redirectUrl) {
      res.status(400).json({ error: "The invitation must return to this SANAD app." });
      return;
    }

    const emailAddress = body.data.emailAddress.trim();
    const emailNormalized = normalizeEmail(emailAddress);
    const existingPending = await invitations().findOne({
      emailNormalized,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });
    if (existingPending) {
      res.status(409).json({
        error: "This email already has an active SANAD worker invitation.",
      });
      return;
    }

    let existingWorker: WorkerRecord | null = null;
    let clerkUserId: string | undefined;
    let clerkInvitation: Awaited<ReturnType<typeof sendClerkInvitation>>;
    const invitationId = randomUUID();
    try {
      const clerkUsers = await clerkClient.users.getUserList({
        emailAddress: [emailAddress],
      });
      const existingClerkUser = clerkUsers.data.find((user) =>
        user.emailAddresses.some(
          (entry) => normalizeEmail(entry.emailAddress) === emailNormalized,
        ),
      );
      clerkUserId = existingClerkUser?.id;
      if (clerkUserId) {
        existingWorker = await workers().findOne({ ownerUserId: clerkUserId });
      }
      if (!existingWorker) {
        existingWorker = await workers().findOne({ emailNormalized });
      }
      if (
        existingWorker &&
        (existingWorker.archivedAt ||
          existingWorker.companyId != null ||
          (existingWorker.invitedCompanyId != null &&
            existingWorker.invitedCompanyId !== company.id) ||
          existingWorker.workerAccountStatus === "active" ||
          existingWorker.workerAccountStatus === "deactivated" ||
          (existingWorker.ownerUserId != null &&
            existingWorker.ownerUserId !== clerkUserId))
      ) {
        res.status(409).json({
          error: "This worker already has a company association or account state.",
        });
        return;
      }
      clerkInvitation = await sendClerkInvitation(
        emailAddress,
        redirectUrl,
        invitationId,
      );
    } catch {
      res.status(502).json({
        error: "Clerk could not send the invitation email. Check Clerk invitation settings.",
      });
      return;
    }

    const now = new Date();
    const worker: WorkerRecord =
      existingWorker ?? {
        id: 0,
        publicId: randomUUID(),
        name: body.data.name.trim(),
        avatarUrl: null,
        workplace: company.name,
        jobTitle: body.data.jobTitle?.trim() || "Team member",
        company: company.name,
        createdAt: now,
      };
    const invitation: WorkerInvitationRecord = {
      id: invitationId,
      companyId: company.id,
      workerId: existingWorker?.id ?? 0,
      emailAddress,
      emailNormalized,
      clerkInvitationId: clerkInvitation.id,
      redirectPath: body.data.redirectPath || "/worker/invitation",
      status: "pending",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      expiresAt: invitationExpiresAt(now),
    };

    try {
      await withMongoTransaction(async (session) => {
        let workerId = worker.id;
        if (existingWorker) {
          const result = await workers().updateOne(
            {
              id: existingWorker.id,
              companyId: null,
              workerAccountStatus: { $nin: ["active", "deactivated"] },
            },
            {
              $set: {
                name: body.data.name.trim(),
                emailAddress,
                emailNormalized,
                department: body.data.department?.trim() || null,
                workerAccountStatus: "invited",
                invitedCompanyId: company.id,
                company: company.name,
                jobTitle: body.data.jobTitle?.trim() || existingWorker.jobTitle || "Team member",
              },
            },
            { session },
          );
          if (result.modifiedCount !== 1) {
            throw new Error("Worker association changed.");
          }
        } else {
          workerId = await nextId("sanad_workers", session);
          worker.id = workerId;
          worker.emailAddress = emailAddress;
          worker.emailNormalized = emailNormalized;
          worker.department = body.data.department?.trim() || null;
          worker.workerAccountStatus = "invited";
          worker.invitedCompanyId = company.id;
          await workers().insertOne(worker, { session });
        }
        invitation.workerId = workerId;
        await invitations().insertOne(invitation, { session });
      });
    } catch (error) {
      try {
        await clerkClient.invitations.revokeInvitation(clerkInvitation.id);
      } catch {
        // The invitation is not returned to the browser; keep the error response credential-free.
      }
      if (isDuplicateKeyError(error)) {
        res.status(409).json({
          error: "This email or worker already has a pending invitation.",
        });
        return;
      }
      if (error instanceof Error && error.message === "Worker association changed.") {
        res.status(409).json({
          error: "This worker already has a company association or account state.",
        });
        return;
      }
      throw error;
    }

    const savedWorker = await workers().findOne({ id: invitation.workerId });
    if (!savedWorker) {
      res.status(500).json({ error: "Worker profile could not be loaded." });
      return;
    }
    res
      .status(201)
      .json(
        CreateCompanyWorkerInvitationResponse.parse(
          workerDto(savedWorker, company.id, invitation),
        ),
      );
  },
);

router.patch(
  "/companies/me/workers/:workerId",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = UpdateCompanyWorkerParams.safeParse(req.params);
    const body = UpdateCompanyWorkerBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Provide valid worker profile details." });
      return;
    }
    const company = await approvedCompanyForUser(userId);
    if (!company) {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const worker = await workers().findOne({
      id: params.data.workerId,
      $or: [{ companyId: company.id }, { invitedCompanyId: company.id }],
      archivedAt: { $exists: false },
    });
    if (!worker) {
      res.status(404).json({ error: "Worker not found for this company." });
      return;
    }
    if (worker.workerAccountStatus === "deactivated") {
      res.status(409).json({ error: "Deactivated profiles cannot be edited." });
      return;
    }
    const set: Record<string, unknown> = {};
    if (body.data.name !== undefined) set.name = body.data.name.trim();
    if (body.data.jobTitle !== undefined) {
      set.jobTitle = body.data.jobTitle?.trim() || "Team member";
    }
    if (body.data.department !== undefined) {
      set.department = body.data.department?.trim() || null;
    }
    await workers().updateOne({ id: worker.id }, { $set: set });
    const updated = await workers().findOne({ id: worker.id });
    const latest = await latestInvitationForWorker(worker.id);
    res.json(
      UpdateCompanyWorkerResponse.parse(
        workerDto(updated!, company.id, latest ?? undefined),
      ),
    );
  },
);

router.post(
  "/companies/me/workers/:workerId/resend-invitation",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = ResendCompanyWorkerInvitationParams.safeParse(req.params);
    const body = ResendCompanyWorkerInvitationBody.safeParse(req.body ?? {});
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid invitation request." });
      return;
    }
    const company = await approvedCompanyForUser(userId);
    if (!company) {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const worker = await workers().findOne({
      id: params.data.workerId,
      invitedCompanyId: company.id,
      workerAccountStatus: "invited",
      archivedAt: { $exists: false },
    });
    if (!worker?.emailAddress) {
      res.status(404).json({ error: "Pending worker not found." });
      return;
    }
    const redirectUrl = inviteRedirectUrl(req, body.data.redirectPath);
    if (!redirectUrl) {
      res.status(400).json({ error: "The invitation must return to this SANAD app." });
      return;
    }
    const invitationId = randomUUID();
    let clerkInvitation: Awaited<ReturnType<typeof sendClerkInvitation>>;
    try {
      clerkInvitation = await sendClerkInvitation(
        worker.emailAddress,
        redirectUrl,
        invitationId,
      );
    } catch {
      res.status(502).json({
        error: "Clerk could not send the invitation email. Check Clerk invitation settings.",
      });
      return;
    }
    const now = new Date();
    const existing = await invitations()
      .find({ workerId: worker.id, status: "pending" })
      .toArray();
    const invitation: WorkerInvitationRecord = {
      id: invitationId,
      companyId: company.id,
      workerId: worker.id,
      emailAddress: worker.emailAddress,
      emailNormalized: worker.emailNormalized || normalizeEmail(worker.emailAddress),
      clerkInvitationId: clerkInvitation.id,
      redirectPath: body.data.redirectPath || "/worker/invitation",
      status: "pending",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      expiresAt: invitationExpiresAt(now),
    };
    try {
      await withMongoTransaction(async (session) => {
        await invitations().updateMany(
          { workerId: worker.id, status: "pending" },
          { $set: { status: "revoked", revokedAt: now, updatedAt: now } },
          { session },
        );
        await invitations().insertOne(invitation, { session });
      });
    } catch {
      try {
        await clerkClient.invitations.revokeInvitation(clerkInvitation.id);
      } catch {
        // Keep provider errors and invitation URLs out of client responses.
      }
      res.status(503).json({ error: "Could not safely save the new invitation." });
      return;
    }
    for (const invite of existing) {
      try {
        await clerkClient.invitations.revokeInvitation(invite.clerkInvitationId);
      } catch {
        // The old local invitation is revoked and cannot activate the worker.
      }
    }
    res.json(
      ResendCompanyWorkerInvitationResponse.parse(
        workerDto(worker, company.id, invitation),
      ),
    );
  },
);

router.post(
  "/companies/me/workers/:workerId/revoke-invitation",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = RevokeCompanyWorkerInvitationParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const company = await approvedCompanyForUser(userId);
    if (!company) {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const worker = await workers().findOne({
      id: params.data.workerId,
      invitedCompanyId: company.id,
      workerAccountStatus: "invited",
      archivedAt: { $exists: false },
    });
    if (!worker) {
      res.status(404).json({ error: "Pending worker not found." });
      return;
    }
    const invite = await invitations().findOne({
      workerId: worker.id,
      companyId: company.id,
      status: "pending",
    });
    if (!invite) {
      res.status(409).json({ error: "No pending invitation can be revoked." });
      return;
    }
    if (invite.expiresAt <= new Date()) {
      const now = new Date();
      await invitations().updateOne(
        { id: invite.id, status: "pending" },
        { $set: { status: "expired", updatedAt: now } },
      );
      res.json(
        RevokeCompanyWorkerInvitationResponse.parse(
          workerDto(worker, company.id, { ...invite, status: "expired" }),
        ),
      );
      return;
    }
    try {
      await clerkClient.invitations.revokeInvitation(invite.clerkInvitationId);
    } catch {
      res.status(502).json({
        error: "Clerk could not revoke the invitation. No local status was changed.",
      });
      return;
    }
    const now = new Date();
    await invitations().updateOne(
      { id: invite.id, status: "pending" },
      { $set: { status: "revoked", revokedAt: now, updatedAt: now } },
    );
    res.json(
      RevokeCompanyWorkerInvitationResponse.parse(
        workerDto(worker, company.id, {
          ...invite,
          status: "revoked",
          revokedAt: now,
          updatedAt: now,
        }),
      ),
    );
  },
);

router.post(
  "/companies/me/workers/:workerId/deactivate",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = DeactivateCompanyWorkerParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const company = await approvedCompanyForUser(userId);
    if (!company) {
      res.status(403).json({ error: "Approved company access is required." });
      return;
    }
    const worker = await workers().findOne({
      id: params.data.workerId,
      companyId: company.id,
      archivedAt: { $exists: false },
    });
    if (!worker) {
      res.status(404).json({ error: "Worker not found for this company." });
      return;
    }
    if (workerStatus(worker, company.id) !== "active") {
      res.status(409).json({ error: "Worker is not active." });
      return;
    }
    const now = new Date();
    await workers().updateOne(
      { id: worker.id, companyId: company.id },
      { $set: { workerAccountStatus: "deactivated", deactivatedAt: now } },
    );
    const latest = await latestInvitationForWorker(worker.id);
    res.json(
      DeactivateCompanyWorkerResponse.parse(
        workerDto(
          { ...worker, workerAccountStatus: "deactivated", deactivatedAt: now },
          company.id,
          latest ?? undefined,
        ),
      ),
    );
  },
);

router.get(
  "/workers/me/invitation",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    let identity: Awaited<ReturnType<typeof verifiedEmailForUser>>;
    try {
      identity = await verifiedEmailForUser(userId);
    } catch {
      res.status(503).json({ error: "Could not verify this account with Clerk." });
      return;
    }
    if (!identity) {
      res.status(403).json({ error: "Verify your email address before accepting an invitation." });
      return;
    }
    const invite = await invitations().findOne({
      emailNormalized: identity.emailNormalized,
      status: "pending",
    });
    if (!invite) {
      res.json({ invitation: null });
      return;
    }
    if (invite.expiresAt <= new Date()) {
      await invitations().updateOne(
        { id: invite.id, status: "pending" },
        { $set: { status: "expired", updatedAt: new Date() } },
      );
      res.json({ invitation: null });
      return;
    }
    const [worker, company] = await Promise.all([
      workers().findOne({ id: invite.workerId }),
      companies().findOne({ id: invite.companyId, status: "approved" }),
    ]);
    if (!worker || !company || worker.invitedCompanyId !== company.id) {
      res.json({ invitation: null });
      return;
    }
    res.json(
      GetMyWorkerInvitationResponse.parse({
        invitation: {
          workerName: worker.name,
          jobTitle: worker.jobTitle,
          companyName: company.name,
          invitationExpiresAt: invite.expiresAt.toISOString(),
        },
      }),
    );
  },
);

router.post(
  "/workers/me/accept-invitation",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    let identity: Awaited<ReturnType<typeof verifiedEmailForUser>>;
    try {
      identity = await verifiedEmailForUser(userId);
    } catch {
      res.status(503).json({ error: "Could not verify this account with Clerk." });
      return;
    }
    if (!identity) {
      res.status(403).json({ error: "Verify your email address before accepting an invitation." });
      return;
    }
    const invite = await invitations().findOne({
      emailNormalized: identity.emailNormalized,
      status: "pending",
    });
    if (!invite) {
      const expired = await invitations().findOne({
        emailNormalized: identity.emailNormalized,
        status: { $in: ["expired", "revoked"] },
      });
      res
        .status(expired ? 410 : 404)
        .json({ error: expired ? "Invitation expired or was revoked." : "No current invitation matches this account." });
      return;
    }
    if (invite.expiresAt <= new Date()) {
      await invitations().updateOne(
        { id: invite.id, status: "pending" },
        { $set: { status: "expired", updatedAt: new Date() } },
      );
      res.status(410).json({ error: "Invitation expired or was revoked." });
      return;
    }
    // A pending invitation is bound to this primary verified email address.
    // Requiring provider invitation acceptance would block existing Clerk users.
    let outcome: "activated" | "conflict" | "expired" = "conflict";
    try {
      outcome = await withMongoTransaction(async (session) => {
        const currentInvite = await invitations().findOne(
          { id: invite.id, status: "pending", expiresAt: { $gt: new Date() } },
          { session },
        );
        const company = await companies().findOne(
          { id: invite.companyId, status: "approved" },
          { session },
        );
        const worker = await workers().findOne(
          { id: invite.workerId, invitedCompanyId: invite.companyId },
          { session },
        );
        const accountWorker = await workers().findOne(
          { ownerUserId: userId },
          { session },
        );
        if (!currentInvite || !company) return "expired";
        if (
          !worker ||
          worker.workerAccountStatus !== "invited" ||
          (worker.ownerUserId != null && worker.ownerUserId !== userId) ||
          (accountWorker != null && accountWorker.id !== worker.id)
        ) {
          return "conflict";
        }
        const now = new Date();
        const memberships = [...(worker.companyMemberships ?? [])];
        const membership = memberships.find(
          (item) => item.companyId === company.id && item.leftAt == null,
        );
        if (membership) {
          membership.companyName = company.name;
          membership.joinedAt ??= now;
        } else {
          memberships.push({
            companyId: company.id,
            companyName: company.name,
            joinedAt: now,
          });
        }
        const updated = await workers().findOneAndUpdate(
          {
            id: worker.id,
            invitedCompanyId: company.id,
            workerAccountStatus: "invited",
            $or: [{ ownerUserId: userId }, { ownerUserId: { $exists: false } }],
          },
          {
            $set: {
              ownerUserId: userId,
              emailAddress: identity.emailAddress,
              emailNormalized: identity.emailNormalized,
              companyId: company.id,
              companyStatus: "approved",
              company: company.name,
              workerAccountStatus: "active",
              companyMemberships: memberships,
            },
            $unset: { invitedCompanyId: "", requestedCompanyId: "" },
          },
          { returnDocument: "after", session },
        );
        if (!updated) return "conflict";
        await invitations().updateOne(
          { id: currentInvite.id, status: "pending" },
          {
            $set: {
              status: "accepted",
              acceptedAt: now,
              updatedAt: now,
            },
          },
          { session },
        );
        return "activated";
      });
    } catch {
      res.status(503).json({ error: "Could not safely activate this worker profile." });
      return;
    }
    if (outcome === "expired") {
      res.status(410).json({ error: "Invitation expired or was revoked." });
      return;
    }
    if (outcome !== "activated") {
      res.status(409).json({
        error: "The worker or company is no longer eligible for this invitation.",
      });
      return;
    }
    const activated = await workers().findOne({
      id: invite.workerId,
      ownerUserId: userId,
      workerAccountStatus: "active",
    });
    if (!activated) {
      res.status(503).json({ error: "Could not load the activated worker profile." });
      return;
    }
    res.json(
      AcceptMyWorkerInvitationResponse.parse({
        worker: {
          id: activated.id,
          publicId: activated.publicId,
          name: activated.name,
          avatarUrl: activated.avatarUrl,
          workplace: activated.workplace,
          jobTitle: activated.jobTitle,
          company: activated.company,
          createdAt: activated.createdAt.toISOString(),
        },
        companyStatus: "approved",
        accountStatus: "active",
        companyRequest: null,
      }),
    );
  },
);

export default router;
