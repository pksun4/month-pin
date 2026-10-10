import type { ProviderCode } from "./providers";

export type MethodKind = "bank" | "card";

export interface PaymentMethod {
  id: number;
  kind: MethodKind;
  provider: string;
  providerCode: ProviderCode | null;
  name: string;
  bankId: number | null;
  settlementDay: number | null;
  sortOrder: number;
}

export interface Expense {
  id: number;
  name: string;
  amount: number;
  chargeDay: number;
  methodId: number | null;
}

export type MethodInput = Omit<
  PaymentMethod,
  "id" | "provider" | "providerCode" | "sortOrder"
> & {
  providerCode: ProviderCode;
};
export type ExpenseInput = Omit<Expense, "id">;
