import { Router, type IRouter } from "express";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type CompanyRecord,
  type SettlementRecord,
  type TipRecord,
  type WorkerCompanyRequestRecord,
  type WorkerRecord,
} from "@workspace/db";
import {
  CreateMyCompanyProfileBody,
  CreateMyCompanyProfileResponse,
  CreateWorkerCompanyRequestBody,
  CreateWorkerCompanyRequestResponse,
  GetMyCompanyDashboardResponse,
  GetMyCompanyProfileResponse,
  ListApprovedCompaniesResponse,
  ListPendingCompaniesResponse,
  ReviewCompanyBody,
  ReviewCompanyParams,
  ReviewCompanyResponse,
  ReviewWorkerCompanyRequestBody,
  ReviewWorkerCompanyRequestParams,
  ReviewWorkerCompanyRequestResponse,
} from "@workspace/api-zod";
import {
  requireAdmin,
  requireSignedIn,
  signedInUserId,
} from "../middleware/authz";

const router: IRouter = Router();
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const settlements = () =>
  getMongoDb().collection<SettlementRecord>("sanad_settlements");
const workerRequests = () =>
  getMongoDb().collection<WorkerCompanyRequestRecord>(
    "sanad_worker_company_requests",
  );

function companyDto(company: CompanyRecord) {
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

function publicWorkerDto(worker: WorkerRecord) {
  return {
    publicId: worker.publicId,
    name: worker.name,
    avatarUrl: worker.avatarUrl,
    workplace: worker.workplace,
    jobTitle: worker.jobTitle,
    company: worker.company,
    createdAt: worker.createdAt.toISOString(),
  };
}

function workerRequestDto(
  request: WorkerCompanyRequestRecord,
  company: CompanyRecord,
) {
  return {
    id: request.id,
    companyId: request.companyId,
    companyName: company.name,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  };
}

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
  return { start, end };
}

router.get("/companies/approved", async (_req, res): Promise<void> => {
  const rows = await companies()
    .find({ status: "approved" }, { projection: { id: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();
  res.json(
    ListApprovedCompaniesResponse.parse(
      rows.map(({ id, name }) => ({ id, name })),
    ),
  );
});

router.get(
  "/companies/me/profile",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const company = await companies().findOne({ ownerUserId: userId });
    res.json(
      GetMyCompanyProfileResponse.parse({
        company: company ? companyDto(company) : null,
      }),
    );
  },
);

router.post(
  "/companies/me/profile",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = CreateMyCompanyProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const name = parsed.data.name.trim();
    if (name.length < 2) {
      res.status(400).json({ error: "Company name must be at least 2 characters." });
      return;
    }
    if (await companies().findOne({ ownerUserId: userId })) {
      res.status(409).json({ error: "This account already owns a company profile." });
      return;
    }

    const now = new Date();
    const company: CompanyRecord = {
      id: await nextId("sanad_companies"),
      ownerUserId: userId,
      name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await companies().insertOne(company);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({ error: "This account already owns a company profile." });
        return;
      }
      throw error;
    }
    res
      .status(201)
      .json(CreateMyCompanyProfileResponse.parse(companyDto(company)));
  },
);

