import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  PaymentMethod,
} from "./models";

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 40),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    bankId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    settlementDay INTEGER CHECK (settlementDay BETWEEN 1 AND 31),
    CHECK (kind = 'card' OR (bankId IS NULL AND settlementDay IS NULL))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS expenses_method_idx ON expenses(methodId);
  PRAGMA user_version = 1;
`;

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const version = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((version?.user_version ?? 0) > 1)
    throw new Error("앱 업데이트가 필요해요.");
  if (!version?.user_version)
    await db.withTransactionAsync(() => db.execAsync(SCHEMA));
}

export function readExpenses(db: SQLiteDatabase) {
  return db.getAllAsync<Expense>(
    "SELECT * FROM expenses ORDER BY chargeDay, id DESC",
  );
}

export function readMethods(db: SQLiteDatabase) {
  return db.getAllAsync<PaymentMethod>(
    "SELECT * FROM payment_methods ORDER BY id DESC",
  );
}

export async function saveExpense(
  db: SQLiteDatabase,
  input: ExpenseInput,
  id?: number,
) {
  if (id !== undefined) {
    await db.runAsync(
      "UPDATE expenses SET name = ?, amount = ?, chargeDay = ?, methodId = ? WHERE id = ?",
      input.name,
      input.amount,
      input.chargeDay,
      input.methodId,
      id,
    );
  } else {
    await db.runAsync(
      "INSERT INTO expenses (name, amount, chargeDay, methodId) VALUES (?, ?, ?, ?)",
      input.name,
      input.amount,
      input.chargeDay,
      input.methodId,
    );
  }
}

export async function saveMethod(
  db: SQLiteDatabase,
  input: MethodInput,
  id?: number,
) {
  if (input.bankId !== null) {
    const bank = await db.getFirstAsync<PaymentMethod>(
      "SELECT * FROM payment_methods WHERE id = ? AND kind = ?",
      input.bankId,
      "bank",
    );
    if (!bank) throw new Error("출금 통장을 다시 선택해 주세요.");
  }
  if (id !== undefined) {
    await db.runAsync(
      "UPDATE payment_methods SET provider = ?, name = ?, bankId = ?, settlementDay = ? WHERE id = ?",
      input.provider,
      input.name,
      input.bankId,
      input.settlementDay,
      id,
    );
  } else {
    await db.runAsync(
      "INSERT INTO payment_methods (kind, provider, name, bankId, settlementDay) VALUES (?, ?, ?, ?, ?)",
      input.kind,
      input.provider,
      input.name,
      input.bankId,
      input.settlementDay,
    );
  }
}

export async function deleteExpense(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM expenses WHERE id = ?", id);
}

export async function deleteMethod(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM payment_methods WHERE id = ?", id);
}
