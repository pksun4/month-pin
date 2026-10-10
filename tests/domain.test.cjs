const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const ts = require("typescript");

// Exercise the production repository against SQLite, without a mobile runtime.
const modules = new Map();
function loadTypeScript(path) {
  if (modules.has(path)) return modules.get(path);
  const source = ts.transpileModule(
    readFileSync(join(__dirname, "..", path), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", source)(
    module,
    module.exports,
    (request) =>
      request.startsWith(".")
        ? loadTypeScript(join(dirname(path), `${request}.ts`))
        : require(request),
  );
  modules.set(path, module.exports);
  return module.exports;
}
const repository = loadTypeScript("src/data/database.ts");
const domain = loadTypeScript("src/utils/expenses.ts");

function sqliteAdapter(path = ":memory:") {
  const sqlite = new DatabaseSync(path);
  return {
    sqlite,
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    withTransactionAsync: async (action) => {
      sqlite.exec("BEGIN");
      try {
        await action();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const bankInput = {
  kind: "bank",
  providerCode: "bank_kb",
  name: "급여 통장",
  bankId: null,
  settlementDay: null,
};

test("month end, leap year, today and year rollover schedules", () => {
  const cases = [
    [31, new Date(2026, 1, 10), [2026, 1, 28]],
    [31, new Date(2024, 1, 29, 23), [2024, 1, 29]],
    [30, new Date(2026, 3, 30, 12), [2026, 3, 30]],
    [1, new Date(2026, 11, 31), [2027, 0, 1]],
    [20, new Date(2026, 9, 21), [2026, 10, 20]],
  ];
  for (const [day, now, expected] of cases) {
    const date = domain.nextChargeDate(day, now);
    assert.deepEqual(
      [date.getFullYear(), date.getMonth(), date.getDate()],
      expected,
    );
  }
});

test("amount and day validation rejects invalid inputs", () => {
  assert.equal(domain.parseAmount("17,000"), 17000);
  assert.equal(domain.parseDay("31"), 31);
  for (const value of ["0", "-1", "1.5", "1e5", "1000000000", ""])
    assert.equal(domain.parseAmount(value), null);
  for (const value of ["0", "32", "1.5", "", "1e1"])
    assert.equal(domain.parseDay(value), null);
});

test("CRUD keeps bank/card links and counts each expense once in the total", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    await repository.saveMethod(db, {
      kind: "card",
      providerCode: "card_samsung",
      name: "생활비 카드",
      bankId: bank.id,
      settlementDay: 25,
    });
    const card = (await repository.readMethods(db))[0];
    await repository.saveExpense(db, {
      name: "월세",
      amount: 750000,
      chargeDay: 1,
      methodId: bank.id,
    });
    await repository.saveExpense(db, {
      name: "넷플릭스",
      amount: 17000,
      chargeDay: 20,
      methodId: card.id,
    });
    let expenses = await repository.readExpenses(db);
    let methods = await repository.readMethods(db);
    assert.equal(domain.monthlyTotal(expenses), 767000);
    assert.equal(
      domain.monthlyTotal(domain.relatedExpenses(bank, methods, expenses)),
      767000,
    );
    assert.equal(
      domain.monthlyTotal(domain.relatedExpenses(card, methods, expenses)),
      17000,
    );
    const netflix = expenses.find((expense) => expense.name === "넷플릭스");
    await repository.saveExpense(
      db,
      {
        name: "넷플릭스 '프리미엄'",
        amount: 20000,
        chargeDay: 21,
        methodId: card.id,
      },
      netflix.id,
    );
    await repository.deleteMethod(db, bank.id);
    expenses = await repository.readExpenses(db);
    methods = await repository.readMethods(db);
    assert.equal(expenses.length, 2);
    assert.equal(
      expenses.find((expense) => expense.name === "월세").methodId,
      null,
    );
    assert.equal(methods[0].bankId, null);
    assert.equal(
      expenses.find((expense) => expense.id === netflix.id).amount,
      20000,
    );
    await repository.deleteMethod(db, card.id);
    assert.equal(
      (await repository.readExpenses(db)).find(
        (expense) => expense.id === netflix.id,
      ).methodId,
      null,
    );
    await repository.deleteExpense(db, netflix.id);
    assert.equal((await repository.readExpenses(db)).length, 1);
  } finally {
    db.sqlite.close();
  }
});

test("data persists after reopening and repeated initialization", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-test-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    await repository.saveExpense(db, {
      name: "통신비",
      amount: 50000,
      chargeDay: 15,
      methodId: 1,
    });
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.equal((await repository.readExpenses(db))[0].amount, 50000);
    assert.equal((await repository.readMethods(db))[0].name, "급여 통장");
    await assert.rejects(
      repository.saveExpense(db, {
        name: "잘못된 날짜",
        amount: 500,
        chargeDay: 32,
        methodId: null,
      }),
    );
    await assert.rejects(
      repository.saveMethod(db, {
        kind: "card",
        providerCode: "card_samsung",
        name: "카드",
        bankId: 999,
        settlementDay: 25,
      }),
    );
    assert.equal((await repository.readExpenses(db)).length, 1);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

// The shipped v1 schema is kept as a fixture to test real upgrade behavior.
const V1_SCHEMA = `
  CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 40),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    bankId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    settlementDay INTEGER CHECK (settlementDay BETWEEN 1 AND 31),
    CHECK (kind = 'card' OR (bankId IS NULL AND settlementDay IS NULL))
  );
  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL
  );
  CREATE INDEX expenses_method_idx ON expenses(methodId);
  PRAGMA user_version = 1;
`;

async function seedLegacy(db) {
  await db.execAsync(V1_SCHEMA);
  await db.execAsync(`
    INSERT INTO payment_methods (id, kind, provider, name, bankId, settlementDay) VALUES
      (1, 'bank', ' 국민 은행 ', '급여 통장', NULL, NULL),
      (2, 'card', '비씨카드', '생활비 카드', 1, 25),
      (3, 'bank', '직접 작성한 은행', '예전 통장', NULL, NULL),
      (80, 'bank', '우리은행', '삭제한 통장', NULL, NULL);
    DELETE FROM payment_methods WHERE id = 80;
    INSERT INTO expenses (id, name, amount, chargeDay, methodId) VALUES
      (10, '월세', 750000, 1, 1),
      (11, '구독', 17000, 20, 2),
      (12, '보험', 30000, 5, 3);
  `);
}

test("v1 migration preserves names, IDs, expenses, bank links, and deleted ID sequence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-migration-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await seedLegacy(db);
    const originalExpenses = await repository.readExpenses(db);
    await repository.initializeDatabase(db);
    let methods = await repository.readMethods(db);
    assert.equal(methods.find((m) => m.id === 1).providerCode, "bank_kb");
    assert.equal(methods.find((m) => m.id === 1).provider, "KB국민은행");
    assert.equal(methods.find((m) => m.id === 2).providerCode, "card_bc");
    assert.equal(methods.find((m) => m.id === 2).bankId, 1);
    assert.equal(methods.find((m) => m.id === 2).settlementDay, 25);
    assert.equal(methods.find((m) => m.id === 3).providerCode, null);
    assert.equal(methods.find((m) => m.id === 3).provider, "직접 작성한 은행");
    assert.deepEqual(await repository.readExpenses(db), originalExpenses);
    assert.equal(
      domain.monthlyTotal(
        domain.relatedExpenses(
          methods.find((m) => m.id === 1),
          methods,
          originalExpenses,
        ),
      ),
      767000,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      3,
    );

    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await repository.readExpenses(db), originalExpenses);

    // An unsupported legacy label can be replaced only by a catalog selection.
    await repository.saveMethod(
      db,
      { ...bankInput, providerCode: "bank_woori", name: "예전 통장" },
      3,
    );
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT legacyProvider FROM payment_methods WHERE id = 3",
        )
      ).legacyProvider,
      null,
    );
    await repository.saveMethod(db, bankInput);
    assert.equal(
      (await repository.readMethods(db)).find((m) => m.id === 81).sortOrder,
      2,
    );

    await repository.deleteMethod(db, 1);
    methods = await repository.readMethods(db);
    assert.equal(methods.find((m) => m.id === 2).bankId, null);
    assert.equal(
      (await repository.readExpenses(db)).find((e) => e.id === 10).methodId,
      null,
    );
    assert.equal(
      (await repository.readExpenses(db)).find((e) => e.id === 11).methodId,
      2,
    );
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("a failed migration rolls back schema and data and can be retried", async () => {
  const db = sqliteAdapter();
  try {
    await seedLegacy(db);
    const originalExpenses = await repository.readExpenses(db);
    const originalMethods = await db.getAllAsync(
      "SELECT * FROM payment_methods ORDER BY id",
    );
    const read = db.getAllAsync;
    db.getAllAsync = async (sql, ...params) => {
      if (sql === "PRAGMA foreign_key_check")
        throw new Error("Simulated migration failure");
      return read(sql, ...params);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      1,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA foreign_keys")).foreign_keys,
      1,
    );
    assert.deepEqual(
      await read("SELECT * FROM payment_methods ORDER BY id"),
      originalMethods,
    );
    assert.deepEqual(await repository.readExpenses(db), originalExpenses);
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'payment_methods_v2'",
      ),
      undefined,
    );
    db.getAllAsync = read;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      3,
    );
    assert.deepEqual(await repository.readExpenses(db), originalExpenses);
  } finally {
    db.sqlite.close();
  }
});