router.get(
  "/companies/me/dashboard",
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

    const { start, end } = monthRange();
    const members =
      company.status === "approved"
        ? await workers()
            .find({ companyId: company.id, companyStatus: "approved" })
            .sort({ createdAt: -1 })
            .toArray()
        : [];
    const memberIds = members.map((worker) => worker.id);
    const [monthTips, settlementRows, requestRows] = await Promise.all([
      memberIds.length
        ? tips()
            .find({ workerId: { $in: memberIds }, createdAt: { $gte: start, $lt: end } })
            .toArray()
        : Promise.resolve([]),
      memberIds.length
        ? settlements()
            .find({ workerId: { $in: memberIds } })
            .sort({ month: -1, updatedAt: -1 })
            .toArray()
        : Promise.resolve([]),
      company.status === "approved"
        ? workerRequests()
            .find({ companyId: company.id, status: "pending" })
            .sort({ createdAt: 1 })
            .toArray()
        : Promise.resolve([]),
    ]);

    const workerById = new Map(members.map((worker) => [worker.id, worker]));
    const workerSummaries = members.map((worker) => {
      const workerTips = monthTips.filter((tip) => tip.workerId === worker.id);
      const ratings = workerTips.flatMap((tip) =>
        tip.rating == null ? [] : [tip.rating],
      );
      return {
        worker: publicWorkerDto(worker),
        monthFils: workerTips.reduce((total, tip) => total + tip.amountFils, 0),
        totalTips: workerTips.length,
        averageRating:
          ratings.length > 0
            ? Math.round(
                (ratings.reduce((total, rating) => total + rating, 0) /
                  ratings.length) *
                  10,
              ) / 10
            : null,
        settlements: settlementRows
          .filter((settlement) => settlement.workerId === worker.id)
          .map((settlement) => ({
            id: settlement.id,
            publicId: worker.publicId,
            workerName: worker.name,
            month: settlement.month,
            amountFils: settlement.amountFils,
            status: settlement.status,
            updatedAt: settlement.updatedAt.toISOString(),
          })),
      };
    });

    const requests = requestRows.flatMap((request) => {
      const worker = workerById.get(request.workerId);
      return worker
        ? [
            {
              id: request.id,
              worker: publicWorkerDto(worker),
              status: request.status,
              createdAt: request.createdAt.toISOString(),
            },
          ]
        : [];
    });

    res.json(
      GetMyCompanyDashboardResponse.parse({
        company: companyDto(company),
        workers: workerSummaries,
        requests,
        monthFils: workerSummaries.reduce(
          (total, summary) => total + summary.monthFils,
          0,
        ),
        totalTips: workerSummaries.reduce(
          (total, summary) => total + summary.totalTips,
          0,
        ),
      }),
    );
  },
);

router.patch(
  "/companies/me/worker-requests/:id",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const params = ReviewWorkerCompanyRequestParams.safeParse(req.params);
    const body = ReviewWorkerCompanyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.error?.message ?? body.error?.message ?? "Invalid request.",
      });
      return;
    }

    const company = await companies().findOne({ ownerUserId: userId });
    if (!company) {
      res.status(404).json({ error: "Company profile not found." });
      return;
    }
    if (company.status !== "approved") {
      res.status(403).json({ error: "Company approval is required first." });
      return;
    }

    class AssociationChangedError extends Error {}
    let outcome: "ok" | "not-found" | "conflict";
    try {
      outcome = await withMongoTransaction(async (session) => {
        const request = await workerRequests().findOne(
          { id: params.data.id, companyId: company.id },
          { session },
        );
        if (!request) return "not-found";
        if (request.status !== "pending") return "conflict";
        const worker = await workers().findOne(
          {
            id: request.workerId,
            requestedCompanyId: company.id,
            companyStatus: "pending",
          },
          { session },
        );
        if (!worker || worker.companyId != null) return "conflict";

        const now = new Date();
        const requestUpdate = await workerRequests().updateOne(
          { id: request.id, companyId: company.id, status: "pending" },
          { $set: { status: body.data.status, updatedAt: now } },
          { session },
        );
        if (requestUpdate.modifiedCount !== 1) return "conflict";

        const workerUpdate =
          body.data.status === "approved"
            ? await workers().updateOne(
                {
                  id: worker.id,
                  requestedCompanyId: company.id,
                  companyStatus: "pending",
                  companyId: { $exists: false },
                },
                {
                  $set: {
                    companyId: company.id,
                    company: company.name,
                    companyStatus: "approved",
                  },
                  $unset: { requestedCompanyId: "" },
                },
                { session },
              )
            : await workers().updateOne(
                {
                  id: worker.id,
                  requestedCompanyId: company.id,
                  companyStatus: "pending",
                },
                {
                  $set: { companyStatus: "rejected" },
                  $unset: { requestedCompanyId: "" },
                },
                { session },
              );
        if (workerUpdate.modifiedCount !== 1) throw new AssociationChangedError();
        return "ok";
      });
    } catch (error) {
      if (!(error instanceof AssociationChangedError)) throw error;
      outcome = "conflict";
    }
    if (outcome === "not-found") {
      res.status(404).json({ error: "Request not found for this company." });
      return;
    }
    if (outcome === "conflict") {
      res.status(409).json({ error: "Request is no longer pending." });
      return;
    }

    const reviewedRequest = await workerRequests().findOne({
      id: params.data.id,
      companyId: company.id,
    });
    const reviewedWorker = reviewedRequest
      ? await workers().findOne({ id: reviewedRequest.workerId })
      : null;
    if (!reviewedRequest || !reviewedWorker) {
      res.status(404).json({ error: "Request not found for this company." });
      return;
    }
    res.json(
      ReviewWorkerCompanyRequestResponse.parse({
        id: reviewedRequest.id,
        worker: publicWorkerDto(reviewedWorker),
        status: reviewedRequest.status,
        createdAt: reviewedRequest.createdAt.toISOString(),
      }),
    );
  },
);

