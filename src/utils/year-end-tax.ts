import {
  TAX_SPENDING_METHODS,
  MAX_TAX_SPENDING_AMOUNT,
  type TaxSpendingAmounts,
} from "../data/tax-spending-types";
import type { YearEndTaxMonth } from "../data/models";

export const MAX_GROSS_SALARY = 9999999999;
export const CARD_SPENDING_TARGET_RATE = 0.25;

export function validateTaxYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error("연도를 다시 확인해 주세요.");
}

export function isValidGrossSalary(amount: number) {
  return (
    Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_GROSS_SALARY
  );
}

export function parseGrossSalary(value: string): number | null {
  const digits = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return isValidGrossSalary(amount) ? amount : null;
}

export function cardSpendingTarget(grossSalary: number | null) {
  return grossSalary === null ? null : grossSalary * CARD_SPENDING_TARGET_RATE;
}
export function validateTaxMonth(year: number, month: number) {
  validateTaxYear(year);
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("월을 다시 확인해 주세요.");
}

export function parseTaxSpendingAmount(value: string): number | null {
  const digits = value.replace(/,/g, "").trim();
  if (digits === "") return 0;
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount <= MAX_TAX_SPENDING_AMOUNT
    ? amount
    : null;
}

export function taxMonthTotal(amounts: TaxSpendingAmounts) {
  return TAX_SPENDING_METHODS.reduce(
    (total, { code }) => total + amounts[code],
    0,
  );
}

export function remainingTaxTarget(
  grossSalary: number | null,
  months: readonly YearEndTaxMonth[],
) {
  const target = cardSpendingTarget(grossSalary);
  if (target === null) return null;
  const used = months.reduce((total, month) => total + taxEntryTotal(month), 0);
  return Math.max(target - used, 0);
}

export function taxEntryTotal(month: YearEndTaxMonth) {
  return (
    taxMonthTotal(month.amounts) +
    (month.cards ?? []).reduce((total, card) => total + card.amount, 0)
  );
}
