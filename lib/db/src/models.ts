export interface ChildRecord {
  id: number;
  publicId: string;
  name: string;
  age: number;
  spendingLimitFils: number;
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
  name: string;
  avatarUrl: string | null;
  workplace: string;
  jobTitle: string;
  company: string;
  createdAt: Date;
}

export interface TipRecord {
  id: number;
  reference: string;
  workerId: number;
  amountFils: number;
  rating: number | null;
  message: string | null;
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

export interface DemoTransferRecord {
  id: number;
  reference: string;
  sender: string;
  recipient: string;
  amountFils: number;
  status: string;
  createdAt: Date;
}
