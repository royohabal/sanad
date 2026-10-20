import type Stripe from "stripe";
import type { SanadPaymentRecord, SanadPaymentStatus } from "@workspace/db";

export type PaymentSettlementDecision = "apply" | "already_applied" | "conflict";

export function paymentSettlementDecision(
  current: SanadPaymentStatus,
  requested: "paid" | "demo_completed",
): PaymentSettlementDecision {
  if (current === requested) return "already_applied";
  return current === "pending" ? "apply" : "conflict";
}

export function isTestStripeSecretKey(value: string | undefined): boolean {
  return Boolean(value?.startsWith("sk_test_"));
}

export function stripeSessionMatchesPayment(
  payment: Pick<
    SanadPaymentRecord,
    "paymentId" | "amountFils" | "provider" | "checkoutSessionId"
  >,
  session: Stripe.Checkout.Session,
): boolean {
  return (
    payment.provider === "stripe_test" &&
    Boolean(payment.checkoutSessionId) &&
    session.id === payment.checkoutSessionId &&
    session.metadata?.sanad_payment_id === payment.paymentId &&
    session.client_reference_id === payment.paymentId &&
    session.mode === "payment" &&
    session.livemode === false &&
    session.status === "complete" &&
    session.payment_status === "paid" &&
    session.currency?.toLowerCase() === "kwd" &&
    session.amount_total === payment.amountFils
  );
}

export type MoneyRequestAction = "pay" | "decline" | "cancel";
export type MoneyRequestActor = "requester" | "recipient";
export type MoneyRequestDecision =
  | "apply"
  | "already_applied"
  | "forbidden"
  | "conflict";
export type MoneyRequestStatus =
  | "pending"
  | "paid"
  | "declined"
  | "cancelled";

export function moneyRequestActionDecision(
  status: MoneyRequestStatus,
  action: MoneyRequestAction,
  actor: MoneyRequestActor,
): MoneyRequestDecision {
  const permittedActor =
    action === "cancel" ? "requester" : "recipient";
  if (actor !== permittedActor) return "forbidden";
  const target =
    action === "pay"
      ? "paid"
      : action === "decline"
        ? "declined"
        : "cancelled";
  if (status === target) return "already_applied";
  return status === "pending" ? "apply" : "conflict";
}
