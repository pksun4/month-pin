import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  MethodKind,
  PaymentMethod,
} from "./models";
import { getProvider, matchLegacyProvider, PROVIDERS } from "./providers";

const PROVIDER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS payment_providers (
    code TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    name TEXT NOT NULL,
    UNIQUE (code, kind)
  );
`;

function methodSchema(
  table: "payment_methods" | "payment_methods_v2",
  ordered = true,
) {
  return `CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    providerCode TEXT,
    legacyProvider TEXT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    bankId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    settlementDay INTEGER CHECK (settlementDay BETWEEN 1 AND 31),
    ${ordered ? "sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0)," : ""}
    FOREIGN KEY (providerCode, kind) REFERENCES payment_providers(code, kind),
    CHECK (providerCode IS NOT NULL OR
      (legacyProvider IS NOT NULL AND length(trim(legacyProvider)) BETWEEN 1 AND 40)),
    CHECK (kind = 'card' OR (bankId IS NULL AND settlementDay IS NULL))
  );`;
}

export const SCHEMA = `
  ${PROVIDER_SCHEMA}
  ${methodSchema("payment_methods")}
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS expenses_method_idx ON expenses(methodId);
  CREATE INDEX IF NOT EXISTS methods_order_idx ON payment_methods(kind, sortOrder, id);
  PRAGMA user_version = 3;
`;

async function syncProviders(db: SQLiteDatabase) {
  for (const provider of PROVIDERS) {
    await db.runAsync(
      `INSERT INTO payment_providers (code, kind, name) VALUES (?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name`,
      provider.code,
      provider.kind,
      provider.name,
    );
  }
}

async function migrateProviders(db: SQLiteDatabase) {
  // Initialization finishes before app consumers mount. Disable foreign keys
  // outside the transaction so rebuilding methods cannot clear expense links.
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(PROVIDER_SCHEMA);
      await syncProviders(db);
      const methods = await db.getAllAsync<
        Omit<PaymentMethod, "providerCode" | "sortOrder">
      >("SELECT * FROM payment_methods ORDER BY id");
      const sequence = await db.getFirstAsync<{ seq: number }>(
        "SELECT seq FROM sqlite_sequence WHERE name = 'payment_methods'",
      );
      await db.execAsync(methodSchema("payment_methods_v2", false));
      for (const method of methods) {
        const provider = matchLegacyProvider(method.kind, method.provider);
        await db.runAsync(
          `INSERT INTO payment_methods_v2
           (id, kind, providerCode, legacyProvider, name, bankId, settlementDay)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          method.id,
          method.kind,
          provider?.code ?? null,
          provider ? null : method.provider,
          method.name,
          method.bankId,
          method.settlementDay,
        );
      }
      await db.execAsync(`
        DROP TABLE payment_methods;
        ALTER TABLE payment_methods_v2 RENAME TO payment_methods;
      `);
      // Preserve even previously deleted IDs, which AUTOINCREMENT must not reuse.
      if (sequence) {
        await db.runAsync(
          "UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'payment_methods'",
          sequence.seq,
        );
        await db.runAsync(
          `INSERT INTO sqlite_sequence (name, seq) SELECT 'payment_methods', ?
           WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'payment_methods')`,
          sequence.seq,
        );
      }
      if ((await db.getAllAsync("PRAGMA foreign_key_check")).length)
        throw new Error("기존 데이터의 연결을 확인하지 못했어요.");
      await db.execAsync("PRAGMA user_version = 2;");
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const version = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((version?.user_version ?? 0) > 3)
    throw new Error("앱 업데이트가 필요해요.");
  if (!version?.user_version) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA);
      await syncProviders(db);
    });
  } else {
    if (version.user_version === 1) await migrateProviders(db);
    if (version.user_version <= 2) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(
          "ALTER TABLE payment_methods ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0);",
        );
        const methods = await db.getAllAsync<{ id: number; kind: MethodKind }>(
          "SELECT id, kind FROM payment_methods ORDER BY id DESC",
        );
        const position = { bank: 0, card: 0 };
        for (const method of methods) {
          await db.runAsync(
            "UPDATE payment_methods SET sortOrder = ? WHERE id = ?",
            position[method.kind]++,
            method.id,
          );
        }
        await db.execAsync(
          "CREATE INDEX methods_order_idx ON payment_methods(kind, sortOrder, id); PRAGMA user_version = 3;",
        );
      });
    }
    await db.withTransactionAsync(() => syncProviders(db));
  }
}

export function readExpenses(db: SQLiteDatabase) {
  return db.getAllAsync<Expense>(
    "SELECT * FROM expenses ORDER BY chargeDay, id DESC",
  );
}

export function readMethods(db: SQLiteDatabase) {
  return db.getAllAsync<PaymentMethod>(
    `SELECT m.id, m.kind, m.providerCode,
      COALESCE(p.name, m.legacyProvider) AS provider,
      m.name, m.bankId, m.settlementDay, m.sortOrder
     FROM payment_methods m
     LEFT JOIN payment_providers p ON p.code = m.providerCode AND p.kind = m.kind
     ORDER BY m.sortOrder, m.id DESC`,
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
  const provider = getProvider(input.providerCode);
  if (!provider || provider.kind !== input.kind)
    throw new Error("목록에서 은행 또는 카드사를 선택해 주세요.");
  if (id !== undefined) {
    const existing = await db.getFirstAsync<{ kind: MethodKind }>(
      "SELECT kind FROM payment_methods WHERE id = ?",
      id,
    );
    if (!existing || existing.kind !== input.kind)
      throw new Error("수정할 결제수단을 다시 확인해 주세요.");
  }
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
      "UPDATE payment_methods SET providerCode = ?, legacyProvider = NULL, name = ?, bankId = ?, settlementDay = ? WHERE id = ?",
      input.providerCode,
      input.name,
      input.bankId,
      input.settlementDay,
      id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO payment_methods (kind, providerCode, name, bankId, settlementDay, sortOrder)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sortOrder), -1) + 1
       FROM payment_methods WHERE kind = ?`,
      input.kind,
      input.providerCode,
      input.name,
      input.bankId,
      input.settlementDay,
      input.kind,
    );
  }
}

export async function reorderMethods(
  db: SQLiteDatabase,
  kind: MethodKind,
  ids: readonly number[],
) {
  if (kind !== "bank" && kind !== "card")
    throw new Error("결제수단 종류를 확인해 주세요.");
  await db.withTransactionAsync(async () => {
    const current = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM payment_methods WHERE kind = ?",
      kind,
    );
    const currentIds = new Set(current.map((method) => method.id));
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !currentIds.has(id))
    ) {
      throw new Error("목록이 변경됐어요. 다시 시도해 주세요.");
    }
    for (const [position, id] of ids.entries()) {
      await db.runAsync(
        "UPDATE payment_methods SET sortOrder = ? WHERE id = ? AND kind = ?",
        position,
        id,
        kind,
      );
    }
  });
}

export async function deleteExpense(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM expenses WHERE id = ?", id);
}

export async function deleteMethod(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM payment_methods WHERE id = ?", id);
}