test("only supported codes of the matching kind are saved; display names are centrally managed", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    for (const providerCode of [null, "", "unknown_bank", "card_samsung"]) {
      await assert.rejects(
        repository.saveMethod(db, { ...bankInput, providerCode }),
      );
    }
    await assert.rejects(
      repository.saveMethod(db, {
        ...bankInput,
        provider: "직접 입력",
        providerCode: undefined,
      }),
    );
    await assert.rejects(
      db.runAsync(
        "INSERT INTO payment_methods (kind, providerCode, name) VALUES (?, ?, ?)",
        "bank",
        "card_samsung",
        "잘못된 종류",
      ),
    );
    await assert.rejects(
      db.runAsync(
        "INSERT INTO payment_methods (kind, providerCode, name) VALUES (?, ?, ?)",
        "bank",
        "unknown_bank",
        "잘못된 코드",
      ),
    );
    assert.equal((await repository.readMethods(db)).length, 0);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    assert.equal(bank.providerCode, "bank_kb");
    assert.equal(bank.provider, "KB국민은행");
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT legacyProvider FROM payment_methods WHERE id = ?",
          bank.id,
        )
      ).legacyProvider,
      null,
    );
    await assert.rejects(
      repository.saveMethod(
        db,
        {
          ...bankInput,
          kind: "card",
          providerCode: "card_samsung",
        },
        bank.id,
      ),
    );
    await db.runAsync(
      "UPDATE payment_providers SET name = ? WHERE code = ?",
      "변경된 표시명",
      "bank_kb",
    );
    assert.equal(
      (await repository.readMethods(db))[0].provider,
      "변경된 표시명",
    );
    assert.equal((await repository.readMethods(db))[0].providerCode, "bank_kb");
    await repository.initializeDatabase(db);
    assert.equal((await repository.readMethods(db))[0].provider, "KB국민은행");
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT COUNT(*) AS count FROM payment_providers",
        )
      ).count,
      19,
    );
  } finally {
    db.sqlite.close();
  }
});

