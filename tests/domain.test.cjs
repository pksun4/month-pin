const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const ts = require("typescript");

// Exercise the production repository against SQLite, without a mobile runtime.
function loadTypeScript(path) {
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
  new Function("module", "exports", source)(module, module.exports);
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
  provider: "KB국민은행",
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
      provider: "삼성카드",
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
        provider: "삼성카드",
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
