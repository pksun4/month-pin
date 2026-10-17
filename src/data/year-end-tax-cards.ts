import type { SQLiteDatabase } from "expo-sqlite";
import type { TaxCardSpending, YearEndTaxCard } from "./models";
import { MAX_TAX_SPENDING_AMOUNT } from "./tax-spending-types";
import { validateTaxYear } from "../utils/year-end-tax";

export const YEAR_END_TAX_CARDS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS annual_tax_cards (
    year INTEGER NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1000 AND 9999),
    methodId INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    sortOrder INTEGER NOT NULL CHECK (typeof(sortOrder) = 'integer' AND sortOrder >= 0),
    PRIMARY KEY (year, methodId)
  );
  CREATE TABLE IF NOT EXISTS monthly_tax_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    providerName TEXT NOT NULL,
    cardTypeCode TEXT NOT NULL CHECK (cardTypeCode IN ('credit', 'debit')),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 0 AND ${MAX_TAX_SPENDING_AMOUNT}),
    FOREIGN KEY (year, month) REFERENCES monthly_tax_spending(year, month) ON DELETE CASCADE,
    UNIQUE (year, month, methodId)
  );
`;

const CARD_SELECT = `SELECT m.id AS methodId, m.name, COALESCE(p.name, m.legacyProvider, '') AS providerName, m.cardTypeCode
 FROM payment_methods m LEFT JOIN payment_providers p ON p.code = m.providerCode`;

export async function loadTaxCards(db: SQLiteDatabase, year: number) {
  return db.getAllAsync<YearEndTaxCard>(
    `${CARD_SELECT}
    JOIN annual_tax_cards c ON c.methodId = m.id
    WHERE c.year = ? AND m.kind = 'card' AND m.cardTypeCode IN ('credit', 'debit')
    ORDER BY c.sortOrder, m.id`,
    year,
  );
}

export async function saveYearEndTaxCards(
  db: SQLiteDatabase,
  year: number,
  methodIds: readonly number[],
) {
  validateTaxYear(year);
  if (
    !Array.isArray(methodIds) ||
    new Set(methodIds).size !== methodIds.length ||
    methodIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new Error("포함할 카드를 다시 선택해 주세요.");
  await db.withTransactionAsync(async () => {
    for (const id of methodIds) {
      const card = await db.getFirstAsync(
        `${CARD_SELECT} WHERE m.id = ? AND m.kind = 'card' AND m.cardTypeCode IN ('credit', 'debit')`,
        id,
      );
      if (!card) throw new Error("카드 목록이 변경됐어요. 다시 선택해 주세요.");
    }
    await db.runAsync("DELETE FROM annual_tax_cards WHERE year = ?", year);
    for (const [position, id] of methodIds.entries())
      await db.runAsync(
        "INSERT INTO annual_tax_cards (year, methodId, sortOrder) VALUES (?, ?, ?)",
        year,
        id,
        position,
      );
  });
}

export async function loadTaxCardSpending(db: SQLiteDatabase, year: number) {
  return db.getAllAsync<TaxCardSpending & { month: number }>(
    "SELECT id, month, methodId, name, providerName, cardTypeCode, amount FROM monthly_tax_cards WHERE year = ? ORDER BY month, id",
    year,
  );
}

// Run once inside the v18 migration. Only the card explicitly named by the user may receive the legacy debit totals.
export async function migrateOhaCheckSpending(db: SQLiteDatabase) {
  const cards = await db.getAllAsync<YearEndTaxCard>(
    `${CARD_SELECT} WHERE m.kind = 'card' AND m.cardTypeCode = 'debit'`,
  );
  const matches = cards.filter(
    (card) =>
      card.name.normalize("NFKC").replace(/\s/g, "").toLowerCase() ===
      "오하check",
  );
  if (matches.length !== 1) return;
  const card = matches[0];
  const months = await db.getAllAsync<{
    year: number;
    month: number;
    debit_card: number;
  }>(
    "SELECT year, month, debit_card FROM monthly_tax_spending ORDER BY year, month",
  );
  for (const month of months) {
    await db.runAsync(
      `INSERT INTO monthly_tax_cards (year, month, methodId, name, providerName, cardTypeCode, amount) VALUES (?, ?, ?, ?, ?, 'debit', ?)`,
      month.year,
      month.month,
      card.methodId,
      card.name,
      card.providerName,
      month.debit_card,
    );
    await db.runAsync(
      "UPDATE monthly_tax_spending SET debit_card = 0 WHERE year = ? AND month = ?",
      month.year,
      month.month,
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO annual_tax_cards (year, methodId, sortOrder) VALUES (?, ?, 0)",
      month.year,
      card.methodId,
    );
  }
}

// Caller holds the same transaction as the month's base amounts.
export async function saveTaxCardSpending(
  db: SQLiteDatabase,
  year: number,
  month: number,
  inputs: readonly TaxCardSpending[] | undefined,
) {
  if (inputs === undefined) return; // Older callers may update only the legacy amounts; retain all card details.
  if (!Array.isArray(inputs))
    throw new Error("카드별 금액을 다시 확인해 주세요.");
  const previous = await db.getAllAsync<TaxCardSpending>(
    "SELECT id, methodId, name, providerName, cardTypeCode, amount FROM monthly_tax_cards WHERE year = ? AND month = ?",
    year,
    month,
  );
  const ids = inputs
    .filter((input) => input.id !== null)
    .map((input) => input.id);
  const methodIds = inputs
    .filter((input) => input.methodId !== null)
    .map((input) => input.methodId);
  if (
    new Set(ids).size !== ids.length ||
    new Set(methodIds).size !== methodIds.length ||
    previous.some((entry) => !ids.includes(entry.id))
  )
    throw new Error("저장된 카드 내역이 변경됐어요. 화면을 다시 열어 주세요.");
  const selected = await loadTaxCards(db, year);
  for (const input of inputs) {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount < 0 ||
      input.amount > MAX_TAX_SPENDING_AMOUNT
    )
      throw new Error(
        "카드 사용금액을 0원부터 9,999,999,999원까지 입력해 주세요.",
      );
    if (input.id !== null) {
      const saved = previous.find((entry) => entry.id === input.id);
      if (!saved || saved.methodId !== input.methodId)
        throw new Error("저장된 카드 내역을 다시 확인해 주세요.");
      await db.runAsync(
        "UPDATE monthly_tax_cards SET amount = ? WHERE id = ? AND year = ? AND month = ?",
        input.amount,
        saved.id,
        year,
        month,
      );
    } else {
      const card = selected.find((entry) => entry.methodId === input.methodId);
      if (!card)
        throw new Error("연말정산에 포함할 카드를 먼저 선택해 주세요.");
      await db.runAsync(
        "INSERT INTO monthly_tax_cards (year, month, methodId, name, providerName, cardTypeCode, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
        year,
        month,
        card.methodId,
        card.name,
        card.providerName,
        card.cardTypeCode,
        input.amount,
      );
    }
  }
}
