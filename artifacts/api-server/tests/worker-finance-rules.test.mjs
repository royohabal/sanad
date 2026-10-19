import assert from "node:assert/strict";
import test from "node:test";

import {
  companySettlementTransitionAllowed,
  withdrawalAmountError,
  workerWithdrawalTransitionAllowed,
} from "../src/lib/workerFinanceRules.ts";

test("withdrawal amounts use positive integer fils and enforce minimum and balance", () => {
  assert.equal(withdrawalAmountError(1500, 2000, 1000), null);
  assert.equal(withdrawalAmountError(999, 2000, 1000), "below_minimum");
  assert.equal(withdrawalAmountError(2001, 2000, 1000), "insufficient");
  assert.equal(withdrawalAmountError(0, 2000, 0), "invalid");
  assert.equal(withdrawalAmountError(1.5, 2000, 0), "invalid");
  assert.equal(withdrawalAmountError(100, -1, 0), "invalid");
  assert.equal(withdrawalAmountError(Number.MAX_SAFE_INTEGER + 1, 2000, 0), "invalid");
});

test("withdrawal state transitions have no path back from terminal states", () => {
  assert.equal(workerWithdrawalTransitionAllowed("pending", "processing"), true);
  assert.equal(workerWithdrawalTransitionAllowed("pending", "rejected"), true);
  assert.equal(workerWithdrawalTransitionAllowed("pending", "paid"), false);
  assert.equal(workerWithdrawalTransitionAllowed("pending", "cancelled"), false);
  assert.equal(workerWithdrawalTransitionAllowed("processing", "paid"), true);
  assert.equal(workerWithdrawalTransitionAllowed("processing", "rejected"), true);
  assert.equal(workerWithdrawalTransitionAllowed("processing", "pending"), false);
  assert.equal(workerWithdrawalTransitionAllowed("paid", "rejected"), false);
  assert.equal(workerWithdrawalTransitionAllowed("rejected", "processing"), false);
});

test("company settlement statuses follow review, processing, then terminal outcomes", () => {
  assert.equal(companySettlementTransitionAllowed("pending", "approved"), true);
  assert.equal(companySettlementTransitionAllowed("pending", "rejected"), true);
  assert.equal(companySettlementTransitionAllowed("pending", "paid"), false);
  assert.equal(companySettlementTransitionAllowed("approved", "processing"), true);
  assert.equal(companySettlementTransitionAllowed("approved", "rejected"), true);
  assert.equal(companySettlementTransitionAllowed("approved", "paid"), false);
  assert.equal(companySettlementTransitionAllowed("processing", "paid"), true);
  assert.equal(companySettlementTransitionAllowed("processing", "rejected"), true);
  assert.equal(companySettlementTransitionAllowed("paid", "pending"), false);
});
