import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import Stripe from "stripe";
import {
  getMongoDb,
  nextId,
  withMongoTransaction,
  type ChildActivityRecord,
  type ChildRecord,
  type CompanyRecord,
  type SanadPaymentRecord,
  type TipRecord,
  type WorkerRecord,
  type MongoSession,
} from "@workspace/db";
import {
  CancelPaymentCheckoutParams,
  CancelPaymentCheckoutResponse,
  CompleteSimulatedPaymentParams,
  CompleteSimulatedPaymentResponse,
  CreatePaymentCheckoutBody,
  CreatePaymentCheckoutResponse,
  GetPaymentCheckoutParams,
  GetPaymentCheckoutResponse,
  VerifyStripeCheckoutBody,
  VerifyStripeCheckoutParams,
  VerifyStripeCheckoutResponse,
} from "@workspace/api-zod";
import { isAdminUser, signedInUserId } from "../middleware/authz";
import { appendWorkerLedgerEvent } from "../lib/workerFinance";
import { rateLimitPublicRequests } from "../lib/publicRateLimit";
import { logger } from "../lib/logger";
import {
  convertKwdFilsToUsdCents,
  EXCHANGE_RATE_PROVIDER,
  getKwdUsdRate,
  STRIPE_USD_MINIMUM_CENTS,
  type KwdUsdRate,
} from "../lib/exchangeRate";
import {
  isTestStripeSecretKey,
  paymentSettlementDecision,
  stripeSessionMatchesPayment,
  verifyStripeWebhookEvent,
} from "../lib/paymentRules";

const router: IRouter = Router();
const payments = () =>
  getMongoDb().collection<SanadPaymentRecord>("sanad_payments");
const workers = () => getMongoDb().collection<WorkerRecord>("sanad_workers");
const children = () => getMongoDb().collection<ChildRecord>("sanad_children");
const tips = () => getMongoDb().collection<TipRecord>("sanad_tips");
const companies = () =>
  getMongoDb().collection<CompanyRecord>("sanad_companies");
const activities = () =>
  getMongoDb().collection<ChildActivityRecord>("sanad_child_activity");
const personalWallets = () =>
  getMongoDb().collection<{
    ownerUserId: string;
    balanceFils: number;
    createdAt: Date;
    updatedAt: Date;
  }>("sanad_user_wallets");
const personalLedger = () =>
  getMongoDb().collection<{
    id: string;
    ownerUserId: string;
    kind: "topup" | "sent" | "received";
    amountFils: number;
    sourceKey: string;
    reference: string;
    description: string;
    status: "paid" | "demo_completed";
    createdAt: Date;
  }>("sanad_user_wallet_ledger");

const DEMO_NOTICE =
  "SIMULATED PAYMENT — UNIVERSITY DEMO. No real payment was processed.";
const STRIPE_TEST_NOTICE =
  "Stripe test checkout only. No live payment or payout is enabled.";

class PaymentCheckoutError extends Error {
  constructor(
    message: string,
    readonly statusCode = 503,
    readonly diagnosticCode = "stripe_checkout_unavailable",
  ) {
    super(message);
    this.name = "PaymentCheckoutError";
  }
}

type PaymentResult =
  | { kind: "ok"; payment: SanadPaymentRecord }
  | { kind: "missing" }
  | { kind: "conflict"; message: string };

function stripeSecretKey(): string | undefined {
  const key =
    process.env.STRIPE_SECRET_KEY?.trim() || process.env.Secretkey?.trim();
  return isTestStripeSecretKey(key) ? key : undefined;
}

function stripeClient(): Stripe | null {
  const key = stripeSecretKey();
  return key ? new Stripe(key) : null;
}

function safeStripeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return error.message
    .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 2000);
}

