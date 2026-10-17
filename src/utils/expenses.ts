import type { Expense, PaymentMethod } from "../data/models";
import {
  getCardBenefitType,
  getCardType,
  CARD_TYPES,
  type MethodSortCode,
} from "../data/method-types";
import { getProvider } from "../data/providers";
import type {
  ExpenseCategoryFilterCode,
  ExpenseSortCode,
} from "../data/expense-types";

export const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
export const monthlyTotal = (expenses: Expense[]) =>
  expenses.reduce((sum, item) => sum + (item.amount ?? 0), 0);
export const expenseAmountLabel = (expense: Expense) =>
  expense.amountTypeCode === "variable"
    ? "매월 변동"
    : money(expense.amount ?? 0);
export const methodLabel = (method?: PaymentMethod) =>
  method ? `${method.provider} · ${method.name}` : "결제수단 미지정";
export const cardTypeLabel = (method: PaymentMethod) =>
  getCardType(method.cardTypeCode)?.label ?? "종류 미지정";
export function cardBenefitLabel(method: PaymentMethod): string | null {
  const type = getCardBenefitType(method.benefitTypeCode);
  if (method.kind !== "card" || !type || method.benefitAmount == null)
    return null;
  return `월 ${type.label} 혜택 ${method.benefitTypeCode === "variable" ? "예상 " : ""}${money(method.benefitAmount)}`;
}
export function cardWithdrawalLabel(
  method: PaymentMethod,
  bank?: PaymentMethod,
): string {
  if (method.cardTypeCode === "debit") return bank?.name ?? "연결 통장 미지정";
  return `${bank?.name ?? "출금 통장 미지정"} · ${method.settlementDay ? `${method.settlementDay}일 출금` : "출금일 미지정"}`;
}

export function formatAmountInput(value: string, previous = ""): string {
  let digits = value.replace(/,/g, "").trim();
  if (!/^\d*$/.test(digits)) return previous;

  // Backspacing over an inserted comma should remove the preceding digit.
  // Otherwise the formatter restores the comma and the field appears stuck.
  const previousDigits = previous.replace(/,/g, "");
  if (digits === previousDigits && value.length === previous.length - 1) {
    let removedAt = 0;
    while (value[removedAt] === previous[removedAt] && removedAt < value.length)
      removedAt++;
    if (previous[removedAt] === ",") {
      const digitAt = previous.slice(0, removedAt).replace(/,/g, "").length - 1;
      digits = digits.slice(0, digitAt) + digits.slice(digitAt + 1);
    }
  }

  return digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function sortExpensesByAmount(expenses: readonly Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    if (a.amount === null && b.amount !== null) return 1;
    if (a.amount !== null && b.amount === null) return -1;
    return (
      (b.amount ?? 0) - (a.amount ?? 0) ||
      a.name.localeCompare(b.name, "ko") ||
      a.id - b.id
    );
  });
}

export function sortExpenses(
  expenses: readonly Expense[],
  order: ExpenseSortCode,
): Expense[] {
  if (order === "amount") return sortExpensesByAmount(expenses);
  return [...expenses].sort(
    (a, b) =>
      (order === "charge_day"
        ? a.chargeDay - b.chargeDay || (b.amount ?? 0) - (a.amount ?? 0)
        : order === "custom"
          ? a.sortOrder - b.sortOrder
          : 0) || a.id - b.id,
  );
}

export function paymentMethodsByKind(
  methods: readonly PaymentMethod[],
): PaymentMethod[] {
  return [
    ...methods.filter((method) => method.kind === "bank"),
    ...sortCardsByType(methods.filter((method) => method.kind === "card")),
  ];
}

export function sortCardsByType<T extends { cardTypeCode?: string | null }>(
  cards: readonly T[],
): T[] {
  const rank = (code: string | null | undefined) => {
    const index = CARD_TYPES.findIndex((type) => type.code === code);
    return index < 0 ? CARD_TYPES.length : index;
  };
  return [...cards].sort((a, b) => rank(a.cardTypeCode) - rank(b.cardTypeCode));
}

