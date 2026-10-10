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
const ledgerRepository = loadTypeScript("src/data/ledger.ts");
const ledgerDomain = loadTypeScript("src/utils/ledger.ts");

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

function withFixedType(rows) {
  const ids = rows.map((row) => row.id).sort((a, b) => a - b);
  return rows.map((row) =>
    Object.assign(Object.create(Object.getPrototypeOf(row)), row, {
      amountTypeCode: "fixed",
      categoryCode: null,
      sortOrder: ids.indexOf(row.id),
    }),
  );
}

async function readPreCardTypeMethods(db) {
  return db.getAllAsync(`SELECT m.id, m.kind, m.providerCode,
    COALESCE(p.name, m.legacyProvider) AS provider,
    m.name, m.bankId, m.settlementDay, NULL AS cardTypeCode, m.sortOrder
    FROM payment_methods m
    LEFT JOIN payment_providers p ON p.code = m.providerCode AND p.kind = m.kind
    ORDER BY m.sortOrder, m.id DESC`);
}

const bankInput = {
  kind: "bank",
  providerCode: "bank_kb",
  name: "급여 통장",
  bankId: null,
  settlementDay: null,
  cardTypeCode: null,
};

const insuranceInput = {
  name: "보험료",
  amountTypeCode: "fixed",
  amount: 50000,
  chargeDay: 31,
  methodId: null,
  categoryCode: "living",
};

test("default-today changes preserve earlier occurrences and update today and cached future amounts", async () => {
  const db = sqliteAdapter();
  const today = new Date();
  const currentMonth = ledgerDomain.monthKey(today);
  const previousMonth = ledgerDomain.moveMonth(currentMonth, -1);
  const futureMonth = ledgerDomain.moveMonth(currentMonth, 1);
  try {
    await repository.initializeDatabase(db);
    const input = { ...insuranceInput, chargeDay: today.getDate() };
    await repository.saveExpense(db, input);
    const expense = (await repository.readExpenses(db))[0];
    const prior = await ledgerRepository.loadLedgerMonth(db, previousMonth);
    const current = await ledgerRepository.loadLedgerMonth(db, currentMonth);
    const future = await ledgerRepository.loadLedgerMonth(db, futureMonth);
    await repository.saveExpense(db, { ...input, amount: 55000 }, expense.id);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, previousMonth),
      prior,
    );
    const updated = (
      await ledgerRepository.loadLedgerMonth(db, currentMonth)
    )[0];
    assert.equal(updated.id, current[0].id);
    assert.equal(updated.amount, 55000);
    assert.equal(updated.amountEntered, false);
    const updatedFuture = (
      await ledgerRepository.loadLedgerMonth(db, futureMonth)
    )[0];
    assert.equal(updatedFuture.id, future[0].id);
    assert.equal(updatedFuture.amount, 55000);
    // Loading an earlier month for the first time uses the baseline, not the edited template.
    assert.equal(
      (
        await ledgerRepository.loadLedgerMonth(
          db,
          ledgerDomain.moveMonth(currentMonth, -2),
        )
      )[0].amount,
      50000,
    );
    const versions = await db.getAllAsync(
      "SELECT effectiveDate, amount FROM expense_amount_versions WHERE expenseId = ? ORDER BY effectiveDate",
      expense.id,
    );
    assert.deepEqual(
      versions.map((row) => ({ ...row })),
      [
        { effectiveDate: "1000-01-01", amount: 50000 },
        { effectiveDate: ledgerDomain.dateKey(today), amount: 55000 },
      ],
    );
    if (today.getDate() > 1) {
      const earlierInput = { ...input, chargeDay: today.getDate() - 1 };
      await repository.saveExpense(db, earlierInput);
      const earlierExpense = (await repository.readExpenses(db)).find(
        (entry) => entry.id !== expense.id,
      );
      const earlier = (
        await ledgerRepository.loadLedgerMonth(db, currentMonth)
      ).find((entry) => entry.expenseId === earlierExpense.id);
      await repository.saveExpense(
        db,
        { ...earlierInput, amount: 60000 },
        earlierExpense.id,
      );
      assert.deepEqual(
        (await ledgerRepository.loadLedgerMonth(db, currentMonth)).find(
          (entry) => entry.id === earlier.id,
        ),
        earlier,
      );
    }
  } finally {
    db.sqlite.close();
  }
});

test("scheduled amount histories respect leap-day cutoffs, repeated edits and unvisited months after reconnect", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-amount-history-"));
  const path = join(directory, "amount.db");
  let db = sqliteAdapter(path);
  let year = new Date().getFullYear() + 2;
  while (ledgerDomain.daysInMonth(`${year}-02`) !== 29) year++;
  const january = `${year}-01`,
    february = `${year}-02`,
    march = `${year}-03`,
    april = `${year}-04`;
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const januaryBefore = await ledgerRepository.loadLedgerMonth(db, january);
    const februaryBefore = await ledgerRepository.loadLedgerMonth(db, february);
    await repository.saveExpense(
      db,
      { ...insuranceInput, amount: 55000 },
      expense.id,
      `${year}-02-29`,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, january),
      januaryBefore,
    );
    const februaryAfter = (
      await ledgerRepository.loadLedgerMonth(db, february)
    )[0];
    assert.equal(februaryAfter.id, februaryBefore[0].id);
    assert.equal(februaryAfter.day, 29);
    assert.equal(februaryAfter.amount, 55000);
    await repository.saveExpense(
      db,
      { ...insuranceInput, amount: 60000 },
      expense.id,
      `${year}-04-01`,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, march))[0].amount,
      55000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, april))[0].amount,
      60000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, `${year - 1}-12`))[0].amount,
      50000,
    );
    await repository.saveExpense(
      db,
      { ...insuranceInput, amount: 57000 },
      expense.id,
      `${year}-03-01`,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, february))[0].amount,
      55000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, march))[0].amount,
      57000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, april))[0].amount,
      57000,
    );
    await repository.saveExpense(
      db,
      { ...insuranceInput, amount: 58000 },
      expense.id,
      `${year}-03-01`,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, march))[0].amount,
      58000,
    );
    assert.equal(
      (
        await db.getAllAsync(
          "SELECT id FROM expense_amount_versions WHERE expenseId = ? AND effectiveDate = ?",
          expense.id,
          `${year}-03-01`,
        )
      ).length,
      1,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fixed-variable conversions keep entered actuals including zero and use historical types for earlier months", async () => {
  const db = sqliteAdapter();
  const year = new Date().getFullYear() + 2;
  const before = `${year}-01`,
    enteredMonth = `${year}-02`,
    pendingMonth = `${year}-03`;
  try {
    await repository.initializeDatabase(db);
    const input = {
      ...insuranceInput,
      amountTypeCode: "variable",
      amount: null,
    };
    await repository.saveExpense(db, input);
    const expense = (await repository.readExpenses(db))[0];
    await ledgerRepository.loadLedgerMonth(db, before);
    const entered = (
      await ledgerRepository.loadLedgerMonth(db, enteredMonth)
    )[0];
    await ledgerRepository.saveLedgerAmount(db, entered.id, 0);
    const pending = (
      await ledgerRepository.loadLedgerMonth(db, pendingMonth)
    )[0];
    await repository.saveExpense(
      db,
      insuranceInput,
      expense.id,
      `${year}-02-01`,
    );
    const retained = (
      await ledgerRepository.loadLedgerMonth(db, enteredMonth)
    )[0];
    assert.equal(retained.amount, 0);
    assert.equal(retained.amountEntered, true);
    assert.equal(retained.amountTypeCode, "variable");
    const automatic = (
      await ledgerRepository.loadLedgerMonth(db, pendingMonth)
    )[0];
    assert.equal(automatic.id, pending.id);
    assert.equal(automatic.amount, 50000);
    assert.equal(automatic.amountTypeCode, "fixed");
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, before))[0].amountTypeCode,
      "variable",
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, `${year - 1}-12`))[0].amount,
      null,
    );
    await repository.saveExpense(db, input, expense.id, `${year}-03-31`);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, pendingMonth))[0].amount,
      null,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, pendingMonth))[0]
        .amountTypeCode,
      "variable",
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, enteredMonth))[0].amount,
      0,
    );
  } finally {
    db.sqlite.close();
  }
});

