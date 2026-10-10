export type MethodKind = 'bank' | 'card';

export interface PaymentMethod {
  id: number;
  kind: MethodKind;
  provider: string;
  name: string;
  bankId: number | null;
  settlementDay: number | null;
}

export interface Expense {
  id: number;
  name: string;
  amount: number;
  chargeDay: number;
  methodId: number | null;
}

export type MethodInput = Omit<PaymentMethod, 'id'>;
export type ExpenseInput = Omit<Expense, 'id'>;