function appOrigin(req: Request): string | null {
  const configured = process.env.SANAD_PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.hostname === "localhost") {
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
      }
    } catch {
      return null;
    }
    return null;
  }

  const host = (
    req.get("x-forwarded-host")?.split(",")[0] ??
    req.get("host") ??
    ""
  ).trim();
  if (!host || /[\s/@\\]/.test(host)) return null;
  const deploymentHost = process.env.VERCEL_URL?.trim();
  const replitHosts = [
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
    process.env.REPLIT_DEV_DOMAIN ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (deploymentHost && host === deploymentHost) return `https://${host}`;
  if (replitHosts.includes(host)) return `https://${host}/sanad`;
  if (
    host.endsWith(".vercel.app") ||
    host.endsWith(".replit.app") ||
    host.endsWith(".replit.dev")
  ) {
    return host.endsWith(".replit.app") || host.endsWith(".replit.dev")
      ? `https://${host}/sanad`
      : `https://${host}`;
  }
  if (process.env.NODE_ENV !== "production" && /^localhost(?::\d+)?$/.test(host)) {
    return `http://${host}`;
  }
  return null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Child";
}

function safePaymentDto(payment: SanadPaymentRecord) {
  return {
    paymentId: payment.paymentId,
    flow: payment.flow,
    provider: payment.provider,
    status: payment.status,
    amountFils: payment.amountFils,
    currency: payment.currency,
    label: payment.label,
    checkoutUrl: payment.checkoutUrl ?? null,
    usdChargeCents: payment.usdChargeCents ?? null,
    usdCurrency: payment.usdCurrency ?? null,
    usdPerKwd: payment.usdPerKwd ?? null,
    rateProvider: payment.rateProvider ?? null,
    rateUpdatedAt: payment.rateUpdatedAt ?? null,
    roundingMethod: payment.roundingMethod ?? null,
    reference: payment.reference ?? null,
    notice: payment.notice ?? null,
    createdAt: payment.createdAt,
  };
}

function matchesPayment(
  existing: SanadPaymentRecord,
  requested: Pick<
    SanadPaymentRecord,
    | "flow"
    | "amountFils"
    | "ownerUserId"
    | "workerId"
    | "childId"
    | "publicId"
    | "rating"
    | "message"
    | "customerName"
  >,
): boolean {
  return (
    existing.flow === requested.flow &&
    existing.amountFils === requested.amountFils &&
    existing.ownerUserId === requested.ownerUserId &&
    existing.workerId === requested.workerId &&
    existing.childId === requested.childId &&
    existing.publicId === requested.publicId &&
    (existing.rating ?? null) === (requested.rating ?? null) &&
    (existing.message ?? null) === (requested.message ?? null) &&
    (existing.customerName ?? null) === (requested.customerName ?? null)
  );
}

function mayAccessPayment(
  req: Request,
  payment: SanadPaymentRecord,
): Promise<boolean> {
  if (!payment.ownerUserId) return Promise.resolve(true);
  const userId = signedInUserId(req);
  if (!userId) return Promise.resolve(false);
  if (userId === payment.ownerUserId) return Promise.resolve(true);
  return isAdminUser(userId);
}

