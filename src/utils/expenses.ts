import type { Expense, PaymentMethod } from "../data/models";

export const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
export const monthlyTotal = (expenses: Expense[]) =>
  expenses.reduce((sum, item) => sum + item.amount, 0);
export const methodLabel = (method?: PaymentMethod) =>
  method ? `${method.provider} · ${method.name}` : "결제수단 미지정";

export function parseAmount(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 999_999_999
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
