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
}

export interface SettlementRecord {
  id: number;
  workerId: number;
  month: string;
  amountFils: number;
  status: string;
  updatedAt: Date;
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
