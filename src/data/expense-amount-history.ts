import type { SQLiteDatabase } from "expo-sqlite";
import type { ExpenseInput } from "./models";
import { EXPENSE_AMOUNT_TYPES } from "./expense-types";
import { dateKey, isValidDateKey } from "../utils/ledger";

// The baseline preserves the old behavior for dates before the first change.
export const AMOUNT_BASELINE_DATE = "1000-01-01";

export const AMOUNT_HISTORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS expense_amount_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expenseId INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    effectiveDate TEXT NOT NULL CHECK (
      effectiveDate GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
      AND strftime('%Y-%m-%d', effectiveDate, '+0 days') IS NOT NULL
      AND strftime('%Y-%m-%d', effectiveDate, '+0 days') = effectiveDate),
    amountTypeCode TEXT NOT NULL CHECK (amountTypeCode IN (${EXPENSE_AMOUNT_TYPES.map((item) => `'${item.code}'`).join(", ")})),
    amount INTEGER,
    UNIQUE (expenseId, effectiveDate),
    CHECK ((amountTypeCode = 'fixed' AND amount IS NOT NULL
      AND typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999)
      OR (amountTypeCode = 'variable' AND amount IS NULL))
  );
`;

export function seedAmountHistory(db: SQLiteDatabase) {
  return db.runAsync(
    `INSERT INTO expense_amount_versions (expenseId, effectiveDate, amountTypeCode, amount)
     SELECT id, ?, amountTypeCode, amount FROM expenses WHERE TRUE
     ON CONFLICT(expenseId, effectiveDate) DO NOTHING`,
    AMOUNT_BASELINE_DATE,
  );
}

// Must run inside the same transaction as the template edit.
export async function applyAmountChange(
  db: SQLiteDatabase,
  expenseId: number,
  input: ExpenseInput,
  effectiveDate: string,
) {
  if (!isValidDateKey(effectiveDate) || effectiveDate < dateKey())
    throw new Error("변경 적용일은 오늘 이후로 선택해 주세요.");
  // A change applies indefinitely from this date, replacing later scheduled amounts.
  await db.runAsync(
    "DELETE FROM expense_amount_versions WHERE expenseId = ? AND effectiveDate >= ?",
    expenseId,
    effectiveDate,
  );
  await db.runAsync(
    `INSERT INTO expense_amount_versions (expenseId, effectiveDate, amountTypeCode, amount)
     VALUES (?, ?, ?, ?)`,
    expenseId,
    effectiveDate,
    input.amountTypeCode,
    input.amount,
  );
  // Preserve every earlier occurrence and every manually entered actual amount, including zero.
  await db.runAsync(
    `UPDATE ledger_entries SET amountTypeCode = ?, amount = ?
     WHERE expenseId = ? AND amountEntered = 0
       AND month || '-' || printf('%02d', day) >= ?`,
    input.amountTypeCode,
    input.amount,
    expenseId,
    effectiveDate,
  );
}