router.get(
  "/admin/companies",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await companies()
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(
      ListPendingCompaniesResponse.parse(rows.map(companyDto)),
    );
  },
);

router.patch(
  "/admin/companies/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ReviewCompanyParams.safeParse(req.params);
    const body = ReviewCompanyBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.error?.message ?? body.error?.message ?? "Invalid review.",
      });
      return;
    }

    const updated = await companies().findOneAndUpdate(
      { id: params.data.id, status: "pending" },
      { $set: { status: body.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) {
      const company = await companies().findOne({ id: params.data.id });
      if (!company) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      res.status(409).json({ error: "Company is no longer pending." });
      return;
    }
    res.json(
      ReviewCompanyResponse.parse(companyDto(updated)),
    );
  },
);

router.post(
  "/workers/me/company-requests",
  requireSignedIn,
  async (req, res): Promise<void> => {
    const userId = signedInUserId(req);
    const body = CreateWorkerCompanyRequestBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const company = await companies().findOne({
      id: body.data.companyId,
      status: "approved",
    });
    if (!company) {
      res.status(404).json({ error: "Approved company not found." });
      return;
    }
    const worker = await workers().findOne({ ownerUserId: userId });
    if (!worker) {
      res.status(404).json({ error: "Worker profile not found." });
      return;
    }
    if (
      worker.companyId != null ||
      worker.companyStatus === "pending" ||
      (await workerRequests().findOne({ workerId: worker.id, status: "pending" }))
    ) {
      res.status(409).json({ error: "This worker already has a company association or pending request." });
      return;
    }

    const request: WorkerCompanyRequestRecord = {
      id: await nextId("sanad_worker_company_requests"),
      workerId: worker.id,
      companyId: company.id,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await withMongoTransaction(async (session) => {
        await workerRequests().insertOne(request, { session });
        const result = await workers().updateOne(
          {
            id: worker.id,
            ownerUserId: userId,
            companyId: { $exists: false },
            companyStatus: { $ne: "pending" },
          },
          {
            $set: {
              companyStatus: "pending",
              requestedCompanyId: company.id,
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1) throw new Error("Worker association changed.");
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({ error: "A company request is already pending." });
        return;
      }
      if (error instanceof Error && error.message === "Worker association changed.") {
        res.status(409).json({ error: "This worker already has a company association or pending request." });
        return;
      }
      throw error;
    }
    res
      .status(201)
      .json(
        CreateWorkerCompanyRequestResponse.parse(
          workerRequestDto(request, company),
        ),
      );
  },
);

export default router;
