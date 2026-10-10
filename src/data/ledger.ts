import type { SQLiteDatabase } from "expo-sqlite";
import type { LedgerEntry } from "./models";
import { CARD_TYPES, METHOD_KINDS } from "./method-types";
import { EXPENSE_AMOUNT_TYPES, EXPENSE_CATEGORIES } from "./expense-types";
import { daysInMonth } from "../utils/ledger";

const codes = (items: readonly { code: string }[]) =>
  items.map((item) => `'${item.code}'`).join(", ");

export const LEDGER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL CHECK (month GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND CAST(substr(month, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
    expenseId INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amountTypeCode TEXT NOT NULL CHECK (amountTypeCode IN (${codes(EXPENSE_AMOUNT_TYPES)})),
    categoryCode TEXT CHECK (categoryCode IS NULL OR categoryCode IN (${codes(EXPENSE_CATEGORIES)})),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
    amount INTEGER CHECK (amount IS NULL OR (typeof(amount) = 'integer' AND amount BETWEEN 0 AND 999999999)),
    amountEntered INTEGER NOT NULL DEFAULT 0 CHECK (amountEntered IN (0, 1)),
    methodKind TEXT CHECK (methodKind IS NULL OR methodKind IN (${codes(METHOD_KINDS)})),
    methodId INTEGER CHECK (methodId IS NULL OR methodId > 0),
    providerCode TEXT REFERENCES payment_providers(code),
    providerName TEXT,
    methodName TEXT,
    cardTypeCode TEXT CHECK (cardTypeCode IS NULL OR cardTypeCode IN (${codes(CARD_TYPES)})),
    UNIQUE (month, expenseId),
    CHECK (amountTypeCode != 'fixed' OR amount IS NOT NULL),
    CHECK (cardTypeCode IS NULL OR (methodKind IS NOT NULL AND methodKind = 'card'))
  );
  CREATE INDEX IF NOT EXISTS ledger_month_day_idx ON ledger_entries(month, day, id);
`;

// The provider serializes this write/read pair with all other app mutations.
// Only missing entries are inserted. Explicit amount changes update future automatic entries.
export async function loadLedgerMonth(db: SQLiteDatabase, month: string) {
  const lastDay = daysInMonth(month);
  await db.runAsync(
    `DELETE FROM ledger_entries WHERE month = ? AND amountEntered = 0
      AND expenseId IN (SELECT id FROM expenses
        WHERE startMonth > ? OR (endMonth IS NOT NULL AND endMonth < ?))`,
    month,
    month,
    month,
  );
  await db.runAsync(
    `INSERT INTO ledger_entries
      (month, expenseId, name, amountTypeCode, categoryCode, day, amount,
       methodKind, methodId, providerCode, providerName, methodName, cardTypeCode)
     SELECT ?, e.id, e.name, COALESCE(v.amountTypeCode, e.amountTypeCode), e.categoryCode,
       MIN(e.chargeDay, ?), CASE WHEN v.id IS NULL THEN e.amount ELSE v.amount END, m.kind, m.id, m.providerCode,
       COALESCE(p.name, m.legacyProvider), m.name, m.cardTypeCode
     FROM expenses e
     LEFT JOIN expense_amount_versions v ON v.id = (
       SELECT id FROM expense_amount_versions
       WHERE expenseId = e.id AND effectiveMonth <= ?
       ORDER BY effectiveMonth DESC LIMIT 1
     )
     LEFT JOIN payment_methods m ON m.id = e.methodId
     LEFT JOIN payment_providers p ON p.code = m.providerCode
     WHERE e.startMonth <= ? AND (e.endMonth IS NULL OR e.endMonth >= ?)
     ON CONFLICT(month, expenseId) DO NOTHING`,
    month,
    lastDay,
    month,
    month,
    month,
  );
  return readLedgerMonth(db, month);
}

export async function readLedgerMonth(db: SQLiteDatabase, month: string) {
  daysInMonth(month);
  const rows = await db.getAllAsync<
    Omit<LedgerEntry, "amountEntered"> & { amountEntered: number }
  >("SELECT * FROM ledger_entries WHERE month = ? ORDER BY day, id", month);
  return rows.map((row) => ({
    ...row,
    amountEntered: row.amountEntered === 1,
  }));
}

export async function saveLedgerAmount(
  db: SQLiteDatabase,
  id: number,
  amount: number | null,
) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("수정할 내역을 다시 확인해 주세요.");
  if (
    amount !== null &&
    (!Number.isSafeInteger(amount) || amount < 0 || amount > 999999999)
  )
    throw new Error("금액은 0원부터 999,999,999원까지 입력해 주세요.");
  const result = await db.runAsync(
    "UPDATE ledger_entries SET amount = ?, amountEntered = ? WHERE id = ? AND amountTypeCode = 'variable'",
    amount,
    amount === null ? 0 : 1,
    id,
  );
  if (!result.changes) throw new Error("변동 금액 내역을 다시 확인해 주세요.");
}
