import type { SQLiteDatabase } from "expo-sqlite";
import type {
  InterestIncomeEntry,
  InterestIncomeMonthInput,
  InterestIncomeYear,
} from "./models";
import { getProvider } from "./providers";
import {
  MAX_ACCOUNT_ALIAS_LENGTH,
  MAX_INTEREST_AMOUNT,
  validateInterestMonth,
  validateInterestYear,
} from "../utils/interest-income";

export const INTEREST_INCOME_SCHEMA = `
  CREATE TABLE IF NOT EXISTS interest_income_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1000 AND 9999),
    month INTEGER NOT NULL CHECK (typeof(month) = 'integer' AND month BETWEEN 1 AND 12),
    providerCode TEXT NOT NULL,
    providerKind TEXT NOT NULL DEFAULT 'bank' CHECK (providerKind = 'bank'),
    accountAlias TEXT NOT NULL DEFAULT '' CHECK (length(trim(accountAlias)) <= ${MAX_ACCOUNT_ALIAS_LENGTH}),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 0 AND ${MAX_INTEREST_AMOUNT}),
    sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (typeof(sortOrder) = 'integer' AND sortOrder >= 0),
    FOREIGN KEY (providerCode, providerKind) REFERENCES payment_providers(code, kind)
  );
  CREATE INDEX IF NOT EXISTS interest_income_period_idx ON interest_income_entries(year, month, sortOrder, id);
`;

export async function loadInterestIncomeYear(
  db: SQLiteDatabase,
  year: number,
): Promise<InterestIncomeYear> {
  validateInterestYear(year);
  const entries = await db.getAllAsync<InterestIncomeEntry>(
    "SELECT id, year, month, providerCode, accountAlias, amount, sortOrder FROM interest_income_entries WHERE year = ? ORDER BY month, sortOrder, id",
    year,
  );
  return { year, entries };
}

export async function saveInterestIncomeMonth(
  db: SQLiteDatabase,
  input: InterestIncomeMonthInput,
) {
  validateInterestMonth(input.year, input.month);
  if (!Array.isArray(input.entries))
    throw new Error("이자 수입 내역을 다시 확인해 주세요.");
  const ids = new Set<number>();
  for (const entry of input.entries) {
    if (
      !entry ||
      (entry.id !== null &&
        (!Number.isSafeInteger(entry.id) || entry.id <= 0 || ids.has(entry.id)))
    )
      throw new Error("이자 수입 내역을 다시 확인해 주세요.");
    if (entry.id !== null) ids.add(entry.id);
    if (getProvider(entry.providerCode)?.kind !== "bank")
      throw new Error("은행을 선택해 주세요.");
    if (
      typeof entry.accountAlias !== "string" ||
      entry.accountAlias.trim().length > MAX_ACCOUNT_ALIAS_LENGTH
    )
      throw new Error("통장 별명은 40자 이내로 입력해 주세요.");
    if (
      !Number.isSafeInteger(entry.amount) ||
      entry.amount < 0 ||
      entry.amount > MAX_INTEREST_AMOUNT
    )
      throw new Error("이자 수입을 0원부터 9,999,999,999원까지 입력해 주세요.");
  }
  await db.withTransactionAsync(async () => {
    const previous = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM interest_income_entries WHERE year = ? AND month = ?",
      input.year,
      input.month,
    );
    if ([...ids].some((id) => !previous.some((entry) => entry.id === id)))
      throw new Error(
        "저장된 이자 내역이 변경됐어요. 화면을 다시 열어 주세요.",
      );
    for (const entry of previous) {
      if (!ids.has(entry.id))
        await db.runAsync(
          "DELETE FROM interest_income_entries WHERE id = ? AND year = ? AND month = ?",
          entry.id,
          input.year,
          input.month,
        );
    }
    for (const [sortOrder, entry] of input.entries.entries()) {
      if (entry.id === null) {
        await db.runAsync(
          "INSERT INTO interest_income_entries (year, month, providerCode, accountAlias, amount, sortOrder) VALUES (?, ?, ?, ?, ?, ?)",
          input.year,
          input.month,
          entry.providerCode,
          entry.accountAlias.trim(),
          entry.amount,
          sortOrder,
        );
      } else {
        await db.runAsync(
          "UPDATE interest_income_entries SET providerCode = ?, accountAlias = ?, amount = ?, sortOrder = ? WHERE id = ? AND year = ? AND month = ?",
          entry.providerCode,
          entry.accountAlias.trim(),
          entry.amount,
          sortOrder,
          entry.id,
          input.year,
          input.month,
        );
      }
    }
  });
}
