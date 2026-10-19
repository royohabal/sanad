export type WorkerWithdrawalStatus =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled";

export type CompanySettlementStatus =
  | "pending"
  | "approved"
  | "processing"
  | "paid"
  | "rejected";

export function companySettlementTransitionAllowed(
  current: CompanySettlementStatus,
  next: CompanySettlementStatus,
): boolean {
  if (current === next) return true;
  if (current === "pending") return next === "approved" || next === "rejected";
  if (current === "approved") {
    return next === "processing" || next === "rejected";
  }
  if (current === "processing") return next === "paid" || next === "rejected";
  return false;
}

export function withdrawalAmountError(
  amountFils: number,
  availableFils: number,
  minimumFils: number,
): "invalid" | "below_minimum" | "insufficient" | null {
  if (
    !Number.isSafeInteger(amountFils) ||
    !Number.isSafeInteger(availableFils) ||
    !Number.isSafeInteger(minimumFils) ||
    amountFils <= 0 ||
    availableFils < 0 ||
    minimumFils < 0
  ) {
    return "invalid";
  }
  if (amountFils < minimumFils) return "below_minimum";
  if (amountFils > availableFils) return "insufficient";
  return null;
}

export function workerWithdrawalTransitionAllowed(
  current: WorkerWithdrawalStatus,
  next: WorkerWithdrawalStatus,
): boolean {
  if (current === next) return true;
  if (current === "pending") {
    return next === "processing" || next === "rejected";
  }
  if (current === "processing") {
    return next === "paid" || next === "rejected";
  }
  return false;
}
