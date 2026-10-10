import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  MethodKind,
  PaymentMethod,
} from "./models";
import { getProvider, matchLegacyProvider, PROVIDERS } from "./providers";
import { getExpenseAmountType, getExpenseCategory } from "./expense-types";
import { CARD_TYPES, getCardType } from "./method-types";

const EXPENSE_CATEGORY_COLUMN =
  "categoryCode TEXT CHECK (categoryCode IS NULL OR categoryCode IN ('living', 'subscription'))";

const CARD_TYPE_COLUMN = `cardTypeCode TEXT CHECK (
  (cardTypeCode IS NULL OR cardTypeCode IN (${CARD_TYPES.map((type) => `'${type.code}'`).join(", ")}))
  AND (kind = 'card' OR cardTypeCode IS NULL)
  AND (cardTypeCode IS NULL OR cardTypeCode != 'debit' OR settlementDay IS NULL)
)`;

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
    ${ordered ? `${CARD_TYPE_COLUMN},` : ""}
    ${ordered ? "sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0)," : ""}
    FOREIGN KEY (providerCode, kind) REFERENCES payment_providers(code, kind),
    CHECK (providerCode IS NOT NULL OR
      (legacyProvider IS NOT NULL AND length(trim(legacyProvider)) BETWEEN 1 AND 40)),
    CHECK (kind = 'card' OR (bankId IS NULL AND settlementDay IS NULL))
  );`;
}

function expenseSchema(table: "expenses" | "expenses_v4", current = true) {
  return `CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amountTypeCode TEXT NOT NULL CHECK (amountTypeCode IN ('fixed', 'variable')),
    amount INTEGER,
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    ${current ? `sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0), ${EXPENSE_CATEGORY_COLUMN},` : ""}
    CHECK ((amountTypeCode = 'fixed' AND amount IS NOT NULL
      AND typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999)
      OR (amountTypeCode = 'variable' AND amount IS NULL))
  );`;
}

export const SCHEMA = `
  ${PROVIDER_SCHEMA}
  ${methodSchema("payment_methods")}
  ${expenseSchema("expenses")}
  CREATE INDEX IF NOT EXISTS expenses_method_idx ON expenses(methodId);
  CREATE INDEX IF NOT EXISTS methods_order_idx ON payment_methods(kind, sortOrder, id);
  CREATE INDEX IF NOT EXISTS expenses_order_idx ON expenses(sortOrder, id);
  PRAGMA user_version = 7;
