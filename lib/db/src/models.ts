export interface ChildRecord {
  id: number;
  publicId: string;
  name: string;
  age: number;
  spendingLimitFils: number;
  ownerUserId?: string;
  cashOutReservedFils?: number;
  createdAt: Date;
}

export interface ChildActivityRecord {
  id: number;
  childId: number;
  title: string;
  amountFils: number;
  kind: string;
  createdAt: Date;
}

export interface SavingsGoalRecord {
  id: number;
  childId: number;
  name: string;
  targetFils: number;
  savedFils: number;
  createdAt: Date;
}

export interface ApprovalRequestRecord {
  id: number;
  childId: number;
  item: string;
  amountFils: number;
  status: string;
  createdAt: Date;
}

export interface WorkerRecord {
  id: number;
  publicId: string;
  ownerUserId?: string;
  companyId?: number;
  requestedCompanyId?: number;
  companyStatus?: "none" | "pending" | "approved" | "rejected";
  name: string;
  avatarUrl: string | null;
  workplace: string;
  jobTitle: string;
  company: string;
  createdAt: Date;
  archivedAt?: Date;
  walletVersion?: number;
  demoPayoutProfile?: {
    bankName: "Kuwait Demo Bank" | "SANAD Sandbox Bank";
    accountLabel: string;
    updatedAt: Date;
  };
  companyMemberships?: WorkerCompanyMembershipRecord[];
}

export interface WorkerCompanyMembershipRecord {
  companyId: number;
  companyName: string;
  joinedAt?: Date;
  leftAt?: Date;
}

export interface CompanyRecord {
  id: number;
  ownerUserId: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkerCompanyRequestRecord {
  id: number;
  workerId: number;
  companyId: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export interface TipRecord {
  id: number;
  reference: string;
  workerId: number;
  amountFils: number;
  rating: number | null;
  message: string | null;
  customerName?: string;
  idempotencyKey?: string;
  status: string;
  createdAt: Date;
  payoutMethod?: "independent" | "company";
  payoutCompanyId?: number;
  payoutCompanyName?: string;
  settlementId?: number;
}

export interface SettlementRecord {
  id: number;
  workerId: number;
  companyId?: number;
  companyName?: string;
  month: string;
  amountFils: number;
  salaryFils?: number;
  tipsFils?: number;
  adjustmentsFils?: number;
  tipCount?: number;
  tipIds?: number[];
  createdByUserId?: string;
  createdAt?: Date;
  statusHistory?: Array<{
    status: string;
    changedByUserId: string;
    changedAt: Date;
  }>;
  status: string;
  updatedAt: Date;
}

export type WorkerWithdrawalStatus =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled";

export interface WorkerWithdrawalRecord {
  id: number;
  workerId: number;
  amountFils: number;
  status: WorkerWithdrawalStatus;
  idempotencyKey: string;
  requestedByUserId: string;
  demoBankName: "Kuwait Demo Bank" | "SANAD Sandbox Bank";
  accountLabel: string;
  reviewedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
}

export type WorkerWalletLedgerKind =
  | "tip_credit"
  | "withdrawal_requested"
  | "withdrawal_processing"
  | "withdrawal_paid"
  | "withdrawal_released";

export interface WorkerWalletLedgerRecord {
  id: number;
  workerId: number;
  kind: WorkerWalletLedgerKind;
  amountFils: number;
  sourceKey: string;
  reference: string;
  description: string;
  status?: WorkerWithdrawalStatus;
  createdAt: Date;
}

export interface CashOutRequestRecord {
  id: number;
  childId: number;
  amountFils: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "paid";
  requestedByUserId: string;
  reviewedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
}

export interface SanadUserRoleRecord {
  userId: string;
  role: "admin";
  createdAt: Date;
}

export interface AdminBootstrapRecord {
  _id: "first-admin";
  userId: string;
  createdAt: Date;
}

export interface DemoTransferRecord {
  id: number;
  reference: string;
  sender: string;
  recipient: string;
  amountFils: number;
  status: string;
  createdAt: Date;
}

export type SanadPaymentFlow =
  | "worker_tip"
  | "child_topup"
  | "child_qr_transfer"
  | "personal_topup";

export type SanadPaymentProvider = "stripe_test" | "simulated";
export type SanadPaymentStatus =
  | "pending"
  | "paid"
  | "demo_completed"
  | "cancelled"
  | "expired"
  | "failed";

export interface SanadPaymentRecord {
  paymentId: string;
  flow: SanadPaymentFlow;
  provider: SanadPaymentProvider;
  status: SanadPaymentStatus;
  amountFils: number;
  currency: "KWD";
  label: string;
  idempotencyKey: string;
  ownerUserId?: string;
  workerId?: number;
  childId?: number;
  publicId?: string;
  rating?: number | null;
  message?: string | null;
  customerName?: string | null;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  reference?: string;
  notice?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SanadUserWalletRecord {
  ownerUserId: string;
  balanceFils: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SanadUserWalletLedgerKind = "topup" | "sent" | "received";

export interface SanadUserWalletLedgerRecord {
  id: string;
  ownerUserId: string;
  kind: SanadUserWalletLedgerKind;
  amountFils: number;
  sourceKey: string;
  reference: string;
  description: string;
  status: "paid" | "demo_completed" | "completed";
  peerUserId?: string;
  peerLabel?: string;
  createdAt: Date;
}

export interface SanadUserTransferRecord {
  id: string;
  reference: string;
  fromUserId: string;
  toUserId: string;
  fromLabel: string;
  toLabel: string;
  amountFils: number;
  note?: string;
  origin: "send" | "request";
  requestId?: string;
  idempotencyKey: string;
  status: "completed";
  createdAt: Date;
}

export type SanadMoneyRequestStatus =
  | "pending"
  | "paid"
  | "declined"
  | "cancelled";

export interface SanadMoneyRequestRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromLabel: string;
  toLabel: string;
  amountFils: number;
  note?: string;
  status: SanadMoneyRequestStatus;
  idempotencyKey: string;
  reference?: string;
  createdAt: Date;
  updatedAt: Date;
}