async function createStripeSession(
  req: Request,
  payment: SanadPaymentRecord,
): Promise<Partial<SanadPaymentRecord>> {
  const stripe = stripeClient();
  const origin = appOrigin(req);
  if (!stripe) {
    logger.error(
      { testKeyConfigured: Boolean(stripeSecretKey()) },
      "Stripe test Checkout is not configured",
    );
    throw new PaymentCheckoutError(
      "Stripe test Checkout is not configured. No payment was started.",
    );
  }
  if (!origin) {
    logger.error(
      { publicOriginConfigured: Boolean(process.env.SANAD_PUBLIC_BASE_URL?.trim()) },
      "SANAD public checkout origin is not configured",
    );
    throw new PaymentCheckoutError(
      "SANAD’s secure checkout return address is not configured. No payment was started.",
      503,
      "checkout_origin_unavailable",
    );
  }
  if (
    payment.flow !== "worker_tip" ||
    !Number.isSafeInteger(payment.usdChargeCents) ||
    (payment.usdChargeCents ?? 0) < STRIPE_USD_MINIMUM_CENTS ||
    payment.usdCurrency !== "USD" ||
    payment.usdPerKwd == null ||
    !payment.rateUpdatedAt
  ) {
    throw new PaymentCheckoutError(
      "A valid USD conversion is missing. No payment was started.",
      503,
      "usd_conversion_missing",
    );
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        allowed_payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: payment.usdChargeCents,
              product_data: {
                name: `SANAD ${payment.label}`,
                description: STRIPE_TEST_NOTICE,
              },
            },
          },
        ],
        client_reference_id: payment.paymentId,
        metadata: {
          sanad_payment_id: payment.paymentId,
          sanad_flow: payment.flow,
          sanad_kwd_amount_fils: String(payment.amountFils),
          sanad_currency: "usd",
          sanad_usd_charge_cents: String(payment.usdChargeCents),
          sanad_usd_per_kwd: String(payment.usdPerKwd),
          sanad_rate_updated_at: payment.rateUpdatedAt.toISOString(),
        },
        success_url: `${origin}/checkout/return?paymentId=${payment.paymentId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout/cancel?paymentId=${payment.paymentId}`,
      },
      { idempotencyKey: `sanad-checkout-${payment.paymentId}` },
    );

    if (
      !session.url ||
      session.livemode !== false ||
      session.currency?.toLowerCase() !== "usd" ||
      session.amount_total !== payment.usdChargeCents
    ) {
      logger.warn(
        {
          sessionId: session.id,
          livemode: session.livemode,
          currency: session.currency,
          amountTotal: session.amount_total,
        },
        "Stripe returned an unexpected test Checkout Session",
      );
      throw new PaymentCheckoutError(
        "Stripe did not return the expected USD test checkout. No payment was started.",
        503,
        "stripe_session_mismatch",
      );
    }
    return {
      provider: "stripe_test",
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      notice: STRIPE_TEST_NOTICE,
    };
  } catch (error) {
    if (error instanceof PaymentCheckoutError) throw error;
    const value =
      typeof error === "object" && error !== null
        ? (error as {
            type?: unknown;
            code?: unknown;
            param?: unknown;
            statusCode?: unknown;
          })
        : {};
    logger.warn(
      {
        errorName: error instanceof Error ? error.name : "UnknownStripeError",
        errorType:
          typeof value.type === "string" ? value.type.slice(0, 48) : undefined,
        errorCode:
          typeof value.code === "string" ? value.code.slice(0, 48) : undefined,
        errorParam:
          typeof value.param === "string" ? value.param.slice(0, 48) : undefined,
        errorMessage: safeStripeErrorMessage(error),
        httpStatus:
          typeof value.statusCode === "number" ? value.statusCode : undefined,
      },
      "Stripe test Checkout creation failed",
    );
    throw new PaymentCheckoutError(
      "Stripe test Checkout could not be started. No payment was charged.",
      503,
      typeof value.code === "string" ? value.code.slice(0, 48) : "stripe_api_error",
    );
  }
}