export function groupCardMethods(methods: readonly PaymentMethod[]) {
  return CARD_TYPES.flatMap((type) => {
    const data = methods.filter(
      (method) =>
        method.kind === "card" &&
        (getCardType(method.cardTypeCode)?.code ?? null) === type.code,
    );
    return data.length ? [{ key: type.code, title: type.label, data }] : [];
  });
}

export function mergePaymentMethodOrder(
  current: readonly PaymentMethod[],
  ordered: readonly PaymentMethod[],
) {
  const ids = new Set(ordered.map((method) => method.id));
  let index = 0;
  return [...current]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((method) => (ids.has(method.id) ? ordered[index++] : method));
}

function providerSortName(method: PaymentMethod): string {
  const provider = getProvider(method.providerCode);
  // Sort Latin-prefixed brands by their Korean institution names.
  return provider && "sortName" in provider
    ? provider.sortName
    : (provider?.name ?? method.provider);
}

export function sortPaymentMethods(
  selected: readonly PaymentMethod[],
  order: MethodSortCode,
  methods: PaymentMethod[],
  expenses: Expense[],
): PaymentMethod[] {
  const totals = new Map(
    order === "amount"
      ? selected.map((method) => [
          method.id,
          monthlyTotal(relatedExpenses(method, methods, expenses)),
        ])
      : [],
  );
  const compareInstitutions = (a: PaymentMethod, b: PaymentMethod) =>
    providerSortName(a).localeCompare(providerSortName(b), "ko") ||
    (a.providerCode ?? a.provider).localeCompare(
      b.providerCode ?? b.provider,
      "ko",
    ) ||
    a.name.localeCompare(b.name, "ko") ||
    a.id - b.id;

  return [...selected].sort((a, b) => {
    if (order === "registered") return a.id - b.id;
    if (order === "custom") return a.sortOrder - b.sortOrder || a.id - b.id;
    if (order === "amount")
      return (
        (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) ||
        compareInstitutions(a, b)
      );
    return compareInstitutions(a, b);
  });
}

export function filterExpenses(
  expenses: readonly Expense[],
  category: ExpenseCategoryFilterCode,
): Expense[] {
  return expenses.filter(
    (expense) => category === "all" || expense.categoryCode === category,
  );
}

// Replace only visible slots; dragging one category must preserve hidden rows.
export function mergeExpenseOrder(
  expenses: readonly Expense[],
  visibleOrder: readonly Expense[],
): Expense[] {
  const visibleIds = new Set(visibleOrder.map((expense) => expense.id));
  let index = 0;
  return sortExpenses(expenses, "custom").map((expense) =>
    visibleIds.has(expense.id) ? visibleOrder[index++] : expense,
  );
}

export function parseAmount(value: string, minimum: 0 | 1 = 1): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) &&
    amount >= minimum &&
    amount <= 999_999_999
    ? amount
    : null;
}

export function parseDay(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const day = Number(value);
  return day >= 1 && day <= 31 ? day : null;
}

// Months without the configured day use their final calendar day.
export function nextChargeDate(day: number, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const occurrence = (offset: number) => {
    const lastDay = new Date(
      today.getFullYear(),
      today.getMonth() + offset + 1,
      0,
    ).getDate();
    return new Date(
      today.getFullYear(),
      today.getMonth() + offset,
      Math.min(day, lastDay),
    );
  };
  const current = occurrence(0);
  return current >= today ? current : occurrence(1);
}

export function relatedExpenses(
  method: PaymentMethod,
  methods: PaymentMethod[],
  expenses: Expense[],
): Expense[] {
  const ids = new Set([method.id]);
  if (method.kind === "bank") {
    methods
      .filter((item) => item.kind === "card" && item.bankId === method.id)
      .forEach((item) => ids.add(item.id));
  }
  return expenses.filter(
    (item) => item.methodId !== null && ids.has(item.methodId),
  );
}

export function paymentMethodsTotal(
  selected: readonly PaymentMethod[],
  methods: PaymentMethod[],
  expenses: Expense[],
): number {
  const expenseIds = new Set(
    selected.flatMap((method) =>
      relatedExpenses(method, methods, expenses).map((expense) => expense.id),
    ),
  );
  return monthlyTotal(expenses.filter((expense) => expenseIds.has(expense.id)));
}
