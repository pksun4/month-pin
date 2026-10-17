import {
  YEAR_END_TAX_CARDS_SCHEMA,
  migrateOhaCheckSpending,
} from "./year-end-tax-cards";
import type { SQLiteDatabase } from "expo-sqlite";
import { INTEREST_INCOME_SCHEMA } from "./interest-income";
import type {
  Expense,
  ExpenseInput,
  MethodInput,
  MethodKind,
  PaymentMethod,
} from "./models";
import { getProvider, matchLegacyProvider, PROVIDERS } from "./providers";
import {
  getExpenseAmountType,
  getExpenseCategory,
  EXPENSE_STATUS_OPTIONS,
  type ExpenseStatusCode,
} from "./expense-types";
import {
  CARD_TYPES,
  CARD_BENEFIT_TYPES,
  getCardType,
  getCardBenefitType,
} from "./method-types";
import { LEDGER_SCHEMA } from "./ledger";
import { CARD_BENEFIT_SCHEMA } from "./card-benefits";
import {
  YEAR_END_TAX_SCHEMA,
  YEAR_END_TAX_SPENDING_SCHEMA,
  TAX_MONTH_CONFIRMED_COLUMN,
} from "./year-end-tax";
import {
  CARD_BENEFIT_HISTORY_SCHEMA,
  seedCardBenefitHistory,
  applyCardBenefitChange,
  updateCardBenefitMetadata,
} from "./card-benefit-history";
import {
  AMOUNT_HISTORY_SCHEMA,
  applyAmountChange,
  seedAmountHistory,
} from "./expense-amount-history";
import { monthKey, isValidMonth, moveMonth } from "../utils/ledger";

const START_MONTH_COLUMN =
  "startMonth TEXT NOT NULL DEFAULT '1000-01' CHECK (startMonth GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]' AND CAST(substr(startMonth, 6, 2) AS INTEGER) BETWEEN 1 AND 12)";
const DELETED_COLUMN =
  "isDeleted INTEGER NOT NULL DEFAULT 0 CHECK (isDeleted IN (0, 1))";
const END_MONTH_COLUMN =
  "endMonth TEXT CHECK (endMonth IS NULL OR (endMonth GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]' AND CAST(substr(endMonth, 6, 2) AS INTEGER) BETWEEN 1 AND 12))";

const EXPENSE_CATEGORY_COLUMN =
  "categoryCode TEXT CHECK (categoryCode IS NULL OR categoryCode IN ('living', 'subscription'))";

const CARD_TYPE_COLUMN = `cardTypeCode TEXT CHECK (
  (cardTypeCode IS NULL OR cardTypeCode IN (${CARD_TYPES.map((type) => `'${type.code}'`).join(", ")}))
  AND (kind = 'card' OR cardTypeCode IS NULL)
  AND (cardTypeCode IS NULL OR cardTypeCode != 'debit' OR settlementDay IS NULL)
)`;

const BENEFIT_TYPE_COLUMN = `benefitTypeCode TEXT CHECK (
  benefitTypeCode IS NULL OR (kind = 'card' AND benefitTypeCode IN (${CARD_BENEFIT_TYPES.map((type) => `'${type.code}'`).join(", ")}))
)`;
const BENEFIT_AMOUNT_COLUMN = `benefitAmount INTEGER CHECK (
  (benefitTypeCode IS NULL AND benefitAmount IS NULL) OR
  (kind = 'card' AND benefitTypeCode IS NOT NULL AND benefitAmount IS NOT NULL
    AND typeof(benefitAmount) = 'integer' AND benefitAmount BETWEEN 0 AND 999999999)
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
  benefits = false,
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
    ${benefits ? `${BENEFIT_TYPE_COLUMN}, ${BENEFIT_AMOUNT_COLUMN},` : ""}
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
    ${current ? `sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0), ${EXPENSE_CATEGORY_COLUMN}, ${START_MONTH_COLUMN}, ${END_MONTH_COLUMN}, ${DELETED_COLUMN},` : ""}
    CHECK ((amountTypeCode = 'fixed' AND amount IS NOT NULL
      AND typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999)
      OR (amountTypeCode = 'variable' AND amount IS NULL))
  );`;
}