async function createAndRespondStripeCheckout(
  req: Request,
  payment: SanadPaymentRecord,
  res: Response,
  responseStatus: number,
): Promise<void> {
  try {
    const stripeFields = await createStripeSession(req, payment);
    const updated = await payments().findOneAndUpdate(
      { paymentId: payment.paymentId, status: "pending" },
      { $set: { ...stripeFields, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) {
      res.status(409).json({
        error: "Checkout state changed. Refresh before trying again.",
      });
      return;
    }
    res.status(responseStatus).json(
      CreatePaymentCheckoutResponse.parse(safePaymentDto(updated)),
    );
  } catch (error) {
    const failure =
      error instanceof PaymentCheckoutError
        ? error
        : new PaymentCheckoutError(
            "Stripe test Checkout could not be started. No payment was charged.",
          );
    logger.warn(
      {
        paymentId: payment.paymentId,
        diagnosticCode: failure.diagnosticCode,
      },
      "Customer tip Checkout failed without simulated fallback",
    );
    try {
      await payments().updateOne(
        { paymentId: payment.paymentId, status: "pending" },
        {
          $set: {
            status: "failed",
            notice: failure.message,
            updatedAt: new Date(),
          },
        },
      );
    } catch (databaseError) {
      logger.error(
        {
          paymentId: payment.paymentId,
          errorName:
            databaseError instanceof Error
              ? databaseError.name
              : "UnknownDatabaseError",
        },
        "Could not record failed Stripe test Checkout",
      );
    }
    res.status(failure.statusCode).json({ error: failure.message });
  }
}

async function ensurePersonalWallet(
  ownerUserId: string,
  session: MongoSession,
): Promise<void> {
  const now = new Date();
  await personalWallets().updateOne(
    { ownerUserId },
    { $setOnInsert: { balanceFils: 0, createdAt: now, updatedAt: now } },
    { upsert: true, session },
  );
}

async function creditPayment(
  payment: SanadPaymentRecord,
  status: "paid" | "demo_completed",
  session: MongoSession,
): Promise<string> {
  const now = new Date();
  const reference = randomUUID();

  if (payment.flow === "worker_tip") {
    if (payment.workerId == null) throw new Error("Payment worker is missing.");
    const worker = await workers().findOne(
      { id: payment.workerId },
      { session },
    );
    if (!worker) throw new Error("Payment worker no longer exists.");
    const payoutCompany =
      worker.companyId != null &&
      worker.companyStatus === "approved" &&
      worker.workerAccountStatus !== "deactivated" &&
      worker.workerAccountStatus !== "invited"
        ? await companies().findOne(
            { id: worker.companyId, status: "approved" },
            { session },
          )
        : null;
    if (!payoutCompany) {
      throw new Error("Worker is not active in an approved company.");
    }
    const tip: TipRecord = {
      id: await nextId("sanad_tips", session),
      reference,
      workerId: worker.id,
      amountFils: payment.amountFils,
      rating: payment.rating ?? null,
      message: payment.message ?? null,
      customerName: payment.customerName?.trim() || "Anonymous",
      idempotencyKey: payment.paymentId,
      status,
      createdAt: now,
      payoutMethod: "company",
      payoutCompanyId: payoutCompany.id,
      payoutCompanyName: payoutCompany.name,
    };
    await tips().insertOne(tip, { session });
    return reference;
  }

  if (payment.flow === "child_topup" || payment.flow === "child_qr_transfer") {
    if (payment.childId == null) throw new Error("Payment child is missing.");
    const child = await children().findOne(
      { id: payment.childId },
      { session },
    );
    if (!child) throw new Error("Payment child no longer exists.");
    const activity: ChildActivityRecord = {
      id: await nextId("sanad_child_activity", session),
      childId: child.id,
      title:
        payment.flow === "child_qr_transfer"
          ? "Direct QR transfer received"
          : "Wallet top-up",
      amountFils: payment.amountFils,
      kind: payment.flow === "child_qr_transfer" ? "transfer" : "top_up",
      createdAt: now,
    };
    await activities().insertOne(activity, { session });
    return reference;
  }

  if (!payment.ownerUserId) {
    throw new Error("Personal wallet payment is missing its owner.");
  }
  await ensurePersonalWallet(payment.ownerUserId, session);
  await personalWallets().updateOne(
    { ownerUserId: payment.ownerUserId },
    { $inc: { balanceFils: payment.amountFils }, $set: { updatedAt: now } },
    { session },
  );
  await personalLedger().insertOne(
    {
      id: randomUUID(),
      ownerUserId: payment.ownerUserId,
      kind: "topup",
      amountFils: payment.amountFils,
      sourceKey: `payment:${payment.paymentId}:topup`,
      reference: payment.paymentId,
      description:
        status === "paid"
          ? "Stripe test wallet top-up"
          : "Simulated wallet top-up (university demo)",
      status,
      createdAt: now,
    },
    { session },
  );
  return payment.paymentId;
}

export async function settlePayment(
  paymentId: string,
  status: "paid" | "demo_completed",
): Promise<PaymentResult> {
  return withMongoTransaction(async (session) => {
    const payment = await payments().findOne({ paymentId }, { session });
    if (!payment) return { kind: "missing" };
    const decision = paymentSettlementDecision(payment.status, status);
    if (decision === "already_applied") {
      return { kind: "ok", payment };
    }
    if (decision === "conflict") {
      return {
        kind: "conflict",
        message: "This checkout is no longer pending.",
      };
    }

    const reference = await creditPayment(payment, status, session);
    const updatedAt = new Date();
    const result = await payments().updateOne(
      { paymentId, status: "pending" },
      { $set: { status, reference, updatedAt } },
      { session },
    );
    if (result.matchedCount !== 1) {
      throw new Error("Checkout status changed during settlement.");
    }
    return {
      kind: "ok",
      payment: { ...payment, status, reference, updatedAt },
    };
  });
}

function stripeSessionIdentifiesPayment(
  payment: SanadPaymentRecord,
  session: Stripe.Checkout.Session,
): boolean {
  return (
    payment.provider === "stripe_test" &&
    payment.checkoutSessionId === session.id &&
    session.metadata?.sanad_payment_id === payment.paymentId &&
    session.client_reference_id === payment.paymentId
  );
}

export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.get("stripe-signature");
  if (!stripe || !webhookSecret) {
    logger.error(
      {
        testStripeKeyConfigured: Boolean(stripe),
        webhookSecretConfigured: Boolean(webhookSecret),
      },
      "Stripe test webhook is not configured",
    );
    res.status(503).json({ error: "Stripe test webhook is not configured." });
    return;
  }
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "A signed Stripe webhook is required." });
    return;
  }

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhookEvent(
      stripe,
      req.body,
      signature,
      webhookSecret,
    );
  } catch (error) {
    logger.warn(
      {
        errorName:
          error instanceof Error ? error.name : "UnknownStripeSignatureError",
      },
      "Stripe test webhook signature verification failed",
    );
    res.status(400).json({ error: "Stripe webhook signature is invalid." });
    return;
  }
  if (event.livemode) {
    logger.warn({ eventId: event.id }, "Rejected a live-mode Stripe webhook");
    res.status(400).json({ error: "SANAD accepts test-mode webhooks only." });
    return;
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    const payment = await payments().findOne({
      checkoutSessionId: eventSession.id,
      provider: "stripe_test",
    });
    if (!payment || !stripeSessionIdentifiesPayment(payment, eventSession)) {
      logger.warn(
        { eventId: event.id, sessionId: eventSession.id },
        "Ignored Stripe webhook for an unknown SANAD checkout",
      );
      res.status(200).json({ received: true });
      return;
    }

    let verifiedSession: Stripe.Checkout.Session;
    try {
      verifiedSession = await stripe.checkout.sessions.retrieve(eventSession.id);
    } catch (error) {
      logger.error(
        {
          eventId: event.id,
          sessionId: eventSession.id,
          errorName:
            error instanceof Error ? error.name : "UnknownStripeError",
        },
        "Could not verify a Stripe webhook session",
      );
      res.status(500).json({ error: "Stripe session verification failed." });
      return;
    }
    if (!stripeSessionMatchesPayment(payment, verifiedSession)) {
      logger.warn(
        { eventId: event.id, paymentId: payment.paymentId },
        "Stripe webhook session did not match the pending SANAD payment",
      );
      res.status(200).json({ received: true });
      return;
    }

    const outcome = await settlePayment(payment.paymentId, "paid");
    if (outcome.kind === "conflict") {
      logger.warn(
        { eventId: event.id, paymentId: payment.paymentId },
        "Stripe webhook could not settle a non-pending SANAD payment",
      );
    }
    res.status(200).json({ received: true });
    return;
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const failedSession = event.data.object as Stripe.Checkout.Session;
    const payment = await payments().findOne({
      checkoutSessionId: failedSession.id,
      provider: "stripe_test",
      status: "pending",
    });
    if (payment && stripeSessionIdentifiesPayment(payment, failedSession)) {
      await payments().updateOne(
        { paymentId: payment.paymentId, status: "pending" },
        {
          $set: {
            status:
              event.type === "checkout.session.expired" ? "expired" : "failed",
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  res.status(200).json({ received: true });
}

router.post(
  "/payments/checkout",
  rateLimitPublicRequests({
    scope: "sanad-payment-checkout",
    limit: 60,
    windowMs: 15 * 60 * 1000,
  }),
  async (req, res): Promise<void> => {
    const parsed = CreatePaymentCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    const userId = signedInUserId(req);
    const requested: Pick<
      SanadPaymentRecord,
      | "flow"
      | "amountFils"
      | "ownerUserId"
      | "workerId"
      | "childId"
      | "publicId"
      | "rating"
      | "message"
      | "customerName"
    > = {
      flow: body.flow,
      amountFils: body.amountFils,
      rating: body.rating ?? null,
      message: body.message?.trim() || null,
      customerName: body.customerName?.trim() || null,
    };
    let label = "SANAD wallet top-up";

    if (body.flow === "worker_tip") {
      if (!body.publicId) {
        res.status(400).json({ error: "A worker QR identifier is required." });
        return;
      }
      const worker = await workers().findOne({
        publicId: body.publicId,
        companyStatus: "approved",
        companyId: { $exists: true },
        $or: [
          { workerAccountStatus: "active" },
          { workerAccountStatus: { $exists: false } },
        ],
        archivedAt: { $exists: false },
      });
      const approvedCompany = worker?.companyId != null
        ? await companies().findOne({
            id: worker.companyId,
            status: "approved",
          })
        : null;
      if (!worker || !approvedCompany) {
        res.status(404).json({ error: "Worker not found." });
        return;
      }
      requested.workerId = worker.id;
      requested.publicId = worker.publicId;
      label = `Tip for ${worker.name}`;
    } else if (body.flow === "child_qr_transfer") {
      if (!body.publicId) {
        res.status(400).json({ error: "A child QR identifier is required." });
        return;
      }
      const child = await children().findOne(
        { publicId: body.publicId },
        { projection: { id: 1, publicId: 1, name: 1 } },
      );
      if (!child) {
        res.status(404).json({ error: "Child not found." });
        return;
      }
      requested.childId = child.id;
      requested.publicId = child.publicId;
      label = `Direct QR transfer for ${firstName(child.name)}`;
    } else if (body.flow === "child_topup") {
      if (!userId) {
        res.status(401).json({ error: "Sign in to fund a child wallet." });
        return;
      }
      if (!body.childId) {
        res.status(400).json({ error: "A child account is required." });
        return;
      }
      const child = await children().findOne(
        { id: body.childId },
        { projection: { id: 1, name: 1, ownerUserId: 1 } },
      );
      const isAdmin = await isAdminUser(userId);
      if (!child || (!isAdmin && child.ownerUserId !== userId)) {
        res.status(404).json({ error: "Child account not found or not accessible." });
        return;
      }
      requested.ownerUserId = userId;
      requested.childId = child.id;
      label = `Add money to ${firstName(child.name)}'s wallet`;
    } else {
      if (!userId) {
        res.status(401).json({ error: "Sign in to add money to a personal wallet." });
        return;
      }
      requested.ownerUserId = userId;
      label = "Add money to your SANAD wallet";
    }

    const existing = await payments().findOne({
      idempotencyKey: body.idempotencyKey,
    });
    if (existing) {
      if (!matchesPayment(existing, requested)) {
        res.status(409).json({
          error: "This checkout key was already used with different details.",
        });
        return;
      }
      if (
        existing.flow === "worker_tip" &&
        existing.provider === "simulated" &&
        existing.status === "pending"
      ) {
        res.status(409).json({
          error:
            "This older tip checkout used simulation and cannot be completed. Start a new tip checkout.",
        });
        return;
      }
      if (
        existing.flow === "worker_tip" &&
        existing.provider === "stripe_test" &&
        existing.status === "pending" &&
        !existing.checkoutSessionId
      ) {
        await createAndRespondStripeCheckout(req, existing, res, 200);
        return;
      }
      if (
        existing.flow === "worker_tip" &&
        existing.status === "failed"
      ) {
        res.status(409).json({
          error:
            existing.notice ??
            "This tip checkout failed. Start a new checkout to try again.",
        });
        return;
      }
      res.status(200).json(
        CreatePaymentCheckoutResponse.parse(safePaymentDto(existing)),
      );
      return;
    }

    let rate: KwdUsdRate | undefined;
    let usdChargeCents: number | undefined;
    if (body.flow === "worker_tip") {
      try {
        rate = await getKwdUsdRate();
        usdChargeCents = convertKwdFilsToUsdCents(
          body.amountFils,
          rate.usdPerKwd,
        );
      } catch (error) {
        logger.warn(
          {
            errorName:
              error instanceof Error ? error.name : "UnknownExchangeRateError",
          },
          "KWD-to-USD conversion failed; tip checkout was not created",
        );
        res.status(503).json({
          error:
            "A current KWD-to-USD rate is unavailable. No payment was started; please try again later.",
        });
        return;
      }
      if (usdChargeCents < STRIPE_USD_MINIMUM_CENTS) {
        res.status(422).json({
          error: `This tip converts to USD ${(usdChargeCents / 100).toFixed(2)}, below Stripe’s $0.50 USD card minimum. Choose a larger KWD amount.`,
        });
        return;
      }
    }

    const now = new Date();
    let payment: SanadPaymentRecord = {
      paymentId: randomUUID(),
      ...requested,
      provider: body.flow === "worker_tip" ? "stripe_test" : "simulated",
      status: "pending",
      currency: "KWD",
      label,
      idempotencyKey: body.idempotencyKey,
      notice:
        body.flow === "worker_tip" ? STRIPE_TEST_NOTICE : DEMO_NOTICE,
      ...(rate && usdChargeCents != null
        ? {
            usdChargeCents,
            usdCurrency: "USD" as const,
            usdPerKwd: rate.usdPerKwd,
            rateProvider: EXCHANGE_RATE_PROVIDER,
            rateUpdatedAt: rate.updatedAt,
            roundingMethod: "nearest_cent" as const,
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await payments().insertOne(payment);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const duplicate = await payments().findOne({
          idempotencyKey: body.idempotencyKey,
        });
        if (duplicate && matchesPayment(duplicate, requested)) {
          if (
            duplicate.flow === "worker_tip" &&
            duplicate.provider === "stripe_test" &&
            duplicate.status === "pending" &&
            !duplicate.checkoutSessionId
          ) {
            await createAndRespondStripeCheckout(req, duplicate, res, 200);
            return;
          }
          res.status(200).json(
            CreatePaymentCheckoutResponse.parse(safePaymentDto(duplicate)),
          );
          return;
        }
        res.status(409).json({
          error: "This checkout key was already used with different details.",
        });
        return;
      }
      throw error;
    }

    if (payment.flow === "worker_tip") {
      await createAndRespondStripeCheckout(req, payment, res, 201);
      return;
    }
    res.status(201).json(
      CreatePaymentCheckoutResponse.parse(safePaymentDto(payment)),
    );
  },
);

router.get(
  "/payments/:paymentId",
  async (req, res): Promise<void> => {
    const params = GetPaymentCheckoutParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Checkout not found." });
      return;
    }
    const payment = await payments().findOne({
      paymentId: params.data.paymentId,
    });
    if (!payment || !(await mayAccessPayment(req, payment))) {
      res.status(404).json({ error: "Checkout not found or not accessible." });
      return;
    }
    res.json(GetPaymentCheckoutResponse.parse(safePaymentDto(payment)));
  },
);

router.post(
  "/payments/:paymentId/complete-simulated",
  async (req, res): Promise<void> => {
    const params = CompleteSimulatedPaymentParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Checkout not found." });
      return;
    }
    const payment = await payments().findOne({
      paymentId: params.data.paymentId,
    });
    if (!payment || !(await mayAccessPayment(req, payment))) {
      res.status(404).json({ error: "Checkout not found or not accessible." });
      return;
    }
    if (payment.flow === "worker_tip" || payment.provider !== "simulated") {
      res.status(409).json({
        error:
          "Customer tips require Stripe test Checkout and cannot be completed as simulated payments.",
      });
      return;
    }
    const outcome = await settlePayment(payment.paymentId, "demo_completed");
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Checkout not found." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: outcome.message });
      return;
    }
    res.json(
      CompleteSimulatedPaymentResponse.parse(
        safePaymentDto({
          ...outcome.payment,
          notice: DEMO_NOTICE,
        }),
      ),
    );
  },
);

router.post(
  "/payments/:paymentId/verify",
  async (req, res): Promise<void> => {
    const params = VerifyStripeCheckoutParams.safeParse(req.params);
    const body = VerifyStripeCheckoutBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Checkout verification details are invalid." });
      return;
    }
    const payment = await payments().findOne({
      paymentId: params.data.paymentId,
    });
    if (!payment || !(await mayAccessPayment(req, payment))) {
      res.status(404).json({ error: "Checkout not found or not accessible." });
      return;
    }
    if (
      payment.provider !== "stripe_test" ||
      payment.checkoutSessionId !== body.data.sessionId
    ) {
      res.status(409).json({ error: "This Stripe Checkout Session does not match." });
      return;
    }
    const stripe = stripeClient();
    if (!stripe) {
      res.status(503).json({
        error: "Stripe test verification is unavailable. No wallet credit was applied.",
      });
      return;
    }
    let stripeSession: Stripe.Checkout.Session;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(
        body.data.sessionId,
      );
    } catch (error) {
      logger.warn(
        {
          errorName: error instanceof Error ? error.name : "UnknownStripeError",
        },
        "Could not retrieve Stripe test Checkout Session",
      );
      res.status(503).json({
        error: "Could not verify this checkout with Stripe. No wallet credit was applied.",
      });
      return;
    }
    if (!stripeSessionMatchesPayment(payment, stripeSession)) {
      res.status(409).json({
        error: "Stripe has not confirmed a matching successful test payment.",
      });
      return;
    }
    const outcome = await settlePayment(payment.paymentId, "paid");
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Checkout not found." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: outcome.message });
      return;
    }
    res.json(
      VerifyStripeCheckoutResponse.parse(
        safePaymentDto({
          ...outcome.payment,
          notice: STRIPE_TEST_NOTICE,
        }),
      ),
    );
  },
);

