import {
  loadTaxCards,
  loadTaxCardSpending,
  saveTaxCardSpending,
} from "./year-end-tax-cards";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  YearEndTaxSettings,
  YearEndTaxYear,
  YearEndTaxMonthInput,
} from "./models";
import {
  TAX_SPENDING_METHODS,
  MAX_TAX_SPENDING_AMOUNT,
  type TaxSpendingAmounts,
} from "./tax-spending-types";
import {
  isValidGrossSalary,
  MAX_GROSS_SALARY,
  validateTaxYear,
  validateTaxMonth,
} from "../utils/year-end-tax";

export const YEAR_END_TAX_SCHEMA = `
  CREATE TABLE IF NOT EXISTS annual_tax_settings (
    year INTEGER PRIMARY KEY NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1000 AND 9999),
    grossSalary INTEGER NOT NULL CHECK (typeof(grossSalary) = 'integer' AND grossSalary BETWEEN 0 AND ${MAX_GROSS_SALARY})
  );
`;

export const TAX_MONTH_CONFIRMED_COLUMN =
  "confirmed INTEGER NOT NULL DEFAULT 0 CHECK (typeof(confirmed) = 'integer' AND confirmed IN (0, 1))";

export const YEAR_END_TAX_SPENDING_SCHEMA = `
  CREATE TABLE IF NOT EXISTS monthly_tax_spending (
    year INTEGER NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1000 AND 9999),
    month INTEGER NOT NULL CHECK (typeof(month) = 'integer' AND month BETWEEN 1 AND 12),
    ${TAX_SPENDING_METHODS.map(({ code }) => `${code} INTEGER NOT NULL CHECK (typeof(${code}) = 'integer' AND ${code} BETWEEN 0 AND ${MAX_TAX_SPENDING_AMOUNT})`).join(",\n    ")},
    ${TAX_MONTH_CONFIRMED_COLUMN},
    PRIMARY KEY (year, month)
  );
`;

export async function loadYearEndTaxSettings(
  db: SQLiteDatabase,
  year: number,
): Promise<YearEndTaxSettings> {
  validateTaxYear(year);
  const saved = await db.getFirstAsync<{ grossSalary: number }>(
    "SELECT grossSalary FROM annual_tax_settings WHERE year = ?",
    year,
  );
  return { year, grossSalary: saved?.grossSalary ?? null };
}

export async function saveYearEndTaxSalary(
  db: SQLiteDatabase,
  year: number,
  grossSalary: number,
) {
  validateTaxYear(year);
  if (!isValidGrossSalary(grossSalary))
    throw new Error("총급여를 0원부터 9,999,999,999원까지 입력해 주세요.");
  await db.runAsync(
    `INSERT INTO annual_tax_settings (year, grossSalary) VALUES (?, ?)
     ON CONFLICT(year) DO UPDATE SET grossSalary = excluded.grossSalary`,
    year,
    grossSalary,
  );
}

export async function loadYearEndTaxYear(
  db: SQLiteDatabase,
  year: number,
): Promise<YearEndTaxYear> {
  const settings = await loadYearEndTaxSettings(db, year);
  const rows = await db.getAllAsync<
    TaxSpendingAmounts & { month: number; confirmed: number }
  >(
    "SELECT month, confirmed, cash_receipt, debit_card, local_card, credit_card FROM monthly_tax_spending WHERE year = ? ORDER BY month",
    year,
  );
  const cards = await loadTaxCardSpending(db, year);
  return {
    ...settings,
    selectedCards: await loadTaxCards(db, year),
    months: rows.map(({ month, confirmed, ...amounts }) => ({
      year,
      month,
      confirmed: confirmed === 1,
      amounts,
      cards: cards
        .filter((card) => card.month === month)
        .map(({ month: _month, ...card }) => card),
    })),
  };
}

export async function saveYearEndTaxMonth(
  db: SQLiteDatabase,
  entry: YearEndTaxMonthInput,
) {
  validateTaxMonth(entry.year, entry.month);
  if (entry.confirmed !== undefined && typeof entry.confirmed !== "boolean")
    throw new Error("확정 상태를 다시 확인해 주세요.");
  if (
    !entry.amounts ||
    Object.keys(entry.amounts).length !== TAX_SPENDING_METHODS.length ||
    TAX_SPENDING_METHODS.some(({ code }) => {
      const amount = entry.amounts[code];
      return (
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        amount > MAX_TAX_SPENDING_AMOUNT
      );
    })
  )
    throw new Error("사용금액을 0원부터 9,999,999,999원까지 입력해 주세요.");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO monthly_tax_spending (year, month, cash_receipt, debit_card, local_card, credit_card, confirmed)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 0))
     ON CONFLICT(year, month) DO UPDATE SET
       cash_receipt = excluded.cash_receipt, debit_card = excluded.debit_card,
       local_card = excluded.local_card, credit_card = excluded.credit_card,
       confirmed = COALESCE(?, monthly_tax_spending.confirmed)`,
      entry.year,
      entry.month,
      entry.amounts.cash_receipt,
      entry.amounts.debit_card,
      entry.amounts.local_card,
      entry.amounts.credit_card,
      entry.confirmed === undefined ? null : Number(entry.confirmed),
      entry.confirmed === undefined ? null : Number(entry.confirmed),
    );
    await saveTaxCardSpending(db, entry.year, entry.month, entry.cards);
  });
}