test("method order persists independently by kind; edits and additions preserve it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-order-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  const idsOf = async (kind) =>
    (await repository.readMethods(db))
      .filter((m) => m.kind === kind)
      .map((m) => m.id);
  try {
    await repository.initializeDatabase(db);
    for (const name of ["A", "B", "C"])
      await repository.saveMethod(db, { ...bankInput, name });
    const [a, b, c] = await idsOf("bank");
    for (const name of ["X", "Y"])
      await repository.saveMethod(db, {
        kind: "card",
        providerCode: "card_samsung",
        name,
        bankId: a,
        settlementDay: 25,
      });
    const [x, y] = await idsOf("card");
    await repository.saveExpense(db, {
      name: "구독",
      amount: 17000,
      chargeDay: 20,
      methodId: x,
    });
    const originalExpenses = await repository.readExpenses(db);
    await repository.reorderMethods(db, "bank", [c, a, b]);
    assert.deepEqual(await idsOf("bank"), [c, a, b]);
    assert.deepEqual(await idsOf("card"), [x, y]);
    await repository.reorderMethods(db, "card", [y, x]);
    assert.deepEqual(await idsOf("card"), [y, x]);
    await repository.saveMethod(db, { ...bankInput, name: "수정된 B" }, b);
    assert.deepEqual(await idsOf("bank"), [c, a, b]);
    await repository.saveMethod(db, { ...bankInput, name: "D" });
    const newBank = (await repository.readMethods(db)).find(
      (m) => m.name === "D",
    );
    assert.deepEqual(await idsOf("bank"), [c, a, b, newBank.id]);
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await idsOf("bank"), [c, a, b, newBank.id]);
    assert.deepEqual(await idsOf("card"), [y, x]);
    const methods = await repository.readMethods(db);
    assert.equal(methods.find((m) => m.id === x).bankId, a);
    assert.equal(methods.find((m) => m.id === x).settlementDay, 25);
    assert.deepEqual(await repository.readExpenses(db), originalExpenses);
    assert.equal(
      domain.monthlyTotal(
        domain.relatedExpenses(
          methods.find((m) => m.id === a),
          methods,
          originalExpenses,
        ),
      ),
      17000,
    );
    await repository.deleteMethod(db, a);
    assert.deepEqual(await idsOf("bank"), [c, b, newBank.id]);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("invalid order and failed writes leave the whole previous order intact", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    for (const name of ["A", "B", "C"])
      await repository.saveMethod(db, { ...bankInput, name });
    const banks = await repository.readMethods(db);
    const ids = banks.map((m) => m.id);
    await repository.saveMethod(db, {
      kind: "card",
      providerCode: "card_samsung",
      name: "X",
      bankId: null,
      settlementDay: null,
    });
    const card = (await repository.readMethods(db)).find(
      (m) => m.kind === "card",
    );
    const before = await repository.readMethods(db);
    for (const invalid of [
      ids.slice(1),
      [ids[0], ids[0], ids[2]],
      [ids[0], ids[1], card.id],
      [ids[0], ids[1], 999],
      [...ids, 999],
    ]) {
      await assert.rejects(repository.reorderMethods(db, "bank", invalid));
      assert.deepEqual(await repository.readMethods(db), before);
    }
    const run = db.runAsync;
    let writes = 0;
    db.runAsync = async (sql, ...params) => {
      if (
        sql.startsWith("UPDATE payment_methods SET sortOrder") &&
        ++writes === 2
      )
        throw new Error("Simulated order save failure");
      return run(sql, ...params);
    };
    await assert.rejects(
      repository.reorderMethods(db, "bank", [...ids].reverse()),
      /Simulated order save failure/,
    );
    assert.deepEqual(await repository.readMethods(db), before);
    db.runAsync = run;
    await repository.reorderMethods(db, "bank", [...ids].reverse());
    assert.deepEqual(
      (await repository.readMethods(db))
        .filter((m) => m.kind === "bank")
        .map((m) => m.id),
      [...ids].reverse(),
    );
    await repository.reorderMethods(db, "card", [card.id]);
    assert.equal(
      (await repository.readMethods(db)).find((m) => m.id === card.id)
        .sortOrder,
      0,
    );
  } finally {
    db.sqlite.close();
  }
});