test("invalid dates and failed saves roll back template, history and future ledger together", async () => {
  const db = sqliteAdapter();
  const month = ledgerDomain.moveMonth(ledgerDomain.monthKey(), 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const entries = await ledgerRepository.loadLedgerMonth(db, month);
    const history = await db.getAllAsync(
      "SELECT * FROM expense_amount_versions",
    );
    for (const effectiveDate of [
      "2025-02-29",
      "2026-13-01",
      "2026-02-31",
      "oops",
      "2000-01-01",
    ])
      await assert.rejects(
        repository.saveExpense(
          db,
          { ...insuranceInput, amount: 55000 },
          expense.id,
          effectiveDate,
        ),
      );
    await assert.rejects(
      repository.saveExpense(
        db,
        { ...insuranceInput, amount: 55000, methodId: 999999 },
        expense.id,
      ),
    );
    assert.deepEqual(await repository.readExpenses(db), [expense]);
    assert.deepEqual(
      await ledgerRepository.readLedgerMonth(db, month),
      entries,
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM expense_amount_versions"),
      history,
    );
    for (const invalidDate of [
      "2025-02-29",
      "2026-04-31",
      "2026-00-01",
      "2026-01-00",
    ])
      await assert.rejects(
        db.runAsync(
          "INSERT INTO expense_amount_versions (expenseId,effectiveDate,amountTypeCode,amount) VALUES (?,?,'fixed',1)",
          expense.id,
          invalidDate,
        ),
      );
    assert.equal(ledgerDomain.isValidDateKey("2024-02-29"), true);
    assert.equal(ledgerDomain.isValidDateKey("2025-02-29"), false);
  } finally {
    db.sqlite.close();
  }
});

