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
}

export type MethodInput = Omit<
  PaymentMethod,
  "id" | "provider" | "providerCode" | "sortOrder"
> & {
  providerCode: ProviderCode;
};
export type ExpenseInput = Omit<Expense, "id" | "sortOrder">;