const V2_SCHEMA = `
  CREATE TABLE payment_providers (
    code TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    name TEXT NOT NULL, UNIQUE (code, kind)
  );
  CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('bank', 'card')),
    providerCode TEXT, legacyProvider TEXT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    bankId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    settlementDay INTEGER CHECK (settlementDay BETWEEN 1 AND 31),
    FOREIGN KEY (providerCode, kind) REFERENCES payment_providers(code, kind),
    CHECK (providerCode IS NOT NULL OR (legacyProvider IS NOT NULL AND length(trim(legacyProvider)) BETWEEN 1 AND 40)),
    CHECK (kind = 'card' OR (bankId IS NULL AND settlementDay IS NULL))
  );
  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 999999999),
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL
  );
  CREATE INDEX expenses_method_idx ON expenses(methodId);
  PRAGMA user_version = 2;
`;

test("v2 upgrade keeps existing newest-first order and links; failed upgrades can retry", async () => {
  const db = sqliteAdapter();
  try {
    await db.execAsync(V2_SCHEMA);
    await db.execAsync(`
      INSERT INTO payment_providers (code, kind, name) VALUES ('bank_kb', 'bank', 'KB국민은행'), ('card_samsung', 'card', '삼성카드');
      INSERT INTO payment_methods (id, kind, providerCode, name, bankId, settlementDay) VALUES
        (1, 'bank', 'bank_kb', 'A', NULL, NULL),
        (2, 'card', 'card_samsung', 'X', 1, 25),
        (3, 'bank', 'bank_kb', 'B', NULL, NULL),
        (4, 'card', 'card_samsung', 'Y', 3, 15);
      INSERT INTO expenses (name, amount, chargeDay, methodId) VALUES ('구독', 17000, 20, 2);
    `);
    const read = db.getAllAsync;
    db.getAllAsync = async (sql, ...params) => {
      if (sql === "SELECT id, kind FROM payment_methods ORDER BY id DESC")
        throw new Error("Simulated order migration failure");
      return read(sql, ...params);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated order migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      2,
    );
    assert.equal(
      (await read("PRAGMA table_info(payment_methods)")).some(
        (c) => c.name === "sortOrder",
      ),
      false,
    );
    db.getAllAsync = read;
    await repository.initializeDatabase(db);
    const methods = await repository.readMethods(db);
    assert.deepEqual(
      methods.filter((m) => m.kind === "bank").map((m) => m.id),
      [3, 1],
    );
    assert.deepEqual(
      methods.filter((m) => m.kind === "card").map((m) => m.id),
      [4, 2],
    );
    assert.equal(methods.find((m) => m.id === 2).bankId, 1);
    assert.equal((await repository.readExpenses(db))[0].methodId, 2);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
  } finally {
    db.sqlite.close();
  }
});