test("v8 upgrade preserves every monthly record, marks actual zero and retries an atomic history migration", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "관리비",
      amountTypeCode: "variable",
      amount: null,
    });
    const methods = await repository.readMethods(db),
      expenses = await repository.readExpenses(db);
    const entries = await ledgerRepository.loadLedgerMonth(
      db,
      ledgerDomain.monthKey(),
    );
    const manual = entries.find((entry) => entry.amountTypeCode === "variable");
    await ledgerRepository.saveLedgerAmount(db, manual.id, 0);
    const saved = await ledgerRepository.readLedgerMonth(
      db,
      ledgerDomain.monthKey(),
    );
    const columns = Object.keys(saved[0]).filter(
      (column) => column !== "amountEntered",
    );
    await db.execAsync(
      "DROP TABLE ledger_entries; DROP TABLE expense_amount_versions;",
    );
    await db.execAsync(
      ledgerRepository.LEDGER_SCHEMA.replace(
        /amountEntered INTEGER[^\n]+\n/,
        "",
      ),
    );
    for (const entry of saved)
      await db.runAsync(
        `INSERT INTO ledger_entries (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        ...columns.map((column) => entry[column]),
      );
    await db.execAsync("PRAGMA user_version = 8;");
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      if (sql === "PRAGMA user_version = 9;")
        throw new Error("Simulated history migration failure");
      return exec(sql);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated history migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      8,
    );
    assert.equal(
      (await db.getAllAsync("PRAGMA table_info(ledger_entries)")).some(
        (column) => column.name === "amountEntered",
      ),
      false,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name='expense_amount_versions'",
      ),
      undefined,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    assert.deepEqual(
      await ledgerRepository.readLedgerMonth(db, ledgerDomain.monthKey()),
      saved,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.equal(
      (await db.getAllAsync("SELECT * FROM expense_amount_versions")).length,
      expenses.length,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("ledger calendars preserve local dates, leap years and month boundaries", () => {
  assert.equal(ledgerDomain.daysInMonth("2024-02"), 29);
  assert.equal(ledgerDomain.daysInMonth("2025-02"), 28);
  assert.equal(ledgerDomain.moveMonth("2026-12", 1), "2027-01");
  assert.equal(ledgerDomain.moveMonth("2026-01", -1), "2025-12");
  assert.equal(ledgerDomain.monthKey(new Date(2026, 9, 1)), "2026-10");
  assert.deepEqual(
    ledgerDomain.calendarDays("2026-02"),
    Array.from({ length: 28 }, (_, index) => index + 1),
  );
  const leap = ledgerDomain.calendarDays("2024-02");
  assert.equal(leap.length, 35);
  assert.deepEqual(leap.slice(0, 5), [null, null, null, null, 1]);
  assert.deepEqual(
    leap.filter((day) => day !== null),
    Array.from({ length: 29 }, (_, index) => index + 1),
  );
  assert.equal(ledgerDomain.calendarDays("2026-08").length, 42);
  for (const month of [
    "2026-00",
    "2026-13",
    "2026-2",
    "0999-01",
    "2026-02-01",
    "oops",
  ])
    assert.throws(() => ledgerDomain.calendarDays(month));
});

test("ledger totals exclude pending amounts and distinguish an entered zero", () => {
  const entries = [
    { day: 2, amount: 10000 },
    { day: 2, amount: null },
    { day: 2, amount: 0 },
    { day: 8, amount: 123456 },
  ];
  assert.deepEqual(ledgerDomain.ledgerSummary(entries), {
    total: 133456,
    pending: 1,
    count: 4,
  });
  assert.deepEqual(ledgerDomain.dailyLedger(entries).get(2), {
    total: 10000,
    pending: 1,
    count: 3,
  });
  assert.equal(ledgerDomain.dailyLedger(entries).get(3), undefined);
  assert.equal(ledgerDomain.parseLedgerAmount("0"), 0);
  assert.equal(ledgerDomain.parseLedgerAmount("123,456"), 123456);
  assert.equal(ledgerDomain.parseLedgerAmount("999,999,999"), 999999999);
  for (const value of ["", "-1", "1.2", "1000000000", "1e3"])
    assert.equal(ledgerDomain.parseLedgerAmount(value), null);
});

test("monthly ledger snapshots are idempotent and actual amounts survive reconnects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-ledger-"));
  const path = join(directory, "ledger.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    await repository.saveMethod(db, {
      kind: "card",
      providerCode: "card_kb",
      name: "생활 카드",
      bankId: bank.id,
      settlementDay: null,
      cardTypeCode: "debit",
    });
    const card = (await repository.readMethods(db)).find(
      (method) => method.kind === "card",
    );
    const fixed = {
      name: "월 지출",
      amountTypeCode: "fixed",
      amount: 10000,
      chargeDay: 31,
      methodId: card.id,
      categoryCode: "subscription",
    };
    const variable = {
      ...fixed,
      amountTypeCode: "variable",
      amount: null,
      methodId: bank.id,
      categoryCode: "living",
    };
    await repository.saveExpense(db, fixed);
    await repository.saveExpense(db, variable);
    const february = await ledgerRepository.loadLedgerMonth(db, "2025-02");
    assert.equal(february.length, 2); // Same name, distinct expense IDs.
    assert.ok(february.every((entry) => entry.day === 28));
    const automatic = february.find(
      (entry) => entry.amountTypeCode === "fixed",
    );
    const manual = february.find(
      (entry) => entry.amountTypeCode === "variable",
    );
    assert.equal(automatic.amount, 10000);
    assert.equal(automatic.cardTypeCode, "debit");
    assert.equal(automatic.providerName, "KB국민카드");
    assert.equal(manual.amount, null);
    await ledgerRepository.saveLedgerAmount(db, manual.id, 123456);
    const saved = await ledgerRepository.loadLedgerMonth(db, "2025-02");
    assert.deepEqual(ledgerDomain.ledgerSummary(saved), {
      total: 133456,
      pending: 0,
      count: 2,
    });
    assert.deepEqual(
      saved.map((entry) => entry.id),
      february.map((entry) => entry.id),
    );
    const march = await ledgerRepository.loadLedgerMonth(db, "2025-03");
    assert.ok(march.every((entry) => entry.day === 31));
    assert.equal(
      march.find((entry) => entry.amountTypeCode === "variable").amount,
      null,
    );
    assert.ok(
      march.every((entry) => !february.some((old) => old.id === entry.id)),
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, "2025-02"),
      saved,
    );
    await ledgerRepository.saveLedgerAmount(db, manual.id, 0);
    assert.deepEqual(
      ledgerDomain.ledgerSummary(
        await ledgerRepository.readLedgerMonth(db, "2025-02"),
      ),
      {
        total: 10000,
        pending: 0,
        count: 2,
      },
    );
    await ledgerRepository.saveLedgerAmount(db, manual.id, null);
    assert.equal(
      ledgerDomain.ledgerSummary(
        await ledgerRepository.readLedgerMonth(db, "2025-02"),
      ).pending,
      1,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("template edits and deletions preserve monthly names, amounts and payment snapshots", async () => {
  const db = sqliteAdapter();
  const pastMonth = ledgerDomain.moveMonth(ledgerDomain.monthKey(), -1);
  const futureMonth = ledgerDomain.moveMonth(ledgerDomain.monthKey(), 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, {
      kind: "card",
      providerCode: "card_kb",
      name: "처음 카드",
      bankId: null,
      settlementDay: 10,
      cardTypeCode: "credit",
    });
    const card = (await repository.readMethods(db))[0];
    const input = {
      name: "처음 구독",
      amountTypeCode: "fixed",
      amount: 15000,
      chargeDay: 9,
      methodId: card.id,
      categoryCode: "subscription",
    };
    await repository.saveExpense(db, input);
    const expense = (await repository.readExpenses(db))[0];
    const before = await ledgerRepository.loadLedgerMonth(db, pastMonth);
    await repository.saveExpense(
      db,
      {
        ...input,
        name: "변경 구독",
        amount: 20000,
        chargeDay: 15,
      },
      expense.id,
    );
    await repository.saveMethod(
      db,
      {
        kind: "card",
        providerCode: "card_shinhan",
        name: "변경 카드",
        bankId: null,
        settlementDay: null,
        cardTypeCode: "debit",
      },
      card.id,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, pastMonth),
      before,
    );
    const next = (await ledgerRepository.loadLedgerMonth(db, futureMonth))[0];
    assert.equal(next.name, "변경 구독");
    assert.equal(next.amount, 20000);
    assert.equal(next.day, 15);
    assert.equal(next.cardTypeCode, "debit");
    assert.equal(next.methodName, "변경 카드");
    await repository.saveExpense(db, {
      ...input,
      name: "새 구독",
      methodId: null,
    });
    const augmented = await ledgerRepository.loadLedgerMonth(db, pastMonth);
    assert.equal(augmented.length, 2);
    assert.deepEqual(
      augmented.find((entry) => entry.id === before[0].id),
      before[0],
    );
    await repository.deleteMethod(db, card.id);
    await repository.deleteExpense(db, expense.id);
    const retained = await ledgerRepository.loadLedgerMonth(db, pastMonth);
    assert.equal(retained.length, 2);
    const history = retained.find((entry) => entry.id === before[0].id);
    assert.deepEqual({ ...history }, { ...before[0], expenseId: null });
    assert.equal(history.providerCode, "card_kb");
    assert.equal(history.cardTypeCode, "credit");
    await repository.saveExpense(db, { ...input, methodId: null });
    const newExpense = (await repository.readExpenses(db)).find(
      (entry) => entry.name === input.name,
    );
    assert.notEqual(newExpense.id, expense.id);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, pastMonth)).length,
      3,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("ledger rejects invalid amounts, choice codes and fixed-entry edits", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    for (const amountTypeCode of ["fixed", "variable"])
      await repository.saveExpense(db, {
        name: amountTypeCode,
        amountTypeCode,
        amount: amountTypeCode === "fixed" ? 5000 : null,
        chargeDay: 1,
        methodId: null,
        categoryCode: null,
      });
    const entries = await ledgerRepository.loadLedgerMonth(db, "2026-10");
    const fixed = entries.find((entry) => entry.amountTypeCode === "fixed");
    const variable = entries.find(
      (entry) => entry.amountTypeCode === "variable",
    );
    await assert.rejects(ledgerRepository.saveLedgerAmount(db, fixed.id, 1000));
    await assert.rejects(ledgerRepository.saveLedgerAmount(db, 999999, 1000));
    await assert.rejects(ledgerRepository.saveLedgerAmount(db, -1, 1000));
    for (const amount of [-1, 0.5, NaN, Infinity, 1000000000])
      await assert.rejects(
        ledgerRepository.saveLedgerAmount(db, variable.id, amount),
      );
    for (const clause of [
      "month = '2026-13'",
      "day = 0",
      "amount = -1",
      "amount = 0.5",
      "amountTypeCode = 'estimate'",
      "categoryCode = 'other'",
      "methodKind = 'cash'",
      "cardTypeCode = 'debit'",
    ])
      await assert.rejects(
        db.runAsync(
          `UPDATE ledger_entries SET ${clause} WHERE id = ?`,
          variable.id,
        ),
      );
    await assert.rejects(
      db.runAsync(
        "UPDATE ledger_entries SET amount = NULL WHERE id = ?",
        fixed.id,
      ),
    );
    await assert.rejects(ledgerRepository.loadLedgerMonth(db, "2026-13"));
    assert.equal(
      (await ledgerRepository.readLedgerMonth(db, "2026-10")).length,
      2,
    );
  } finally {
    db.sqlite.close();
  }
});

test("v7 ledger migration rolls back failures and preserves existing records and links", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    await repository.saveExpense(db, {
      name: "기존 관리비",
      amountTypeCode: "variable",
      amount: null,
      chargeDay: 31,
      methodId: bank.id,
      categoryCode: "living",
    });
    const expenses = await repository.readExpenses(db);
    const methods = await repository.readMethods(db);
    await db.execAsync("DROP TABLE ledger_entries; PRAGMA user_version = 7;");
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      if (sql === "PRAGMA user_version = 8;")
        throw new Error("Simulated ledger migration failure");
      return exec(sql);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated ledger migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      7,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'ledger_entries'",
      ),
      undefined,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(await repository.readMethods(db), methods);
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(await repository.readMethods(db), methods);
    const monthly = await ledgerRepository.loadLedgerMonth(db, "2024-02");
    assert.equal(monthly[0].day, 29);
    assert.equal(monthly[0].amount, null);
    assert.equal(monthly[0].expenseId, expenses[0].id);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("payment method summaries include linked cards once and exclude variable or unassigned expenses", () => {
  const bank = { id: 1, kind: "bank" };
  const secondBank = { id: 2, kind: "bank" };
  const card = { id: 3, kind: "card", bankId: 1 };
  const unlinkedCard = { id: 4, kind: "card", bankId: null };
  const methods = [bank, secondBank, card, unlinkedCard];
  const expenses = [
    { id: 10, methodId: 1, amount: 100000 },
    { id: 11, methodId: 2, amount: 300000 },
    { id: 12, methodId: 3, amount: 20000 },
    { id: 13, methodId: 4, amount: 40000 },
    { id: 14, methodId: 1, amount: null },
    { id: 15, methodId: null, amount: 50000 },
  ];
  assert.equal(
    domain.paymentMethodsTotal([bank, secondBank], methods, expenses),
    420000,
  );
  assert.equal(
    domain.paymentMethodsTotal([card, unlinkedCard], methods, expenses),
    60000,
  );
  assert.equal(
    domain.paymentMethodsTotal([bank, card], methods, expenses),
    120000,
  );
  assert.equal(domain.paymentMethodsTotal(methods, methods, expenses), 460000);
  assert.equal(domain.paymentMethodsTotal([], methods, expenses), 0);
});

test("institution sorting groups providers before nicknames and uses Korean brand names", () => {
  const methods = [
    { id: 5, providerCode: "bank_nh", name: "가", sortOrder: 0 },
    { id: 4, providerCode: "bank_kb", name: "나", sortOrder: 1 },
    { id: 3, providerCode: "bank_woori", name: "가", sortOrder: 2 },
    { id: 2, providerCode: "bank_ibk", name: "가", sortOrder: 3 },
    { id: 1, providerCode: "bank_kb", name: "가", sortOrder: 4 },
    { id: 6, providerCode: "bank_sc", name: "가", sortOrder: 5 },
  ];
  const original = structuredClone(methods);
  assert.deepEqual(
    domain
      .sortPaymentMethods(methods, "provider", methods, [])
      .map((m) => m.id),
    [1, 4, 2, 5, 3, 6],
  );
  assert.deepEqual(methods, original);
  const cards = [
    { id: 10, providerCode: "card_shinhan", name: "가" },
    { id: 11, providerCode: "card_bc", name: "가" },
    { id: 12, providerCode: "card_kb", name: "나" },
    { id: 13, providerCode: "card_kb", name: "가" },
    { id: 14, providerCode: "card_nh", name: "가" },
  ];
  assert.deepEqual(
    domain.sortPaymentMethods(cards, "provider", cards, []).map((m) => m.id),
    [13, 12, 14, 11, 10],
  );
  const legacy = [
    { id: 20, providerCode: null, provider: "하나은행", name: "가" },
    { id: 21, providerCode: null, provider: "지역은행", name: "가" },
  ];
  assert.deepEqual(
    domain.sortPaymentMethods(legacy, "provider", legacy, []).map((m) => m.id),
    [21, 20],
  );
});

test("registration and custom method sorting remain independent with duplicate names", () => {
  const methods = [
    { id: 3, providerCode: "bank_woori", name: "통장", sortOrder: 1 },
    { id: 2, providerCode: "bank_woori", name: "통장", sortOrder: 0 },
    { id: 1, providerCode: "bank_woori", name: "통장", sortOrder: 2 },
  ];
  for (const order of ["registered", "provider", "amount"])
    assert.deepEqual(
      domain.sortPaymentMethods(methods, order, methods, []).map((m) => m.id),
      [1, 2, 3],
    );
  assert.deepEqual(
    domain.sortPaymentMethods(methods, "custom", methods, []).map((m) => m.id),
    [2, 3, 1],
  );
  for (const order of ["provider", "registered", "amount", "custom"])
    assert.deepEqual(domain.sortPaymentMethods([], order, [], []), []);
});

test("method fixed-expense sorting includes linked cards and handles zero totals and ties", () => {
  const methods = [
    { id: 1, kind: "bank", providerCode: "bank_kb", name: "가" },
    { id: 2, kind: "bank", providerCode: "bank_woori", name: "가" },
    { id: 3, kind: "bank", providerCode: "bank_shinhan", name: "가" },
    { id: 4, kind: "bank", providerCode: "bank_woori", name: "나" },
    {
      id: 5,
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_shinhan",
      name: "가",
      bankId: 2,
    },
    { id: 6, kind: "card", providerCode: "card_kb", name: "가", bankId: null },
  ];
  const expenses = [
    { id: 10, methodId: 1, amount: 30000 },
    { id: 11, methodId: 2, amount: 10000 },
    { id: 12, methodId: 5, amount: 50000 },
    { id: 13, methodId: 6, amount: 30000 },
    { id: 14, methodId: 3, amount: null },
    { id: 15, methodId: null, amount: 999999 },
  ];
  assert.deepEqual(
    domain
      .sortPaymentMethods(
        methods.filter((m) => m.kind === "bank"),
        "amount",
        methods,
        expenses,
      )
      .map((m) => m.id),
    [2, 1, 3, 4],
  );
  assert.deepEqual(
    domain
      .sortPaymentMethods(
        methods.filter((m) => m.kind === "card"),
        "amount",
        methods,
        expenses,
      )
      .map((m) => m.id),
    [5, 6],
  );
  expenses.find((e) => e.methodId === 5).amount = 30000;
  assert.deepEqual(
    domain
      .sortPaymentMethods(
        methods.filter((m) => m.kind === "card"),
        "amount",
        methods,
        expenses,
      )
      .map((m) => m.id),
    [6, 5],
  );
});

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

test("amount masking supports typing, editing and pasting while preserving the saved number", async () => {
  const cases = [
    ["", "1", "1"],
    ["999", "9999", "9,999"],
    ["1,000", "1,0000", "10,000"],
    ["17,000", "17,00", "1,700"],
    ["12,345", "12345", "1,345"],
    ["1,234,567", "1,234567", "123,567"],
    ["17,000", "", ""],
    ["", "00017000", "17,000"],
    ["", " 999,999,999 ", "999,999,999"],
    ["17,000", "-500", "17,000"],
    ["17,000", "1.5", "17,000"],
    ["17,000", "abc", "17,000"],
  ];
  for (const [previous, input, expected] of cases)
    assert.equal(domain.formatAmountInput(input, previous), expected);
  assert.equal(
    domain.parseAmount(domain.formatAmountInput("1000000000")),
    null,
  );

  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const display = domain.formatAmountInput("175000");
    await repository.saveExpense(db, {
      name: "통신비",
      amountTypeCode: "fixed",
      amount: domain.parseAmount(display),
      chargeDay: 15,
      methodId: null,
    });
    const saved = (await repository.readExpenses(db))[0];
    assert.equal(saved.amount, 175000);
    assert.equal(typeof saved.amount, "number");
    assert.equal(domain.formatAmountInput(String(saved.amount)), "175,000");
  } finally {
    db.sqlite.close();
  }
});

test("expense display orders larger amounts first, Korean names on ties and variable items last", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    for (const [name, amount, chargeDay] of [
      ["통신비", 50000, 1],
      ["월세", 750000, 20],
      ["구독료", 50000, 25],
      ["가스요금", null, 30],
      ["관리비", null, 2],
      ["인터넷", 30000, 3],
    ]) {
      await repository.saveExpense(db, {
        name,
        amount,
        chargeDay,
        methodId: null,
        amountTypeCode: amount === null ? "variable" : "fixed",
      });
    }
    const original = await repository.readExpenses(db);
    const snapshot = original.map((item) => ({ ...item }));
    const sorted = domain.sortExpensesByAmount(original);
    assert.deepEqual(
      sorted.map((item) => item.name),
      ["월세", "구독료", "통신비", "인터넷", "가스요금", "관리비"],
    );
    assert.deepEqual(
      original.map((item) => ({ ...item })),
      snapshot,
    );
    assert.deepEqual(await repository.readExpenses(db), original);
    const telecom = original.find((item) => item.name === "통신비");
    await repository.saveExpense(
      db,
      {
        name: telecom.name,
        amountTypeCode: "fixed",
        amount: 800000,
        chargeDay: telecom.chargeDay,
        methodId: null,
      },
      telecom.id,
    );
    assert.equal(
      domain.sortExpensesByAmount(await repository.readExpenses(db))[0].id,
      telecom.id,
    );
    assert.deepEqual(domain.sortExpensesByAmount([]), []);
  } finally {
    db.sqlite.close();
  }
});

test("payment method choices group banks before cards while preserving each saved drag order", () => {
  const methods = [
    { id: 4, kind: "card", sortOrder: 0 },
    { id: 3, kind: "bank", sortOrder: 0 },
    { id: 2, kind: "card", sortOrder: 1 },
    { id: 1, kind: "bank", sortOrder: 1 },
  ];
  const snapshot = structuredClone(methods);
  assert.deepEqual(
    domain.paymentMethodsByKind(methods).map((method) => method.id),
    [3, 1, 4, 2],
  );
  assert.deepEqual(methods, snapshot);
  assert.deepEqual(domain.paymentMethodsByKind([]), []);
});

test("CRUD keeps bank/card links and counts each expense once in the total", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    await repository.saveMethod(db, {
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_samsung",
      name: "생활비 카드",
      bankId: bank.id,
      settlementDay: 25,
    });
    const card = (await repository.readMethods(db))[0];
    await repository.saveExpense(db, {
      name: "월세",
      amountTypeCode: "fixed",
      amount: 750000,
      chargeDay: 1,
      methodId: bank.id,
    });
    await repository.saveExpense(db, {
      name: "넷플릭스",
      amountTypeCode: "fixed",
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
        amountTypeCode: "fixed",
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
      amountTypeCode: "fixed",
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
        amountTypeCode: "fixed",
        amount: 500,
        chargeDay: 32,
        methodId: null,
      }),
    );
    await assert.rejects(
      repository.saveMethod(db, {
        kind: "card",
        cardTypeCode: "credit",
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
    assert.deepEqual(
      await repository.readExpenses(db),
      withFixedType(originalExpenses),
    );
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
      9,
    );

    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(
      await repository.readExpenses(db),
      withFixedType(originalExpenses),
    );

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
      9,
    );
    assert.deepEqual(
      await repository.readExpenses(db),
      withFixedType(originalExpenses),
    );
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
          cardTypeCode: "credit",
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
        cardTypeCode: "credit",
        providerCode: "card_samsung",
        name,
        bankId: a,
        settlementDay: 25,
      });
    const [x, y] = await idsOf("card");
    await repository.saveExpense(db, {
      name: "구독",
      amountTypeCode: "fixed",
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
      cardTypeCode: "credit",
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

const V3_SCHEMA = `${V2_SCHEMA}
  ALTER TABLE payment_methods ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0);
  CREATE INDEX methods_order_idx ON payment_methods(kind, sortOrder, id);
  PRAGMA user_version = 3;
