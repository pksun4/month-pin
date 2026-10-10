import type { LedgerEntry } from "../data/models";

export function parseMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("월을 다시 확인해 주세요.");
  const year = Number(month.slice(0, 4));
  if (year < 1000) throw new Error("월을 다시 확인해 주세요.");
  return { year, monthIndex: Number(month.slice(5)) - 1 };
}

export function isValidMonth(value: string) {
  try {
    parseMonth(value);
    return true;
  } catch {
    return false;
  }
}

export function formatMonth(value: string) {
  const { year, monthIndex } = parseMonth(value);
  return `${year}년 ${monthIndex + 1}월`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string) {
  const { year, monthIndex } = parseMonth(month);
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function moveMonth(month: string, offset: number) {
  const { year, monthIndex } = parseMonth(month);
  const next = monthKey(new Date(year, monthIndex + offset, 1));
  parseMonth(next);
  return next;
}

export function calendarDays(month: string): (number | null)[] {
  const { year, monthIndex } = parseMonth(month);
  const start = new Date(year, monthIndex, 1).getDay();
  const count = daysInMonth(month);
  return Array.from(
    { length: Math.ceil((start + count) / 7) * 7 },
    (_, index) =>
      index >= start && index < start + count ? index - start + 1 : null,
  );
}

export function ledgerSummary(entries: readonly LedgerEntry[]) {
  return {
    total: entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0),
    pending: entries.filter((entry) => entry.amount === null).length,
    count: entries.length,
  };
}

export function dailyLedger(entries: readonly LedgerEntry[]) {
  const days = new Map<number, ReturnType<typeof ledgerSummary>>();
  for (const entry of entries) {
    const summary = days.get(entry.day) ?? { total: 0, pending: 0, count: 0 };
    summary.total += entry.amount ?? 0;
    summary.pending += entry.amount === null ? 1 : 0;
    summary.count++;
    days.set(entry.day, summary);
  }
  return days;
}

export function parseLedgerAmount(value: string): number | null {
  const digits = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 999999999
    ? amount
    : null;
}
