import assert from "node:assert/strict";
import test from "node:test";

import {
  isTestStripeSecretKey,
  moneyRequestActionDecision,
  paymentSettlementDecision,
  stripeSessionMatchesPayment,
} from "../src/lib/paymentRules.ts";

const payment = {
  paymentId: "payment-1",
  amountFils: 500,
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
    currency: "kwd",
    amount_total: 500,
    ...overrides,
  };
}

test("only test-mode Stripe secrets are accepted", () => {
  assert.equal(isTestStripeSecretKey("sk_test_example"), true);
  assert.equal(isTestStripeSecretKey("sk_live_example"), false);
  assert.equal(isTestStripeSecretKey(undefined), false);
});

test("server verification requires the exact completed KWD test session", () => {
  assert.equal(stripeSessionMatchesPayment(payment, verifiedSession()), true);
  for (const overrides of [
    { id: "cs_other" },
    { metadata: { sanad_payment_id: "other" } },
    { client_reference_id: "other" },
    { mode: "subscription" },
    { livemode: true },
    { status: "open" },
    { payment_status: "unpaid" },
    { currency: "usd" },
    { amount_total: 501 },
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

test("payment settlement is idempotent only for the same final status", () => {
  assert.equal(paymentSettlementDecision("pending", "paid"), "apply");
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