`;

const V4_SCHEMA = `${V3_SCHEMA}
  DROP TABLE expenses;
  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    amountTypeCode TEXT NOT NULL CHECK (amountTypeCode IN ('fixed', 'variable')),
    amount INTEGER,
    chargeDay INTEGER NOT NULL CHECK (chargeDay BETWEEN 1 AND 31),
    methodId INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    CHECK ((amountTypeCode = 'fixed' AND amount IS NOT NULL AND typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999)
      OR (amountTypeCode = 'variable' AND amount IS NULL))
  );
  CREATE INDEX expenses_method_idx ON expenses(methodId);
  PRAGMA user_version = 4;
`;

test("card types persist and credit/debit conversion preserves links, totals and custom order", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-card-types-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    const creditInput = {
      kind: "card",
      providerCode: "card_samsung",
      cardTypeCode: "credit",
      name: "생활비 신용",
      bankId: bank.id,
      settlementDay: 25,
    };
    await repository.saveMethod(db, creditInput);
    const credit = (await repository.readMethods(db)).find(
      (m) => m.kind === "card",
    );
    await repository.saveMethod(db, {
      ...creditInput,
      name: "생활비 체크",
      cardTypeCode: "debit",
      settlementDay: null,
    });
    const debit = (await repository.readMethods(db)).find(
      (m) => m.cardTypeCode === "debit",
    );
    await repository.reorderMethods(db, "card", [debit.id, credit.id]);
    await repository.saveExpense(db, {
      name: "구독",
      amountTypeCode: "fixed",
      categoryCode: "subscription",
      amount: 17000,
      chargeDay: 15,
      methodId: credit.id,
    });
    const expenses = await repository.readExpenses(db);
    assert.equal(domain.cardTypeLabel(credit), "신용카드");
    assert.equal(domain.cardTypeLabel(debit), "체크카드");
    assert.equal(domain.cardTypeLabel({ cardTypeCode: null }), "종류 미지정");
    assert.equal(
      domain.cardWithdrawalLabel(credit, bank),
      "급여 통장 · 25일 출금",
    );
    assert.equal(domain.cardWithdrawalLabel(debit, bank), "급여 통장");
    assert.equal(domain.cardWithdrawalLabel(debit), "연결 통장 미지정");
    await repository.saveMethod(
      db,
      {
        ...creditInput,
        cardTypeCode: "debit",
        settlementDay: null,
      },
      credit.id,
    );
    let methods = await repository.readMethods(db);
    assert.equal(methods.find((m) => m.id === credit.id).cardTypeCode, "debit");
    assert.equal(methods.find((m) => m.id === credit.id).settlementDay, null);
    assert.equal(methods.find((m) => m.id === credit.id).bankId, bank.id);
    assert.deepEqual(
      methods.filter((m) => m.kind === "card").map((m) => m.id),
      [debit.id, credit.id],
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.equal(domain.paymentMethodsTotal([bank], methods, expenses), 17000);
    await repository.saveMethod(
      db,
      { ...creditInput, settlementDay: 31 },
      credit.id,
    );
    methods = await repository.readMethods(db);
    assert.equal(
      methods.find((m) => m.id === credit.id).cardTypeCode,
      "credit",
    );
    assert.equal(methods.find((m) => m.id === credit.id).settlementDay, 31);
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await repository.readExpenses(db), expenses);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("card type codes and incompatible settlement dates are validated in repository and SQLite", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const before = await repository.readMethods(db);
    const cardInput = {
      kind: "card",
      providerCode: "card_samsung",
      name: "카드",
      bankId: before[0].id,
      settlementDay: null,
    };
    for (const cardTypeCode of [
      null,
      undefined,
      "",
      "check",
      "unknown",
      "CREDIT",
    ])
      await assert.rejects(
        repository.saveMethod(db, { ...cardInput, cardTypeCode }),
        /신용카드 또는 체크카드/,
      );
    await assert.rejects(
      repository.saveMethod(db, { ...bankInput, cardTypeCode: "credit" }),
      /통장에는 카드 종류/,
    );
    await assert.rejects(
      repository.saveMethod(db, {
        ...cardInput,
        cardTypeCode: "debit",
        settlementDay: 25,
      }),
      /체크카드에는 대금 출금일/,
    );
    for (const [kind, provider, type, day] of [
      ["bank", "bank_kb", "credit", null],
      ["card", "card_samsung", "check", null],
      ["card", "card_samsung", "debit", 25],
    ])
      await assert.rejects(
        db.runAsync(
          "INSERT INTO payment_methods (kind, providerCode, name, cardTypeCode, settlementDay) VALUES (?, ?, '잘못된 카드', ?, ?)",
          kind,
          provider,
          type,
          day,
        ),
      );
    assert.deepEqual(await repository.readMethods(db), before);
    await repository.saveMethod(db, { ...cardInput, cardTypeCode: "debit" });
    const debit = (await repository.readMethods(db)).find(
      (m) => m.kind === "card",
    );
    await assert.rejects(
      db.runAsync(
        "UPDATE payment_methods SET settlementDay = 25 WHERE id = ?",
        debit.id,
      ),
    );
    assert.equal(
      (await repository.readMethods(db)).find((m) => m.id === debit.id)
        .settlementDay,
      null,
    );
  } finally {
    db.sqlite.close();
  }
});

test("v6 card type migration keeps legacy cards unknown and preserves links, order and deleted IDs; failure rolls back", async () => {
  const db = sqliteAdapter();
  try {
    await db.execAsync(`${V4_SCHEMA}
      ALTER TABLE expenses ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE expenses ADD COLUMN categoryCode TEXT;
      CREATE INDEX expenses_order_idx ON expenses(sortOrder, id);
      PRAGMA user_version = 6;
      INSERT INTO payment_providers (code, kind, name) VALUES
        ('bank_kb', 'bank', 'KB국민은행'), ('card_samsung', 'card', '삼성카드');
      INSERT INTO payment_methods (id, kind, providerCode, name, bankId, settlementDay, sortOrder) VALUES
        (1, 'bank', 'bank_kb', '급여', NULL, NULL, 0),
        (2, 'card', 'card_samsung', '체크라는 이름', 1, 25, 1),
        (5, 'card', 'card_samsung', '신용이라는 이름', 1, NULL, 0),
        (90, 'bank', 'bank_kb', '삭제한 통장', NULL, NULL, 1);
      DELETE FROM payment_methods WHERE id = 90;
      INSERT INTO expenses (id, name, amountTypeCode, amount, chargeDay, methodId, sortOrder, categoryCode) VALUES
        (10, '구독', 'fixed', 17000, 15, 2, 0, 'subscription');
    `);
    const methods = await readPreCardTypeMethods(db);
    const expenses = await repository.readExpenses(db);
    const rawMethods = await db.getAllAsync(
      "SELECT * FROM payment_methods ORDER BY id",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      if (sql === "PRAGMA user_version = 7;")
        throw new Error("Simulated card type migration failure");
      return exec(sql);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated card type migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      6,
    );
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(payment_methods)")).some(
        (column) => column.name === "cardTypeCode",
      ),
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM payment_methods ORDER BY id"),
      rawMethods,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
    await assert.rejects(
      repository.saveMethod(
        db,
        {
          kind: "card",
          providerCode: "card_samsung",
          name: "수정",
          bankId: 1,
          settlementDay: 25,
          cardTypeCode: null,
        },
        2,
      ),
      /신용카드 또는 체크카드/,
    );
    await repository.saveMethod(db, { ...bankInput, name: "새 통장" });
    assert.equal(
      (await repository.readMethods(db)).find((m) => m.name === "새 통장").id,
      91,
    );
  } finally {
    db.sqlite.close();
  }
});

test("expense custom order persists independently of charge day and registration, including duplicate names", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-expense-order-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const base = {
      name: "구독",
      amountTypeCode: "fixed",
      amount: 17000,
      methodId: 1,
    };
    await repository.saveExpense(db, { ...base, chargeDay: 20 });
    await repository.saveExpense(db, { ...base, chargeDay: 1 });
    await repository.saveExpense(db, {
      ...base,
      name: "관리비",
      amountTypeCode: "variable",
      amount: null,
      chargeDay: 25,
    });
    const idsOf = async (order) =>
      domain
        .sortExpenses(await repository.readExpenses(db), order)
        .map((e) => e.id);
    const [a, b, c] = await idsOf("registered");
    assert.deepEqual(await idsOf("charge_day"), [b, a, c]);
    assert.deepEqual(await idsOf("custom"), [a, b, c]);
    assert.deepEqual(await idsOf("amount"), [a, b, c]);
    await repository.reorderExpenses(db, [c, b, a]);
    assert.deepEqual(await idsOf("charge_day"), [b, a, c]);
    assert.deepEqual(await idsOf("custom"), [c, b, a]);
    assert.deepEqual(await idsOf("registered"), [a, b, c]);
    assert.deepEqual(await idsOf("amount"), [a, b, c]);
    const snapshot = await repository.readExpenses(db);
    for (const invalid of [
      [a, b],
      [a, a, c],
      [a, b, 999],
    ]) {
      await assert.rejects(repository.reorderExpenses(db, invalid));
      assert.deepEqual(await repository.readExpenses(db), snapshot);
    }
    const run = db.runAsync;
    let writes = 0;
    db.runAsync = async (sql, ...params) => {
      if (sql.startsWith("UPDATE expenses SET sortOrder") && ++writes === 2)
        throw new Error("Simulated expense order save failure");
      return run(sql, ...params);
    };
    await assert.rejects(
      repository.reorderExpenses(db, [a, b, c]),
      /Simulated expense order save failure/,
    );
    assert.deepEqual(await repository.readExpenses(db), snapshot);
    db.runAsync = run;
    await repository.saveExpense(
      db,
      { ...base, chargeDay: 1, name: "수정된 구독", amount: 15000 },
      a,
    );
    assert.deepEqual(await idsOf("custom"), [c, b, a]);
    assert.deepEqual(await idsOf("charge_day"), [b, a, c]);
    await repository.saveExpense(db, {
      ...base,
      chargeDay: 10,
      name: "새 구독",
    });
    const next = (await repository.readExpenses(db)).find(
      (e) => e.name === "새 구독",
    );
    assert.deepEqual(await idsOf("custom"), [c, b, a, next.id]);
    assert.deepEqual(await idsOf("charge_day"), [b, a, next.id, c]);
    assert.deepEqual(await idsOf("registered"), [a, b, c, next.id]);
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await idsOf("custom"), [c, b, a, next.id]);
    assert.deepEqual(await idsOf("charge_day"), [b, a, next.id, c]);
    assert.deepEqual(await idsOf("registered"), [a, b, c, next.id]);
    assert.ok(
      (await repository.readExpenses(db)).every((e) => e.methodId === 1),
    );
    assert.equal(
      (await repository.readExpenses(db)).find((e) => e.id === c).amount,
      null,
    );
    await repository.deleteExpense(db, b);
    assert.deepEqual(await idsOf("custom"), [c, a, next.id]);
    assert.deepEqual(await idsOf("registered"), [a, c, next.id]);
    assert.deepEqual(await idsOf("charge_day"), [a, next.id, c]);
    assert.deepEqual(domain.sortExpenses([], "charge_day"), []);
    assert.deepEqual(domain.sortExpenses([], "registered"), []);
    assert.deepEqual(domain.sortExpenses([], "custom"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("v4 order upgrade preserves types, amounts and links; partial migration rolls back and retries", async () => {
  const db = sqliteAdapter();
  try {
    await db.execAsync(V4_SCHEMA);
    await db.execAsync(`
      INSERT INTO payment_providers (code, kind, name) VALUES ('bank_kb', 'bank', 'KB국민은행');
      INSERT INTO payment_methods (id, kind, providerCode, name) VALUES (1, 'bank', 'bank_kb', '급여 통장');
      INSERT INTO expenses (id, name, amountTypeCode, amount, chargeDay, methodId) VALUES
        (5, '구독', 'fixed', 17000, 20, 1), (20, '관리비', 'variable', NULL, 1, 1), (90, '삭제한 항목', 'fixed', 1000, 5, NULL);
      DELETE FROM expenses WHERE id = 90;
    `);
    const before = await repository.readExpenses(db);
    const methods = await readPreCardTypeMethods(db);
    const run = db.runAsync;
    let writes = 0;
    db.runAsync = async (sql, ...params) => {
      if (sql.startsWith("UPDATE expenses SET sortOrder") && ++writes === 2)
        throw new Error("Simulated expense order migration failure");
      return run(sql, ...params);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated expense order migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      4,
    );
    assert.deepEqual(await repository.readExpenses(db), before);
    assert.equal(
      (await db.getAllAsync("PRAGMA table_info(expenses)")).some(
        (c) => c.name === "sortOrder",
      ),
      false,
    );
    db.runAsync = run;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    const expenses = await repository.readExpenses(db);
    assert.deepEqual(
      expenses.map(({ sortOrder, categoryCode, ...expense }) => expense),
      before.map((expense) => ({ ...expense })),
    );
    assert.deepEqual(
      domain.sortExpenses(expenses, "custom").map((e) => e.id),
      [5, 20],
    );
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readExpenses(db), expenses);
    await repository.saveExpense(db, {
      name: "전기요금",
      amountTypeCode: "variable",
      amount: null,
      chargeDay: 25,
      methodId: 1,
    });
    const next = (await repository.readExpenses(db)).find(
      (e) => e.name === "전기요금",
    );
    assert.equal(next.id, 91);
    assert.equal(next.sortOrder, 2);
    assert.deepEqual(
      domain
        .sortExpenses(await repository.readExpenses(db), "registered")
        .map((e) => e.id),
      [5, 20, 91],
    );
  } finally {
    db.sqlite.close();
  }
});

test("categories persist, filter totals, validate codes and preserve hidden rows during drag", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-categories-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const base = {
      name: "구독",
      amountTypeCode: "fixed",
      amount: 17000,
      chargeDay: 5,
      methodId: 1,
    };
    await repository.saveExpense(db, {
      ...base,
      name: "월세",
      amount: 750000,
      categoryCode: "living",
    });
    await repository.saveExpense(db, { ...base, categoryCode: "subscription" });
    await repository.saveExpense(db, {
      ...base,
      name: "관리비",
      amountTypeCode: "variable",
      amount: null,
      categoryCode: "living",
    });
    await repository.saveExpense(db, {
      ...base,
      name: "이전 항목",
      categoryCode: null,
    });
    let all = domain.sortExpenses(await repository.readExpenses(db), "custom");
    const [rent, subscription, variable, legacy] = all;
    assert.equal(domain.filterExpenses(all, "all").length, 4);
    const living = domain.filterExpenses(all, "living");
    assert.deepEqual(
      living.map((e) => e.id),
      [rent.id, variable.id],
    );
    assert.equal(domain.monthlyTotal(living), 750000);
    assert.equal(
      domain.monthlyTotal(domain.filterExpenses(all, "subscription")),
      17000,
    );
    const snapshot = all.map((e) =>
      Object.assign(Object.create(Object.getPrototypeOf(e)), e),
    );
    const merged = domain.mergeExpenseOrder(all, [variable, rent]);
    assert.deepEqual(all, snapshot);
    assert.deepEqual(
      merged.map((e) => e.id),
      [variable.id, subscription.id, rent.id, legacy.id],
    );
    await repository.reorderExpenses(
      db,
      merged.map((e) => e.id),
    );
    await repository.saveExpense(
      db,
      {
        ...base,
        name: "분류 수정",
        amount: 750000,
        categoryCode: "subscription",
      },
      rent.id,
    );
    all = domain.sortExpenses(await repository.readExpenses(db), "custom");
    assert.deepEqual(
      all.map((e) => e.id),
      merged.map((e) => e.id),
    );
    assert.deepEqual(
      domain.filterExpenses(all, "living").map((e) => e.id),
      [variable.id],
    );
    assert.equal(
      domain.monthlyTotal(domain.filterExpenses(all, "subscription")),
      767000,
    );
    await assert.rejects(
      repository.saveExpense(db, { ...base, categoryCode: "unknown" }, rent.id),
    );
    await assert.rejects(
      db.runAsync(
        "UPDATE expenses SET categoryCode = 'unknown' WHERE id = ?",
        rent.id,
      ),
    );
    assert.deepEqual(
      domain.sortExpenses(await repository.readExpenses(db), "custom"),
      all,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      domain.sortExpenses(await repository.readExpenses(db), "custom"),
      all,
    );
    assert.ok(
      (await repository.readExpenses(db)).every((e) => e.methodId === 1),
    );
    assert.deepEqual(domain.mergeExpenseOrder(all, []), all);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("v5 category migration preserves IDs, amounts, links, custom order and deleted sequence; failure rolls back", async () => {
  const db = sqliteAdapter();
  try {
    await db.execAsync(`${V4_SCHEMA}
      ALTER TABLE expenses ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0 CHECK (sortOrder >= 0);
      CREATE INDEX expenses_order_idx ON expenses(sortOrder, id);
      PRAGMA user_version = 5;
      INSERT INTO payment_providers (code, kind, name) VALUES ('bank_kb', 'bank', 'KB국민은행');
      INSERT INTO payment_methods (id, kind, providerCode, name) VALUES (1, 'bank', 'bank_kb', '급여 통장');
      INSERT INTO expenses (id, name, amountTypeCode, amount, chargeDay, methodId, sortOrder) VALUES
        (5, '월세', 'fixed', 750000, 5, 1, 1), (20, '관리비', 'variable', NULL, 25, 1, 0), (90, '삭제', 'fixed', 1, 1, NULL, 2);
      DELETE FROM expenses WHERE id = 90;`);
    const before = await repository.readExpenses(db);
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      if (sql === "PRAGMA user_version = 6;")
        throw new Error("Simulated category migration failure");
      return exec(sql);
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated category migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      5,
    );
    assert.deepEqual(await repository.readExpenses(db), before);
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(expenses)")).some(
        (column) => column.name === "categoryCode",
      ),
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    assert.deepEqual(
      await repository.readExpenses(db),
      before.map((e) =>
        Object.assign(Object.create(Object.getPrototypeOf(e)), e, {
          categoryCode: null,
        }),
      ),
    );
    assert.deepEqual(
      domain
        .sortExpenses(await repository.readExpenses(db), "custom")
        .map((e) => e.id),
      [20, 5],
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, {
      name: "신규",
      amountTypeCode: "fixed",
      amount: 10000,
      chargeDay: 10,
      methodId: 1,
      categoryCode: "subscription",
    });
    const next = (await repository.readExpenses(db)).find(
      (e) => e.name === "신규",
    );
    assert.equal(next.id, 91);
    assert.equal(next.sortOrder, 2);
    assert.equal(next.categoryCode, "subscription");
  } finally {
    db.sqlite.close();
  }
});

test("fixed and variable expenses persist, convert safely, and exclude variable amounts from totals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-types-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const base = { name: "관리비", chargeDay: 25, methodId: 1 };
    await repository.saveExpense(db, {
      ...base,
      amountTypeCode: "variable",
      amount: null,
    });
    await repository.saveExpense(db, {
      ...base,
      name: "월세",
      amountTypeCode: "fixed",
      amount: 750000,
    });
    let expenses = await repository.readExpenses(db);
    const variableId = expenses.find((e) => e.amountTypeCode === "variable").id;
    assert.equal(domain.monthlyTotal(expenses), 750000);
    assert.equal(
      domain.expenseAmountLabel(expenses.find((e) => e.id === variableId)),
      "매월 변동",
    );
    const bank = (await repository.readMethods(db))[0];
    assert.equal(
      domain.monthlyTotal(domain.relatedExpenses(bank, [bank], expenses)),
      750000,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readExpenses(db), expenses);
    await repository.saveExpense(
      db,
      { ...base, amountTypeCode: "fixed", amount: 50000 },
      variableId,
    );
    assert.equal(
      domain.monthlyTotal(await repository.readExpenses(db)),
      800000,
    );
    await repository.saveExpense(
      db,
      { ...base, amountTypeCode: "variable", amount: null },
      variableId,
    );
    expenses = await repository.readExpenses(db);
    assert.equal(expenses.find((e) => e.id === variableId).amount, null);
    assert.equal(domain.monthlyTotal(expenses), 750000);
    for (const invalid of [
      { amountTypeCode: "unknown", amount: null },
      { amountTypeCode: "fixed", amount: null },
      { amountTypeCode: "fixed", amount: 0 },
      { amountTypeCode: "fixed", amount: 1.5 },
      { amountTypeCode: "fixed", amount: 1000000000 },
      { amountTypeCode: "variable", amount: 50000 },
      { amountTypeCode: "variable", amount: 0 },
    ]) {
      await assert.rejects(
        repository.saveExpense(db, { ...base, ...invalid }, variableId),
      );
      await assert.rejects(
        db.runAsync(
          "UPDATE expenses SET amountTypeCode = ?, amount = ? WHERE id = ?",
          invalid.amountTypeCode,
          invalid.amount,
          variableId,
        ),
      );
    }
    assert.deepEqual(await repository.readExpenses(db), expenses);
    await repository.deleteMethod(db, 1);
    assert.ok(
      (await repository.readExpenses(db)).every((e) => e.methodId === null),
    );
    await repository.deleteExpense(db, variableId);
    assert.equal((await repository.readExpenses(db)).length, 1);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test("v3 amount type migration preserves data, links and deleted IDs; a failure rolls back and retries", async () => {
  const db = sqliteAdapter();
  try {
    await db.execAsync(V3_SCHEMA);
    await db.execAsync(`
      INSERT INTO payment_providers (code, kind, name) VALUES ('bank_kb', 'bank', 'KB국민은행');
      INSERT INTO payment_methods (id, kind, providerCode, name) VALUES (1, 'bank', 'bank_kb', '급여 통장');
      INSERT INTO expenses (id, name, amount, chargeDay, methodId) VALUES
        (10, '월세', 750000, 1, 1), (11, '관리비', 150000, 25, 1), (90, '삭제한 항목', 1000, 5, NULL);
      DELETE FROM expenses WHERE id = 90;
    `);
    const before = await repository.readExpenses(db);
    const methods = await readPreCardTypeMethods(db);
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql.includes("ALTER TABLE expenses_v4 RENAME TO expenses"))
        throw new Error("Simulated expense type migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated expense type migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      3,
    );
    assert.deepEqual(await repository.readExpenses(db), before);
    assert.equal(
      (await db.getAllAsync("PRAGMA table_info(expenses)")).some(
        (c) => c.name === "amountTypeCode",
      ),
      false,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'expenses_v4'",
      ),
      undefined,
    );
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT seq FROM sqlite_sequence WHERE name = 'expenses'",
        )
      ).seq,
      90,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      9,
    );
    assert.deepEqual(await repository.readExpenses(db), withFixedType(before));
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readExpenses(db), withFixedType(before));
    await repository.saveExpense(db, {
      name: "전기요금",
      amountTypeCode: "variable",
      amount: null,
      chargeDay: 20,
      methodId: 1,
    });
    assert.equal(
      (await repository.readExpenses(db)).find((e) => e.name === "전기요금").id,
      91,
    );
  } finally {
    db.sqlite.close();
  }
});

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
