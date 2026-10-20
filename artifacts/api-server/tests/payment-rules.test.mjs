import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";

import {
  convertKwdFilsToUsdCents,
  STRIPE_USD_MINIMUM_CENTS,
  validateKwdUsdRatePayload,
} from "../src/lib/exchangeRate.ts";

import {
  isTestStripeSecretKey,
  moneyRequestActionDecision,
  paymentSettlementDecision,
  stripeSessionMatchesPayment,
  verifyStripeWebhookEvent,
} from "../src/lib/paymentRules.ts";

const payment = {
  paymentId: "payment-1",
  amountFils: 500,
  usdChargeCents: 161,
  usdCurrency: "USD",
  usdPerKwd: 3.22,
  provider: "stripe_test",
  checkoutSessionId: "cs_test_1",
};

function verifiedSession(overrides = {}) {
  return {
    id: "cs_test_1",
    metadata: { sanad_payment_id: "payment-1" },
    client_reference_id: "payment-1",
    mode: "payment",
    livemode: false,
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 161,
    metadata: {
      sanad_payment_id: "payment-1",
      sanad_currency: "usd",
      sanad_usd_charge_cents: "161",
      sanad_kwd_amount_fils: "500",
      sanad_usd_per_kwd: "3.22",
    },
    ...overrides,
  };
}

test("only test-mode Stripe secrets are accepted", () => {
  assert.equal(isTestStripeSecretKey("sk_test_example"), true);
  assert.equal(isTestStripeSecretKey("sk_live_example"), false);
  assert.equal(isTestStripeSecretKey(undefined), false);
});

test("server verification requires the exact completed USD test session", () => {
  assert.equal(stripeSessionMatchesPayment(payment, verifiedSession()), true);
  for (const overrides of [
    { id: "cs_other" },
    { metadata: { sanad_payment_id: "other" } },
    { client_reference_id: "other" },
    { mode: "subscription" },
    { livemode: true },
    { status: "open" },
    { payment_status: "unpaid" },
    { currency: "kwd" },
    { amount_total: 162 },
    { metadata: { sanad_payment_id: "payment-1", sanad_currency: "usd", sanad_usd_charge_cents: "162", sanad_kwd_amount_fils: "500", sanad_usd_per_kwd: "3.22" } },
  ]) {
    assert.equal(
      stripeSessionMatchesPayment(payment, verifiedSession(overrides)),
      false,
      `rejects ${JSON.stringify(overrides)}`,
    );
  }
  assert.equal(
    stripeSessionMatchesPayment(
      { ...payment, provider: "simulated" },
      verifiedSession(),
    ),
    false,
  );
});

test("legacy KWD sessions remain distinguishable without changing their records", () => {
  const legacyPayment = {
    paymentId: "legacy-payment",
    amountFils: 500,
    provider: "stripe_test",
    checkoutSessionId: "cs_legacy",
  };
  const legacySession = {
    ...verifiedSession(),
    id: "cs_legacy",
    client_reference_id: "legacy-payment",
    metadata: { sanad_payment_id: "legacy-payment" },
    currency: "kwd",
    amount_total: 500,
  };
  assert.equal(stripeSessionMatchesPayment(legacyPayment, legacySession), true);
});

test("KWD-to-USD conversion rounds to the nearest cent and enforces Stripe minimum", () => {
  assert.equal(convertKwdFilsToUsdCents(250, 3.221634), 81);
  assert.equal(convertKwdFilsToUsdCents(500, 3.221634), 161);
  assert.equal(convertKwdFilsToUsdCents(1, 3.221634), Math.round(0.3221634));
  assert.equal(STRIPE_USD_MINIMUM_CENTS, 50);
});

test("exchange-rate payload must provide a fresh KWD base and positive USD rate", () => {
  const now = 1_800_000_000_000;
  const updated = Math.floor((now - 12 * 60 * 60 * 1000) / 1000);
  const payload = {
    result: "success",
    base_code: "KWD",
    time_last_update_unix: updated,
    time_next_update_unix: updated + 24 * 60 * 60,
    time_eol_unix: 0,
    rates: { USD: 3.22 },
  };
  assert.equal(validateKwdUsdRatePayload(payload, now).usdPerKwd, 3.22);
  assert.throws(
    () => validateKwdUsdRatePayload({ ...payload, base_code: "USD" }, now),
    /unavailable/i,
  );
  assert.throws(
    () =>
      validateKwdUsdRatePayload(
        {
          ...payload,
          time_last_update_unix:
            Math.floor(now / 1000) - 37 * 60 * 60,
        },
        now,
      ),
    /stale or invalid/i,
  );
});

test("payment settlement is idempotent only for the same final status", () => {
  assert.equal(paymentSettlementDecision("pending", "paid"), "apply");
  assert.equal(paymentSettlementDecision("paid", "paid"), "already_applied");
  assert.equal(
    paymentSettlementDecision("demo_completed", "demo_completed"),
    "already_applied",
  );
  assert.equal(
    paymentSettlementDecision("demo_completed", "paid"),
    "conflict",
  );
  assert.equal(paymentSettlementDecision("cancelled", "paid"), "conflict");
});

test("Stripe webhook signatures are verified against the raw payload", () => {
  const stripe = new Stripe("sk_test_webhook_unit_test");
  const secret = "whsec_unit_test";
  const payload = JSON.stringify({
    id: "evt_test_checkout",
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "cs_test_1" } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const event = verifyStripeWebhookEvent(
    stripe,
    Buffer.from(payload),
    signature,
    secret,
  );
  assert.equal(event.id, "evt_test_checkout");
  assert.throws(() =>
    verifyStripeWebhookEvent(
      stripe,
      Buffer.from(payload),
      `${signature}invalid`,
      secret,
    ),
  );
});

test("money request actions enforce participant roles and terminal states", () => {
  assert.equal(
    moneyRequestActionDecision("pending", "pay", "recipient"),
    "apply",
  );
  assert.equal(
    moneyRequestActionDecision("pending", "decline", "requester"),
    "forbidden",
  );
  assert.equal(
    moneyRequestActionDecision("pending", "cancel", "requester"),
    "apply",
  );
  assert.equal(
    moneyRequestActionDecision("paid", "pay", "recipient"),
    "already_applied",
  );
  assert.equal(
    moneyRequestActionDecision("declined", "cancel", "requester"),
    "conflict",
  );
});