router.post(
  "/payments/:paymentId/cancel",
  async (req, res): Promise<void> => {
    const params = CancelPaymentCheckoutParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Checkout not found." });
      return;
    }
    const payment = await payments().findOne({
      paymentId: params.data.paymentId,
    });
    if (!payment || !(await mayAccessPayment(req, payment))) {
      res.status(404).json({ error: "Checkout not found or not accessible." });
      return;
    }
    if (payment.status === "paid" || payment.status === "demo_completed") {
      res.json(CancelPaymentCheckoutResponse.parse(safePaymentDto(payment)));
      return;
    }
    if (payment.status !== "pending") {
      res.json(CancelPaymentCheckoutResponse.parse(safePaymentDto(payment)));
      return;
    }

    let finalStatus: "cancelled" | "expired" = "cancelled";
    if (payment.provider === "stripe_test" && payment.checkoutSessionId) {
      const stripe = stripeClient();
      if (!stripe) {
        res.status(503).json({
          error: "Stripe test cancellation is unavailable. Checkout state was not changed.",
        });
        return;
      }
      try {
        const session = await stripe.checkout.sessions.retrieve(
          payment.checkoutSessionId,
        );
        if (stripeSessionMatchesPayment(payment, session)) {
          const outcome = await settlePayment(payment.paymentId, "paid");
          if (outcome.kind === "ok") {
            res.json(
              CancelPaymentCheckoutResponse.parse(
                safePaymentDto(outcome.payment),
              ),
            );
            return;
          }
          res.status(409).json({ error: "Paid checkout could not be settled." });
          return;
        }
        if (session.status === "open") {
          await stripe.checkout.sessions.expire(payment.checkoutSessionId);
        } else if (session.status === "expired") {
          finalStatus = "expired";
        } else {
          res.status(409).json({
            error: "Stripe checkout is not safely cancellable yet.",
          });
          return;
        }
      } catch (error) {
        logger.warn(
          {
            errorName:
              error instanceof Error ? error.name : "UnknownStripeError",
          },
          "Could not safely cancel Stripe test Checkout Session",
        );
        res.status(503).json({
          error: "Could not safely cancel this checkout with Stripe.",
        });
        return;
      }
    }

    const updated = await payments().findOneAndUpdate(
      { paymentId: payment.paymentId, status: "pending" },
      { $set: { status: finalStatus, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) {
      const current = await payments().findOne({
        paymentId: payment.paymentId,
      });
      if (!current) {
        res.status(404).json({ error: "Checkout not found." });
        return;
      }
      res.status(409).json({ error: "Checkout status changed; refresh and retry." });
      return;
    }
    res.json(CancelPaymentCheckoutResponse.parse(safePaymentDto(updated)));
  },
);

export default router;
