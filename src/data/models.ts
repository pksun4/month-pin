import type { ProviderCode } from "./providers";
import type {
  CardBenefitTypeCode,
  CardTypeCode,
  MethodKind,
} from "./method-types";
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
  benefitTypeCode: CardBenefitTypeCode | null;
  benefitAmount: number | null;
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

export interface CardBenefitEntry {
  methodId: number;
  name: string;
  providerCode: ProviderCode | null;
  providerName: string;
  benefitTypeCode: CardBenefitTypeCode;
  expectedAmount: number;
  amount: number | null;
}

export interface CardBenefitMonth {
  month: string;
  confirmed: boolean;
  cards: CardBenefitEntry[];
}

export interface CardBenefitInput {
  methodId: number;
  amount: number;
}

export interface AnnualMonthSummary {
  month: string;
  expenseTotal: number;
  expenseCount: number;
  pendingExpenses: number;
  benefitTotal: number;
  pendingBenefits: number;
  benefitCount: number;
}

export interface AnnualSummary {
  year: number;
  months: AnnualMonthSummary[];
}

export interface YearEndTaxSettings {
  year: number;
  grossSalary: number | null;
}