`;

async function migrateExpenseTypes(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    const sequence = await db.getFirstAsync<{ seq: number }>(
      "SELECT seq FROM sqlite_sequence WHERE name = 'expenses'",
    );
    await db.execAsync(expenseSchema("expenses_v4", false));
    await db.execAsync(`
      INSERT INTO expenses_v4 (id, name, amountTypeCode, amount, chargeDay, methodId)
      SELECT id, name, 'fixed', amount, chargeDay, methodId FROM expenses;
      DROP TABLE expenses;
      ALTER TABLE expenses_v4 RENAME TO expenses;
      CREATE INDEX expenses_method_idx ON expenses(methodId);
    `);
    if (sequence) {
      await db.runAsync(
        "UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'expenses'",
        sequence.seq,
      );
      await db.runAsync(
        `INSERT INTO sqlite_sequence (name, seq) SELECT 'expenses', ?
         WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'expenses')`,
        sequence.seq,
      );
    }
    if ((await db.getAllAsync("PRAGMA foreign_key_check")).length)
      throw new Error("기존 고정비의 연결을 확인하지 못했어요.");
    await db.execAsync("PRAGMA user_version = 4;");
  });
}

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

async function migrateExpenseOrder(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      "ALTER TABLE expenses ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0);",
    );
    const expenses = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM expenses ORDER BY id",
    );
    for (const [position, expense] of expenses.entries()) {
      await db.runAsync(
        "UPDATE expenses SET sortOrder = ? WHERE id = ?",
        position,
        expense.id,
      );
    }
    await db.execAsync(
      "CREATE INDEX expenses_order_idx ON expenses(sortOrder, id); PRAGMA user_version = 5;",
    );
  });
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
  if ((version?.user_version ?? 0) > 7)
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
    if (version.user_version <= 3) await migrateExpenseTypes(db);
    if (version.user_version <= 4) await migrateExpenseOrder(db);
    if (version.user_version <= 5) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(
          `ALTER TABLE expenses ADD COLUMN ${EXPENSE_CATEGORY_COLUMN};`,
        );
        await db.execAsync("PRAGMA user_version = 6;");
      });
    }
    if (version.user_version <= 6) {
      await db.withTransactionAsync(async () => {
        // NULL preserves unknown legacy card types without guessing from names.
        await db.execAsync(
          `ALTER TABLE payment_methods ADD COLUMN ${CARD_TYPE_COLUMN};`,
        );
        await db.execAsync("PRAGMA user_version = 7;");
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
      m.name, m.bankId, m.settlementDay, m.cardTypeCode, m.sortOrder
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
  const categoryCode = input.categoryCode ?? null;
  if (categoryCode !== null && !getExpenseCategory(categoryCode))
    throw new Error("생활·구독 분류를 선택해 주세요.");
  if (!getExpenseAmountType(input.amountTypeCode))
    throw new Error("금액 유형을 선택해 주세요.");
  if (input.amountTypeCode === "fixed") {
    if (
      input.amount === null ||
      !Number.isSafeInteger(input.amount) ||
      input.amount < 1 ||
      input.amount > 999999999
    )
      throw new Error("고정 금액을 확인해 주세요.");
  } else if (input.amount !== null) {
    throw new Error("변동 항목에는 기본 금액을 저장하지 않아요.");
  }
  if (id !== undefined) {
    await db.runAsync(
      "UPDATE expenses SET name = ?, amountTypeCode = ?, amount = ?, chargeDay = ?, methodId = ?, categoryCode = ? WHERE id = ?",
      input.name,
      input.amountTypeCode,
      input.amount,
      input.chargeDay,
      input.methodId,
      categoryCode,
      id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO expenses (name, amountTypeCode, amount, chargeDay, methodId, categoryCode, sortOrder)
       SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sortOrder), -1) + 1 FROM expenses`,
      input.name,
      input.amountTypeCode,
      input.amount,
      input.chargeDay,
      input.methodId,
      categoryCode,
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
  const cardTypeCode = input.cardTypeCode ?? null;
  if (input.kind === "card" && !getCardType(cardTypeCode))
    throw new Error("신용카드 또는 체크카드를 선택해 주세요.");
  if (input.kind === "bank" && cardTypeCode !== null)
    throw new Error("통장에는 카드 종류를 저장하지 않아요.");
  if (cardTypeCode === "debit" && input.settlementDay !== null)
    throw new Error("체크카드에는 대금 출금일을 저장하지 않아요.");
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
      "UPDATE payment_methods SET providerCode = ?, legacyProvider = NULL, name = ?, bankId = ?, settlementDay = ?, cardTypeCode = ? WHERE id = ?",
      input.providerCode,
      input.name,
      input.bankId,
      input.settlementDay,
      cardTypeCode,
      id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO payment_methods (kind, providerCode, name, bankId, settlementDay, cardTypeCode, sortOrder)
       SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sortOrder), -1) + 1
       FROM payment_methods WHERE kind = ?`,
      input.kind,
      input.providerCode,
      input.name,
      input.bankId,
      input.settlementDay,
      cardTypeCode,
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

export async function reorderExpenses(
  db: SQLiteDatabase,
  ids: readonly number[],
) {
  await db.withTransactionAsync(async () => {
    const current = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM expenses",
    );
    const currentIds = new Set(current.map((expense) => expense.id));
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !currentIds.has(id))
    )
      throw new Error("목록이 변경됐어요. 다시 시도해 주세요.");
    for (const [position, id] of ids.entries()) {
      await db.runAsync(
        "UPDATE expenses SET sortOrder = ? WHERE id = ?",
        position,
        id,
      );
    }
  });
}

export async function deleteMethod(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM payment_methods WHERE id = ?", id);
}
