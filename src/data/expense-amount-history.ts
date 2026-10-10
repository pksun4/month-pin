import type { SQLiteDatabase } from "expo-sqlite";
import type { ExpenseInput } from "./models";
import { EXPENSE_AMOUNT_TYPES } from "./expense-types";
import { monthKey, isValidMonth } from "../utils/ledger";

// The baseline preserves the old behavior for months before the first change.
export const AMOUNT_BASELINE_MONTH = "1000-01";

export const AMOUNT_HISTORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS expense_amount_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expenseId INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    effectiveMonth TEXT NOT NULL CHECK (
      effectiveMonth GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND CAST(substr(effectiveMonth, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
    amountTypeCode TEXT NOT NULL CHECK (amountTypeCode IN (${EXPENSE_AMOUNT_TYPES.map((item) => `'${item.code}'`).join(", ")})),
    amount INTEGER,
    UNIQUE (expenseId, effectiveMonth),
    CHECK ((amountTypeCode = 'fixed' AND amount IS NOT NULL
      AND typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999)
      OR (amountTypeCode = 'variable' AND amount IS NULL))
  );
`;

export function seedAmountHistory(db: SQLiteDatabase) {
  return db.runAsync(
    `INSERT INTO expense_amount_versions (expenseId, effectiveMonth, amountTypeCode, amount)
     SELECT id, ?, amountTypeCode, amount FROM expenses WHERE TRUE
     ON CONFLICT(expenseId, effectiveMonth) DO NOTHING`,
    AMOUNT_BASELINE_MONTH,
  );
}

// Must run inside the same transaction as the template edit.
export async function applyAmountChange(
  db: SQLiteDatabase,
  expenseId: number,
  input: ExpenseInput,
  effectiveMonth: string,
) {
  if (!isValidMonth(effectiveMonth) || effectiveMonth < monthKey())
    throw new Error("변경 적용 월은 이번 달 이후로 선택해 주세요.");
  // A change applies indefinitely from this month, replacing later scheduled amounts.
  await db.runAsync(
    "DELETE FROM expense_amount_versions WHERE expenseId = ? AND effectiveMonth >= ?",
    expenseId,
    effectiveMonth,
  );
  await db.runAsync(
    `INSERT INTO expense_amount_versions (expenseId, effectiveMonth, amountTypeCode, amount)
     VALUES (?, ?, ?, ?)`,
    expenseId,
    effectiveMonth,
    input.amountTypeCode,
    input.amount,
  );
  // Preserve every earlier occurrence and every manually entered actual amount, including zero.
  await db.runAsync(
    `UPDATE ledger_entries SET amountTypeCode = ?, amount = ?
     WHERE expenseId = ? AND amountEntered = 0
       AND month >= ?`,
    input.amountTypeCode,
    input.amount,
    expenseId,
    effectiveMonth,
  );
}