export const SCHEMA = `
  ${PROVIDER_SCHEMA}
  ${methodSchema("payment_methods", true, true)}
  ${expenseSchema("expenses")}
  CREATE INDEX IF NOT EXISTS expenses_method_idx ON expenses(methodId);
  CREATE INDEX IF NOT EXISTS methods_order_idx ON payment_methods(kind, sortOrder, id);
  CREATE INDEX IF NOT EXISTS expenses_order_idx ON expenses(sortOrder, id);
  ${LEDGER_SCHEMA}
  ${AMOUNT_HISTORY_SCHEMA}
  ${CARD_BENEFIT_SCHEMA}
  ${CARD_BENEFIT_HISTORY_SCHEMA}
  ${YEAR_END_TAX_SCHEMA}
  ${YEAR_END_TAX_SPENDING_SCHEMA}
  ${YEAR_END_TAX_CARDS_SCHEMA}
  ${INTEREST_INCOME_SCHEMA}
  PRAGMA user_version = 20;
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
  if ((version?.user_version ?? 0) > 20)
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
    if (version.user_version <= 7) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(LEDGER_SCHEMA);
        await db.execAsync("PRAGMA user_version = 8;");
      });
    }
    if (version.user_version <= 8) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(ledger_entries)",
        );
        if (!columns.some((column) => column.name === "amountEntered"))
          await db.execAsync(
            "ALTER TABLE ledger_entries ADD COLUMN amountEntered INTEGER NOT NULL DEFAULT 0 CHECK (amountEntered IN (0, 1));",
          );
        await db.execAsync(
          "UPDATE ledger_entries SET amountEntered = 1 WHERE amountTypeCode = 'variable' AND amount IS NOT NULL;",
        );
        await db.execAsync(AMOUNT_HISTORY_SCHEMA);
        await seedAmountHistory(db);
        await db.execAsync("PRAGMA user_version = 9;");
      });
    }
    if (version.user_version <= 9) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(ledger_entries)",
        );
        if (!columns.some((column) => column.name === "methodId"))
          await db.execAsync(
            "ALTER TABLE ledger_entries ADD COLUMN methodId INTEGER CHECK (methodId IS NULL OR methodId > 0);",
          );
        // Match only a unique, exact snapshot; duplicate names must never be guessed.
        await db.execAsync(`UPDATE ledger_entries SET methodId = (
          SELECT m.id FROM payment_methods m
          JOIN expenses e ON e.methodId = m.id AND e.id = ledger_entries.expenseId
          WHERE m.kind = ledger_entries.methodKind AND m.name = ledger_entries.methodName
            AND m.providerCode IS ledger_entries.providerCode
        ) WHERE methodId IS NULL AND EXISTS (
          SELECT 1 FROM expenses e JOIN payment_methods m ON m.id = e.methodId
          WHERE e.id = ledger_entries.expenseId AND m.kind = ledger_entries.methodKind
            AND m.name = ledger_entries.methodName AND m.providerCode IS ledger_entries.providerCode
        ) AND (
          SELECT COUNT(*) FROM payment_methods m
          WHERE m.kind = ledger_entries.methodKind AND m.name = ledger_entries.methodName
            AND m.providerCode IS ledger_entries.providerCode
        ) = 1;
              PRAGMA user_version = 10;`);
      });
    }
    if (version.user_version <= 10) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(expenses)",
        );
        if (!columns.some((column) => column.name === "startMonth"))
          await db.execAsync(
            `ALTER TABLE expenses ADD COLUMN ${START_MONTH_COLUMN};`,
          );
        if (!columns.some((column) => column.name === "endMonth"))
          await db.execAsync(
            `ALTER TABLE expenses ADD COLUMN ${END_MONTH_COLUMN};`,
          );
        const historyColumns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(expense_amount_versions)",
        );
        if (historyColumns.some((column) => column.name === "effectiveDate")) {
          await db.execAsync(
            AMOUNT_HISTORY_SCHEMA.replace(
              "expense_amount_versions (",
              "expense_amount_versions_v11 (",
            ),
          );
          // Keep the latest setting when several date changes occurred in the same month.
          // Already recorded monthly actuals and automatic amounts remain untouched.
          await db.execAsync(`
            INSERT INTO expense_amount_versions_v11 (expenseId, effectiveMonth, amountTypeCode, amount)
            SELECT v.expenseId, substr(v.effectiveDate, 1, 7), v.amountTypeCode, v.amount
            FROM expense_amount_versions v
            WHERE v.effectiveDate = (SELECT MAX(other.effectiveDate) FROM expense_amount_versions other
              WHERE other.expenseId = v.expenseId AND substr(other.effectiveDate, 1, 7) = substr(v.effectiveDate, 1, 7));
            DROP TABLE expense_amount_versions;
            ALTER TABLE expense_amount_versions_v11 RENAME TO expense_amount_versions;
          `);
        }
        await db.execAsync("PRAGMA user_version = 11;");
      });
    }
    if (version.user_version <= 11) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(expenses)",
        );
        if (!columns.some((column) => column.name === "isDeleted"))
          await db.execAsync(
            `ALTER TABLE expenses ADD COLUMN ${DELETED_COLUMN};`,
          );
        // Retired monthly_card_usage tables and values are preserved if an older app created them.
        await db.execAsync("PRAGMA user_version = 12;");
      });
    }
    if (version.user_version <= 12) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(payment_methods)",
        );
        if (!columns.some((column) => column.name === "benefitTypeCode"))
          await db.execAsync(
            `ALTER TABLE payment_methods ADD COLUMN ${BENEFIT_TYPE_COLUMN};`,
          );
        if (!columns.some((column) => column.name === "benefitAmount"))
          await db.execAsync(
            `ALTER TABLE payment_methods ADD COLUMN ${BENEFIT_AMOUNT_COLUMN};`,
          );
        await db.execAsync("PRAGMA user_version = 13;");
      });
    }
    if (version.user_version <= 13) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(CARD_BENEFIT_SCHEMA);
        await db.execAsync("PRAGMA user_version = 14;");
      });
    }
    if (version.user_version <= 14) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(CARD_BENEFIT_HISTORY_SCHEMA);
        await seedCardBenefitHistory(db);
        await db.execAsync("PRAGMA user_version = 15;");
      });
    }
    if (version.user_version <= 15) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(YEAR_END_TAX_SCHEMA);
        await db.execAsync("PRAGMA user_version = 16;");
      });
    }
    if (version.user_version <= 16) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(YEAR_END_TAX_SPENDING_SCHEMA);
        await db.execAsync("PRAGMA user_version = 17;");
      });
    }
    if (version.user_version <= 17) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(YEAR_END_TAX_CARDS_SCHEMA);
        await migrateOhaCheckSpending(db);
        await db.execAsync("PRAGMA user_version = 18;");
      });
    }
    if (version.user_version <= 18) {
      await db.withTransactionAsync(async () => {
        const columns = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(monthly_tax_spending)",
        );
        if (!columns.some((column) => column.name === "confirmed"))
          await db.execAsync(
            `ALTER TABLE monthly_tax_spending ADD COLUMN ${TAX_MONTH_CONFIRMED_COLUMN};`,
          );
        await db.execAsync("PRAGMA user_version = 19;");
      });
    }
    if (version.user_version <= 19) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(INTEREST_INCOME_SCHEMA);
        await db.execAsync("PRAGMA user_version = 20;");
      });
    }
    await db.withTransactionAsync(() => syncProviders(db));
  }
}

export async function readExpenses(
  db: SQLiteDatabase,
  status: ExpenseStatusCode = "active",
) {
  if (!EXPENSE_STATUS_OPTIONS.some((option) => option.code === status))
    throw new Error("고정비 상태를 다시 확인해 주세요.");
  const expenses = await db.getAllAsync<
    Omit<Expense, "isDeleted"> & { isDeleted?: number }
  >("SELECT * FROM expenses ORDER BY chargeDay, id DESC");
  return expenses
    .filter(
      (expense) =>
        !expense.isDeleted &&
        (status === "active"
          ? expense.endMonth == null
          : expense.endMonth != null),
    )
    .map((expense) =>
      Object.assign(expense, {
        startMonth: expense.startMonth ?? "1000-01",
        endMonth: expense.endMonth ?? null,
        isDeleted: expense.isDeleted === 1,
      }),
    );
}

export function readMethods(db: SQLiteDatabase) {
  return db.getAllAsync<PaymentMethod>(
    `SELECT m.id, m.kind, m.providerCode,
      COALESCE(p.name, m.legacyProvider) AS provider,
      m.name, m.bankId, m.settlementDay, m.cardTypeCode, m.sortOrder,
      m.benefitTypeCode, m.benefitAmount
     FROM payment_methods m
     LEFT JOIN payment_providers p ON p.code = m.providerCode AND p.kind = m.kind
     ORDER BY m.sortOrder, m.id DESC`,
  );
}

export async function saveExpense(
  db: SQLiteDatabase,
  input: ExpenseInput,
  id?: number,
  effectiveMonth?: string,
  renewalSourceId?: number,
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
  await db.withTransactionAsync(async () => {
    if (id !== undefined) {
      const existing = await db.getFirstAsync<Expense>(
        "SELECT * FROM expenses WHERE id = ?",
        id,
      );
      if (!existing || existing.endMonth !== null || existing.isDeleted)
        throw new Error("수정할 고정비를 다시 확인해 주세요.");
      const startMonth = input.startMonth ?? existing.startMonth;
      if (!isValidMonth(startMonth))
        throw new Error("시작 월을 다시 확인해 주세요.");
      // Seed before overwriting the template so unvisited earlier months use the old amount.
      await seedAmountHistory(db);
      const amountChanged =
        existing.amountTypeCode !== input.amountTypeCode ||
        existing.amount !== input.amount;
      if (amountChanged)
        await applyAmountChange(db, id, input, effectiveMonth ?? monthKey());
      await db.runAsync(
        "UPDATE expenses SET name = ?, amountTypeCode = ?, amount = ?, chargeDay = ?, methodId = ?, categoryCode = ?, startMonth = ? WHERE id = ?",
        input.name,
        input.amountTypeCode,
        input.amount,
        input.chargeDay,
        input.methodId,
        categoryCode,
        startMonth,
        id,
      );
      if (startMonth !== existing.startMonth)
        await db.runAsync(
          "DELETE FROM ledger_entries WHERE expenseId = ? AND month < ? AND amountEntered = 0",
          id,
          startMonth,
        );
    } else {
      const startMonth = input.startMonth ?? monthKey();
      if (!isValidMonth(startMonth))
        throw new Error("시작 월을 다시 확인해 주세요.");
      if (renewalSourceId !== undefined) {
        if (!Number.isSafeInteger(renewalSourceId) || renewalSourceId < 1)
          throw new Error("다시 등록할 고정비를 확인해 주세요.");
        const source = await db.getFirstAsync<Expense>(
          "SELECT * FROM expenses WHERE id = ?",
          renewalSourceId,
        );
        if (!source || source.isDeleted || source.endMonth === null)
          throw new Error("종료 목록의 고정비를 선택해 주세요.");
        if (startMonth <= source.endMonth)
          throw new Error(
            "새 시작 월은 이전 마지막 반영 월보다 이후로 선택해 주세요.",
          );
      }
      await db.runAsync(
        `INSERT INTO expenses (name, amountTypeCode, amount, chargeDay, methodId, categoryCode, startMonth, sortOrder)
       SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sortOrder), -1) + 1 FROM expenses`,
        input.name,
        input.amountTypeCode,
        input.amount,
        input.chargeDay,
        input.methodId,
        categoryCode,
        startMonth,
      );
      await seedAmountHistory(db);
    }
  });
}

export async function saveMethod(
  db: SQLiteDatabase,
  input: MethodInput,
  id?: number,
  effectiveMonth?: string,
) {
  const provider = getProvider(input.providerCode);
  if (!provider || provider.kind !== input.kind)
    throw new Error("목록에서 은행 또는 카드사를 선택해 주세요.");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 40
  )
    throw new Error(
      input.kind === "card"
        ? "카드 이름은 1~40자로 입력해 주세요."
        : "통장 별명은 1~40자로 입력해 주세요.",
    );
  const cardTypeCode = input.cardTypeCode ?? null;
  if (input.kind === "card" && !getCardType(cardTypeCode))
    throw new Error("신용카드 또는 체크카드를 선택해 주세요.");
  if (input.kind === "bank" && cardTypeCode !== null)
    throw new Error("통장에는 카드 종류를 저장하지 않아요.");
  if (cardTypeCode === "debit" && input.settlementDay !== null)
    throw new Error("체크카드에는 대금 출금일을 저장하지 않아요.");
  if (
    cardTypeCode === "credit" &&
    (!Number.isInteger(input.settlementDay) ||
      input.settlementDay === null ||
      input.settlementDay < 1 ||
      input.settlementDay > 31)
  )
    throw new Error("출금일은 1일부터 31일까지 입력해 주세요.");
  const benefitTypeCode = input.benefitTypeCode ?? null;
  const benefitAmount = input.benefitAmount ?? null;
  if (
    input.kind === "bank" &&
    (benefitTypeCode !== null || benefitAmount !== null)
  )
    throw new Error("통장에는 카드 혜택을 저장하지 않아요.");
  if (
    (input.kind === "card" &&
      (benefitTypeCode === null || benefitAmount === null)) ||
    (benefitTypeCode === null && benefitAmount !== null) ||
    (benefitTypeCode !== null &&
      (!getCardBenefitType(benefitTypeCode) ||
        benefitAmount === null ||
        !Number.isSafeInteger(benefitAmount) ||
        benefitAmount < 0 ||
        benefitAmount > 999999999))
  )
    throw new Error("월 혜택 유형과 금액을 확인해 주세요.");
  if (
    input.kind === "card" &&
    (input.bankId === null ||
      !Number.isSafeInteger(input.bankId) ||
      input.bankId < 1)
  )
    throw new Error("카드에 연결할 통장을 선택해 주세요.");
  await db.withTransactionAsync(async () => {
    const existing =
      id === undefined
        ? null
        : await db.getFirstAsync<PaymentMethod>(
            "SELECT * FROM payment_methods WHERE id = ?",
            id,
          );
    if (id !== undefined && (!existing || existing.kind !== input.kind))
      throw new Error("수정할 결제수단을 다시 확인해 주세요.");
    if (input.bankId !== null) {
      const bank = await db.getFirstAsync<PaymentMethod>(
        "SELECT * FROM payment_methods WHERE id = ? AND kind = ?",
        input.bankId,
        "bank",
      );
      if (!bank) throw new Error("출금 통장을 다시 선택해 주세요.");
    }
    await seedCardBenefitHistory(db);
    let methodId = id;
    if (id !== undefined) {
      await db.runAsync(
        "UPDATE payment_methods SET providerCode = ?, legacyProvider = NULL, name = ?, bankId = ?, settlementDay = ?, cardTypeCode = ?, benefitTypeCode = ?, benefitAmount = ? WHERE id = ?",
        input.providerCode,
        input.name,
        input.bankId,
        input.settlementDay,
        cardTypeCode,
        benefitTypeCode,
        benefitAmount,
        id,
      );
    } else {
      const result = await db.runAsync(
        `INSERT INTO payment_methods (kind, providerCode, name, bankId, settlementDay, cardTypeCode, benefitTypeCode, benefitAmount, sortOrder)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sortOrder), -1) + 1
         FROM payment_methods WHERE kind = ?`,
        input.kind,
        input.providerCode,
        input.name,
        input.bankId,
        input.settlementDay,
        cardTypeCode,
        benefitTypeCode,
        benefitAmount,
        input.kind,
      );
      methodId = result.lastInsertRowId;
    }
    if (input.kind === "card") {
      const setting = {
        name: input.name,
        providerCode: input.providerCode,
        providerName: provider.name,
        benefitTypeCode,
        expectedAmount: benefitAmount,
      };
      const benefitChanged =
        !existing ||
        existing.benefitTypeCode !== benefitTypeCode ||
        existing.benefitAmount !== benefitAmount;
      if (benefitChanged)
        await applyCardBenefitChange(
          db,
          methodId!,
          setting,
          existing ? (effectiveMonth ?? monthKey()) : monthKey(),
        );
      else if (
        existing.name !== input.name ||
        existing.providerCode !== input.providerCode
      )
        await updateCardBenefitMetadata(db, methodId!, setting);
    }
  });
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

export async function endExpense(
  db: SQLiteDatabase,
  id: number,
  endMonth: string,
) {
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !isValidMonth(endMonth) ||
    endMonth < monthKey()
  )
    throw new Error("마지막 반영 월은 이번 달 이후로 선택해 주세요.");
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      "UPDATE expenses SET endMonth = ? WHERE id = ? AND endMonth IS NULL AND isDeleted = 0",
      endMonth,
      id,
    );
    if (!result.changes) throw new Error("종료할 고정비를 다시 확인해 주세요.");
    // Preserve every manual actual, including zero, and all occurrences through the last month.
    await db.runAsync(
      "DELETE FROM ledger_entries WHERE expenseId = ? AND month > ? AND amountEntered = 0",
      id,
      endMonth,
    );
  });
}

export async function deleteExpense(db: SQLiteDatabase, id: number) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("삭제할 고정비를 다시 확인해 주세요.");
  await db.withTransactionAsync(async () => {
    const expense = await db.getFirstAsync<Expense>(
      "SELECT * FROM expenses WHERE id = ?",
      id,
    );
    if (!expense || expense.isDeleted)
      throw new Error("삭제할 고정비를 다시 확인해 주세요.");
    const cutoff =
      expense.endMonth === null || expense.endMonth > monthKey()
        ? monthKey()
        : expense.endMonth;
    await db.runAsync(
      "UPDATE expenses SET isDeleted = 1, endMonth = ? WHERE id = ?",
      cutoff,
      id,
    );
    await db.runAsync(
      "DELETE FROM ledger_entries WHERE expenseId = ? AND month > ? AND amountEntered = 0",
      id,
      cutoff,
    );
  });
}

export async function reorderExpenses(
  db: SQLiteDatabase,
  ids: readonly number[],
) {
  await db.withTransactionAsync(async () => {
    const current = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM expenses WHERE endMonth IS NULL AND isDeleted = 0",
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
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("삭제할 결제수단을 다시 확인해 주세요.");
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<
      PaymentMethod & { providerName: string }
    >(
      `SELECT m.*, COALESCE(p.name, m.legacyProvider) AS providerName FROM payment_methods m
       LEFT JOIN payment_providers p ON p.code = m.providerCode WHERE m.id = ?`,
      id,
    );
    if (!existing) throw new Error("삭제할 결제수단을 다시 확인해 주세요.");
    await seedCardBenefitHistory(db);
    if (existing.kind === "card") {
      await applyCardBenefitChange(
        db,
        id,
        {
          name: existing.name,
          providerCode: existing.providerCode,
          providerName: existing.providerName,
          benefitTypeCode: null,
          expectedAmount: null,
        },
        moveMonth(monthKey(), 1),
      );
    }
    await db.runAsync("DELETE FROM payment_methods WHERE id = ?", id);
  });
}
