import type { ProviderCode } from "./providers";
import type { CardTypeCode, MethodKind } from "./method-types";
import type {
  ExpenseAmountTypeCode,
  ExpenseCategoryCode,
} from "./expense-types";

export type { MethodKind } from "./method-types";

export interface PaymentMethod {
  id: number;
  kind: MethodKind;
  provider: string;
  providerCode: ProviderCode | null;
  name: string;
  bankId: number | null;
  settlementDay: number | null;
  cardTypeCode: CardTypeCode | null;
  sortOrder: number;
}

export interface Expense {
  id: number;
  name: string;
  amountTypeCode: ExpenseAmountTypeCode;
  categoryCode: ExpenseCategoryCode | null;
  amount: number | null;
  chargeDay: number;
  methodId: number | null;
  sortOrder: number;
  startMonth: string;
  endMonth: string | null;
  isDeleted: boolean;
}

export type MethodInput = Omit<
  PaymentMethod,
  "id" | "provider" | "providerCode" | "sortOrder"
> & {
  providerCode: ProviderCode;
};
export type ExpenseInput = Omit<
  Expense,
  "id" | "sortOrder" | "startMonth" | "endMonth" | "isDeleted"
> & {
  startMonth?: string;
};

export interface LedgerEntry {
  id: number;
  month: string;
  expenseId: number | null;
  name: string;
  amountTypeCode: ExpenseAmountTypeCode;
  categoryCode: ExpenseCategoryCode | null;
  day: number;
  amount: number | null;
  methodKind: MethodKind | null;
  methodId: number | null;
  amountEntered: boolean;
  providerCode: ProviderCode | null;
  providerName: string | null;
  methodName: string | null;
  cardTypeCode: CardTypeCode | null;
}
