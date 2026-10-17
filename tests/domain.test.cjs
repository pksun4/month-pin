const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const ts = require("typescript");
const { hookRuntime } = require("./support/hook-runtime.cjs");

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
const cardBenefitRepository = loadTypeScript("src/data/card-benefits.ts");
const cardBenefitDomain = loadTypeScript("src/utils/card-benefits.ts");
const cardBenefitHistory = loadTypeScript("src/data/card-benefit-history.ts");
const annualRepository = loadTypeScript("src/data/annual-summary.ts");
const annualDomain = loadTypeScript("src/utils/annual-summary.ts");
const taxRepository = loadTypeScript("src/data/year-end-tax.ts");
const taxDomain = loadTypeScript("src/utils/year-end-tax.ts");

const settle = () => new Promise((resolve) => setImmediate(resolve));

function methodFormFixture({
  method,
  methods = [],
  initialKind = "card",
  saveMethod,
  onClose = () => {},
}) {
  const revealed = [];
  const focused = [];
  const runtime = hookRuntime("src/components/method-form.tsx", {
    "react-native": {
      View: "View",
      StyleSheet: { create: (styles) => styles },
    },
    "./typography": { AppText: "Text" },
    "../data/providers": loadTypeScript("src/data/providers.ts"),
    "../data/method-types": loadTypeScript("src/data/method-types.ts"),
    "../utils/expenses": domain,
    "../utils/method-form": loadTypeScript("src/utils/method-form.ts"),
    "../hooks/use-month-pin": {
      useMonthPin: () => ({
        methods,
        busy: false,
        saveMethod,
      }),
    },
    "./ui": {
      Button: "Button",
      Field: "Field",
      FieldMessage: "FieldMessage",
      s: {},
      useFormNavigation: () => (node, focus) => {
        revealed.push(node?.field);
        focus?.();
      },
    },
    "./provider-select": { ProviderSelect: "ProviderSelect" },
    "./form-segments": { FormSegments: "FormSegments" },
    "./form-select": { FormSelect: "FormSelect" },
    "./charge-day-field": { ChargeDayField: "ChargeDayField" },
    "./provider-icon": { ProviderIcon: "ProviderIcon" },
    "./month-field": { MonthField: "MonthField" },
    "../utils/ledger": ledgerDomain,
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = () => {
    const nodes = flatten(
      runtime.render(({ MethodForm }) =>
        MethodForm({
          method,
          initialKind,
          onClose,
        }),
      ),
    );
    for (const node of nodes) {
      if (node.props?.testID?.startsWith("method-field-")) {
        const field = node.props.testID.replace("method-field-", "");
        node.props.ref.current = { field };
        for (const child of flatten(node.props.children))
          if (child.props?.controlRef)
            child.props.controlRef.current = {
              focus: () => focused.push(field),
            };
      }
    }
    return nodes;
  };
  const control = (label) => {
    const node = render().find((element) => element.props?.label === label);
    assert.ok(node, `Missing control: ${label}`);
    return node.props;
  };
  return {
    render,
    control,
    revealed,
    focused,
    component: (type) => render().find((node) => node.type === type)?.props,
  };
}

function ledgerHookFixture() {
  const requests = [];
  const store = {
    busy: false,
    dataRevision: 0,
    loadLedgerMonth: (month) =>
      new Promise((resolve, reject) =>
        requests.push({ month, resolve, reject }),
      ),
  };
  const runtime = hookRuntime("src/hooks/use-ledger-month.ts", {
    "./use-month-pin": { useMonthPin: () => store },
  });
  return {
    runtime,
    store,
    requests,
    render: (month = "2026-06", enabled = true) =>
      runtime.render(({ useLedgerMonth }) => useLedgerMonth(month, enabled)),
  };
}

test("calendar invalidates rendered snapshots before effects and refreshes after a save even without new list references", async () => {
  const { runtime, store, requests, render } = ledgerHookFixture();
  render();
  runtime.flush();
  const old = [{ id: 1, name: "청년미래적금" }];
  requests[0].resolve(old);
  await settle();
  assert.deepEqual(render().entries, old);
  store.busy = true;
  assert.equal(render().loading, true);
  assert.deepEqual(render().entries, []);
  runtime.flush();
  assert.equal(requests.length, 1);
  store.dataRevision++;
  store.busy = false;
  assert.deepEqual(render().entries, []);
  runtime.flush();
  assert.equal(requests.length, 2);
  requests[1].resolve([]);
  await settle();
  assert.equal(render().loading, false);
  assert.deepEqual(render().entries, []);
});

test("calendar ignores superseded responses and refreshes hidden views and route revisits", async () => {
  const { runtime, store, requests, render } = ledgerHookFixture();
  render();
  runtime.flush();
  store.dataRevision++;
  render();
  runtime.flush();
  requests[1].resolve([]);
  await settle();
  requests[0].resolve([{ id: 1 }]);
  await settle();
  assert.deepEqual(render().entries, []);
  render("2026-06", false);
  runtime.flush();
  store.dataRevision++;
  render("2026-06", false);
  runtime.flush();
  assert.equal(requests.length, 2);
  render();
  runtime.flush();
  requests[2].resolve([]);
  await settle();
  render();
  runtime.focus(false);
  runtime.focus(true);
  assert.equal(requests.length, 4);
  requests[3].resolve([]);
  await settle();
  assert.equal(render().loading, false);
});

test("calendar rejects old-month responses and clears errors on an explicit retry", async () => {
  const { runtime, requests, render } = ledgerHookFixture();
  render();
  runtime.flush();
  assert.deepEqual(render("2026-07").entries, []);
  runtime.flush();
  requests[0].resolve([{ id: 1 }]);
  await settle();
  assert.deepEqual(render("2026-07").entries, []);
  assert.equal(render("2026-07").loading, true);
  requests[1].reject(new Error("Read failed"));
  await settle();
  const failed = render("2026-07");
  assert.ok(failed.error);
  assert.equal(failed.loading, false);
  failed.retry();
  assert.equal(render("2026-07").error, null);
  runtime.flush();
  requests[2].resolve([{ id: 2 }]);
  await settle();
  assert.deepEqual(render("2026-07").entries, [{ id: 2 }]);
});

test("successful writes invalidate calendar snapshots even when the subsequent list reload fails", async () => {
  let failRead = false;
  let failWrite = false;
  let writes = 0;
  const read = async () => {
    if (failRead) throw new Error("Read failed");
    return [];
  };
  const runtime = hookRuntime("src/hooks/use-month-pin.tsx", {
    "expo-sqlite": { useSQLiteContext: () => "test-db" },
    "../data/database": {
      readExpenses: read,
      readMethods: read,
      saveExpense: async () => {
        if (failWrite) throw new Error("Write failed");
        writes++;
      },
    },
    "../data/ledger": { loadLedgerMonth: async () => [] },
    "../data/annual-summary": {
      loadAnnualSummary: async (db, year) => ({ year, months: [] }),
    },
    "../data/year-end-tax-cards": { saveYearEndTaxCards: async () => {} },
    "../data/year-end-tax": {
      loadYearEndTaxYear: async (db, year) => ({
        year,
        grossSalary: 40000000,
      }),
      saveYearEndTaxSalary: async () => {
        if (failWrite) throw new Error("Write failed");
        writes++;
      },
      saveYearEndTaxMonth: async () => {
        if (failWrite) throw new Error("Write failed");
        writes++;
      },
    },
    "../data/card-benefits": {
      loadCardBenefitMonth: async (db, month) => ({
        month,
        confirmed: false,
        cards: [],
      }),
      saveCardBenefitMonth: async () => {
        if (failWrite) throw new Error("Write failed");
        writes++;
      },
    },
  });
  const render = () =>
    runtime.render(({ MonthPinProvider }) =>
      MonthPinProvider({ children: null }),
    ).props.value;
  render();
  runtime.flush();
  await settle();
  const initialRevision = render().dataRevision;
  await render().saveExpense(insuranceInput);
  assert.equal(render().dataRevision, initialRevision + 1);
  failRead = true;
  await render().saveExpense(insuranceInput);
  assert.equal(writes, 2);
  assert.equal(render().dataRevision, initialRevision + 2);
  assert.ok(render().error);
  assert.equal(render().busy, false);
  failWrite = true;
  await assert.rejects(render().saveExpense(insuranceInput), /Write failed/);
  assert.equal(render().dataRevision, initialRevision + 2);
  assert.equal(render().busy, false);
  failWrite = false;
  const revisionBeforeBenefits = render().dataRevision;
  await render().saveCardBenefitMonth("2026-10", [{ methodId: 1, amount: 0 }]);
  assert.equal(render().dataRevision, revisionBeforeBenefits + 1);
  assert.deepEqual(await render().loadCardBenefitMonth("2026-10"), {
    month: "2026-10",
    confirmed: false,
    cards: [],
  });
  const revisionBeforeTax = render().dataRevision;
  await render().saveYearEndTaxSalary(2026, 40000000);
  assert.equal(render().dataRevision, revisionBeforeTax + 1);
  assert.deepEqual(await render().loadYearEndTaxYear(2026), {
    year: 2026,
    grossSalary: 40000000,
  });
  const beforeMonthlyTax = render().dataRevision;
  await render().saveYearEndTaxMonth({ year: 2026, month: 1, amounts: {} });
  assert.equal(render().dataRevision, beforeMonthlyTax + 1);
  failWrite = true;
  await assert.rejects(
    render().saveYearEndTaxMonth({ year: 2026, month: 1, amounts: {} }),
    /Write failed/,
  );
  await assert.rejects(
    render().saveYearEndTaxSalary(2026, 40000000),
    /Write failed/,
  );
  assert.equal(render().dataRevision, beforeMonthlyTax + 1);
});

function sqliteAdapter(path = ":memory:") {
  const sqlite = new DatabaseSync(path);
  return {
    sqlite,
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, ...params) => {
      const result = sqlite.prepare(sql).run(...params);
      return { ...result, lastInsertRowId: result.lastInsertRowid };
    },
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
    m.name, m.bankId, m.settlementDay, NULL AS cardTypeCode, m.sortOrder,
    NULL AS benefitTypeCode, NULL AS benefitAmount
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

const cardBenefitDefaults = { benefitTypeCode: "fixed", benefitAmount: 0 };

const insuranceInput = {
  startMonth: "1000-01",
  name: "보험료",
  amountTypeCode: "fixed",
  amount: 50000,
  chargeDay: 31,
  methodId: null,
  categoryCode: "living",
};

test("pre-policy fixed expenses migrated from v8 disappear before a July start without reloading the app", async () => {
  const db = sqliteAdapter();
  const input = { ...insuranceInput, name: "청년미래적금", chargeDay: 14 };
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, input);
    for (const month of ["2026-01", "2026-06", "2026-07"])
      await ledgerRepository.loadLedgerMonth(db, month);
    await db.execAsync(`DROP TABLE expense_amount_versions;
      ALTER TABLE expenses DROP COLUMN startMonth;
      ALTER TABLE expenses DROP COLUMN endMonth;
      ALTER TABLE expenses DROP COLUMN isDeleted;
      ALTER TABLE ledger_entries DROP COLUMN amountEntered;
      ALTER TABLE ledger_entries DROP COLUMN methodId;
      PRAGMA user_version = 8;`);
    await repository.initializeDatabase(db);
    const expense = (await repository.readExpenses(db))[0];
    assert.equal(expense.startMonth, "1000-01");
    const { runtime, store, render } = ledgerHookFixture();
    store.loadLedgerMonth = (month) =>
      ledgerRepository.loadLedgerMonth(db, month);
    render();
    runtime.flush();
    await settle();
    assert.equal(render().entries[0].name, "청년미래적금");
    assert.equal(render().entries[0].amountEntered, false);
    await repository.saveExpense(
      db,
      { ...input, startMonth: "2026-07" },
      expense.id,
    );
    store.dataRevision++;
    assert.deepEqual(render().entries, []);
    runtime.flush();
    await settle();
    assert.equal(render().loading, false);
    assert.deepEqual(render().entries, []);
    for (const month of ["2026-01", "2026-06"])
      assert.deepEqual(await ledgerRepository.loadLedgerMonth(db, month), []);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, "2026-07"))[0].expenseId,
      expense.id,
    );
    await repository.initializeDatabase(db);
    assert.equal((await repository.readExpenses(db))[0].startMonth, "2026-07");
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("monthly totals use applicable histories, ended periods and actual amounts instead of current template totals", async () => {
  const db = sqliteAdapter();
  const month = ledgerDomain.monthKey();
  const previous = ledgerDomain.moveMonth(month, -1);
  const next = ledgerDomain.moveMonth(month, 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "종료 예정",
      amount: 20000,
    });
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "다음 달 시작",
      startMonth: next,
      amount: 90000,
    });
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "관리비",
      amountTypeCode: "variable",
      amount: null,
    });
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "미입력",
      amountTypeCode: "variable",
      amount: null,
    });
    const expenses = await repository.readExpenses(db);
    const fixed = expenses.find((expense) => expense.name === "보험료");
    const ending = expenses.find((expense) => expense.name === "종료 예정");
    await repository.endExpense(db, ending.id, month);
    await repository.saveExpense(
      db,
      { ...insuranceInput, amount: 60000 },
      fixed.id,
      next,
    );
    const entries = await ledgerRepository.loadLedgerMonth(db, month);
    const actual = entries.find((entry) => entry.name === "관리비");
    await ledgerRepository.saveLedgerAmount(db, actual.id, 12000);
    const currentEntries = await ledgerRepository.loadLedgerMonth(db, month);
    assert.deepEqual(ledgerDomain.ledgerSummary(currentEntries), {
      total: 82000,
      pending: 1,
      count: 4,
    });
    assert.equal(
      domain.monthlyTotal(await repository.readExpenses(db)),
      150000,
    );
    assert.equal(
      ledgerDomain.ledgerSummary(
        await ledgerRepository.loadLedgerMonth(db, previous),
      ).total,
      70000,
    );
    assert.equal(
      ledgerDomain.ledgerSummary(
        await ledgerRepository.loadLedgerMonth(db, next),
      ).total,
      150000,
    );
    await ledgerRepository.saveLedgerAmount(db, actual.id, 0);
    assert.deepEqual(
      ledgerDomain.ledgerSummary(
        await ledgerRepository.loadLedgerMonth(db, month),
      ),
      { total: 70000, pending: 1, count: 4 },
    );
  } finally {
    db.sqlite.close();
  }
});

test("default-current-month changes preserve earlier months and update all current and cached future amounts", async () => {
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
      "SELECT effectiveMonth, amount FROM expense_amount_versions WHERE expenseId = ? ORDER BY effectiveMonth",
      expense.id,
    );
    assert.deepEqual(
      versions.map((row) => ({ ...row })),
      [
        { effectiveMonth: "1000-01", amount: 50000 },
        { effectiveMonth: ledgerDomain.monthKey(today), amount: 55000 },
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
      assert.equal(
        (await ledgerRepository.loadLedgerMonth(db, currentMonth)).find(
          (entry) => entry.id === earlier.id,
        ).amount,
        60000,
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
      `${year}-02`,
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
      `${year}-04`,
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
      `${year}-03`,
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
      `${year}-03`,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, march))[0].amount,
      58000,
    );
    assert.equal(
      (
        await db.getAllAsync(
          "SELECT id FROM expense_amount_versions WHERE expenseId = ? AND effectiveMonth = ?",
          expense.id,
          `${year}-03`,
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
    await repository.saveExpense(db, insuranceInput, expense.id, `${year}-02`);
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
    await repository.saveExpense(db, input, expense.id, `${year}-03`);
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

test("invalid months and failed saves roll back template, history and future ledger together", async () => {
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
    for (const effectiveMonth of [
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
          effectiveMonth,
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
          "INSERT INTO expense_amount_versions (expenseId,effectiveMonth,amountTypeCode,amount) VALUES (?,?,'fixed',1)",
          expense.id,
          invalidDate,
        ),
      );
    assert.equal(ledgerDomain.isValidMonth("2024-02"), true);
    assert.equal(ledgerDomain.isValidMonth("2025-02-29"), false);
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
      19,
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
      ...cardBenefitDefaults,
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
      startMonth: "1000-01",
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
    await repository.saveMethod(db, bankInput);
    const bankId = (await repository.readMethods(db))[0].id;
    await repository.saveMethod(db, {
      ...cardBenefitDefaults,
      kind: "card",
      providerCode: "card_kb",
      name: "처음 카드",
      bankId,
      settlementDay: 10,
      cardTypeCode: "credit",
    });
    const card = (await repository.readMethods(db))[0];
    const input = {
      startMonth: "1000-01",
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
        ...cardBenefitDefaults,
        kind: "card",
        providerCode: "card_shinhan",
        name: "변경 카드",
        bankId,
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
    await repository.endExpense(db, expense.id, ledgerDomain.monthKey());
    const retained = await ledgerRepository.loadLedgerMonth(db, pastMonth);
    assert.equal(retained.length, 2);
    const history = retained.find((entry) => entry.id === before[0].id);
    assert.deepEqual({ ...history }, { ...before[0] });
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
      startMonth: "1000-01",
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
      19,
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

test("card sections contain only credit and debit while preserving every inner sort", () => {
  const methods = [
    {
      id: 4,
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_samsung",
      name: "나",
      sortOrder: 2,
    },
    {
      id: 2,
      kind: "card",
      cardTypeCode: "debit",
      providerCode: "card_samsung",
      name: "나",
      sortOrder: 0,
    },
    {
      id: 3,
      kind: "card",
      cardTypeCode: null,
      providerCode: "card_kb",
      name: "기존 카드",
      sortOrder: 1,
    },
    {
      id: 5,
      kind: "card",
      cardTypeCode: "debit",
      providerCode: "card_kb",
      name: "가",
      sortOrder: 3,
    },
    {
      id: 1,
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_kb",
      name: "가",
      sortOrder: 4,
    },
    {
      id: 6,
      kind: "bank",
      cardTypeCode: null,
      providerCode: "bank_kb",
      name: "통장",
      sortOrder: 0,
    },
  ];
  const expenses = [
    { methodId: 4, amount: 10000 },
    { methodId: 1, amount: 5000 },
    { methodId: 2, amount: 2000 },
  ];
  const original = structuredClone(methods);
  const expected = {
    provider: [
      [5, 2],
      [1, 4],
    ],
    registered: [
      [2, 5],
      [1, 4],
    ],
    amount: [
      [2, 5],
      [4, 1],
    ],
    custom: [
      [2, 5],
      [4, 1],
    ],
  };
  for (const [order, ids] of Object.entries(expected)) {
    const sections = domain.groupCardMethods(
      domain.sortPaymentMethods(methods, order, methods, expenses),
    );
    assert.deepEqual(
      sections.map((section) => section.key),
      ["debit", "credit"],
    );
    assert.deepEqual(
      sections.map((section) => section.data.map((method) => method.id)),
      ids,
    );
  }
  assert.deepEqual(methods, original);
  assert.deepEqual(domain.groupCardMethods([]), []);
  assert.deepEqual(domain.groupCardMethods([methods[5]]), []);
  assert.deepEqual(
    domain.groupCardMethods([methods[1]]).map((section) => section.key),
    ["debit"],
  );
  const changed = methods.map((method) =>
    method.id === 4 ? { ...method, cardTypeCode: "debit" } : method,
  );
  assert.deepEqual(
    domain
      .groupCardMethods(changed)
      .map((section) => section.data.map((method) => method.id)),
    [[4, 2, 5], [1]],
  );
});

test("sectioned browsing leaves swipes to the outer container and enables local drag only while reordering", () => {
  const runtime = hookRuntime("src/components/reorderable-list.tsx", {
    "react-native": { FlatList: "FlatList", View: "View" },
    "react-native-draggable-flatlist": {
      default: "DraggableFlatList",
      ScaleDecorator: "ScaleDecorator",
      NestableDraggableFlatList: "NestedList",
      NestableScrollContainer: "ScrollContainer",
    },
  });
  const sections = [
    { key: "credit", title: "신용카드", data: [{ id: 1 }, { id: 2 }] },
    { key: "debit", title: "체크카드", data: [{ id: 3 }, { id: 4 }] },
    { key: "unspecified", title: "종류 미지정", data: [{ id: 5 }] },
  ];
  let start;
  let end;
  let itemIndex;
  const browseItems = [];
  const render = (reordering) => {
    const element = runtime.render(({ ReorderableList }) =>
      ReorderableList({
        sections,
        reordering,
        data: sections.flatMap((section) => section.data),
        keyExtractor: (item) => String(item.id),
        ItemSeparatorComponent: "Separator",
        onDragBegin: (index) => (start = index),
        onDragEnd: (result) => (end = result),
        renderItem: (params) => {
          itemIndex = params.getIndex();
          if (!reordering) browseItems.push(params);
          return null;
        },
      }),
    );
    return element.type(element.props);
  };
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const browse = render(false);
  assert.equal(browse.type, "ScrollContainer");
  assert.equal(
    flatten(browse).some((node) => node.type === "NestedList"),
    false,
  );
  assert.deepEqual(
    browseItems.map((item) => item.item.id),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    browseItems.map((item) => item.getIndex()),
    [0, 1, 2, 3, 4],
  );
  assert.ok(browseItems.every((item) => item.isActive === false));
  browseItems[0].drag();
  assert.equal(start, undefined);
  assert.equal(
    flatten(browse).filter((node) => node.type === "Separator").length,
    2,
  );
  const editing = render(true);
  assert.equal(browse.type, editing.type);
  const lists = flatten(editing).filter((node) => node.type === "NestedList");
  assert.equal(lists.length, 3);
  const debitList = lists[1].props;
  assert.equal(debitList.dragItemOverflow, false);
  debitList.onDragBegin(1);
  assert.equal(start, 3);
  debitList.renderItem({
    item: sections[1].data[1],
    getIndex: () => 1,
    isActive: false,
    drag: () => {},
  });
  assert.equal(itemIndex, 3);
  debitList.renderItem({
    item: sections[1].data[1],
    getIndex: () => undefined,
    isActive: false,
    drag: () => {},
  });
  assert.equal(itemIndex, undefined);
  debitList.onDragEnd({
    data: [sections[1].data[1], sections[1].data[0]],
    from: 1,
    to: 0,
  });
  assert.equal(end.from, 3);
  assert.equal(end.to, 2);
  assert.deepEqual(
    end.data.map((item) => item.id),
    [1, 2, 4, 3, 5],
  );
  assert.deepEqual(
    sections.flatMap((section) => section.data.map((item) => item.id)),
    [1, 2, 3, 4, 5],
  );
  const returned = render(false);
  assert.equal(returned.type, browse.type);
  assert.equal(
    flatten(returned).some((node) => node.type === "NestedList"),
    false,
  );
});

test("wallet card reorder blocks section crossings, saves all cards and restores the prior order on failure", async () => {
  const bank = {
    id: 6,
    kind: "bank",
    cardTypeCode: null,
    providerCode: "bank_kb",
    name: "통장",
    sortOrder: 0,
  };
  const store = {
    methods: [
      bank,
      {
        id: 1,
        kind: "card",
        cardTypeCode: "credit",
        providerCode: "card_kb",
        name: "가",
        sortOrder: 0,
      },
      {
        id: 2,
        kind: "card",
        cardTypeCode: "credit",
        providerCode: "card_kb",
        name: "나",
        sortOrder: 2,
      },
      {
        id: 3,
        kind: "card",
        cardTypeCode: "debit",
        providerCode: "card_samsung",
        name: "가",
        sortOrder: 1,
      },
      {
        id: 4,
        kind: "card",
        cardTypeCode: "debit",
        providerCode: "card_samsung",
        name: "나",
        sortOrder: 3,
      },
      {
        id: 5,
        kind: "card",
        cardTypeCode: null,
        providerCode: "card_kb",
        name: "기존",
        sortOrder: 4,
      },
    ],
    expenses: [],
    busy: false,
  };
  const calls = [];
  const alerts = [];
  let fail = true;
  store.reorderMethods = async (kind, ids) => {
    calls.push({ kind, ids });
    if (fail) throw new Error("Simulated order failure");
    store.methods = store.methods.map((method) =>
      method.kind === kind
        ? { ...method, sortOrder: ids.indexOf(method.id) }
        : method,
    );
  };
  const mocks = {
    "react-native": {
      View: "View",
      Alert: { alert: (...args) => alerts.push(args) },
    },
    "../../data/method-types": loadTypeScript("src/data/method-types.ts"),
    "../../hooks/use-month-pin": { useMonthPin: () => store },
    "../../utils/expenses": domain,
    "../../components/ui": Object.fromEntries(
      ["Button", "ButtonGroup", "Empty", "FormModal", "Header", "Screen"]
        .map((name) => [name, name])
        .concat([["s", {}]]),
    ),
    "../../components/list-controls": Object.fromEntries(
      [
        "ListTabs",
        "ListSummary",
        "ListToolbar",
        "ListReorderButton",
        "RegisterButton",
      ]
        .map((name) => [name, name])
        .concat([["listStyles", {}]]),
    ),
  };
  for (const [file, name] of [
    ["typography", "AppText"],
    ["reorderable-list", "ReorderableList"],
    ["expense-row", "ExpenseRow"],
    ["method-form", "MethodForm"],
    ["provider-icon", "ProviderIcon"],
    ["payment-method-row", "PaymentMethodRow"],
    ["select-popover", "SelectPopover"],
  ])
    mocks[`../../components/${file}`] = { [name]: name };
  const runtime = hookRuntime("src/app/(tabs)/wallet.tsx", mocks);
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const list = () =>
    flatten(runtime.render((module) => module.default())).find(
      (node) => node.type === "ReorderableList",
    ).props;
  const header = () => flatten(list().ListHeaderComponent);
  header()
    .find((node) => node.type === "ListTabs")
    .props.onChange("card");
  assert.deepEqual(
    list().sections.map((section) => section.key),
    ["debit", "credit"],
  );
  header()
    .find((node) => node.type === "ListReorderButton")
    .props.onPress();
  const row = (id) => {
    const props = list();
    const index = props.data.findIndex((method) => method.id === id);
    return props.renderItem({
      item: props.data[index],
      getIndex: () => index,
      isActive: false,
      drag: () => {},
    }).props;
  };
  assert.equal(row(2).reorder.canMoveDown, false);
  assert.equal(row(3).reorder.canMoveUp, false);
  row(2).reorder.onAccessibilityMove(1);
  assert.equal(calls.length, 0);
  const move = row(2).reorder.onAccessibilityMove;
  move(-1);
  move(-1);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(alerts.length, 1);
  assert.deepEqual(
    list().data.map((method) => method.id),
    [3, 4, 1, 2],
  );
  fail = false;
  row(2).reorder.onAccessibilityMove(-1);
  await settle();
  assert.deepEqual(calls[1], {
    kind: "card",
    ids: [3, 4, 2, 1, 5],
  });
  assert.deepEqual(
    list().data.map((method) => method.id),
    [3, 4, 2, 1],
  );
  assert.deepEqual(
    store.methods.find((method) => method.id === bank.id),
    bank,
  );
  header()
    .find((node) => node.type === "ListReorderButton")
    .props.onPress();
  header()
    .find((node) => node.props?.label === "카드 정보 확인")
    .props.onPress();
  assert.ok(
    flatten(runtime.render((module) => module.default())).some(
      (node) =>
        node.type === "ButtonGroup" &&
        node.props.actions.some((action) => action.label === "수정"),
    ),
  );
  header()
    .find((node) => node.type === "ListTabs")
    .props.onChange("bank");
  assert.equal(list().sections, undefined);
  assert.deepEqual(list().data, [bank]);
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

test("payment method choices group banks before cards while placing debit before credit and preserving each inner order", () => {
  const methods = [
    { id: 4, kind: "card", cardTypeCode: "credit", sortOrder: 0 },
    { id: 3, kind: "bank", sortOrder: 0 },
    { id: 2, kind: "card", cardTypeCode: "debit", sortOrder: 1 },
    { id: 1, kind: "bank", sortOrder: 1 },
    { id: 5, kind: "card", cardTypeCode: "credit", sortOrder: 2 },
    { id: 6, kind: "card", cardTypeCode: null, sortOrder: 3 },
    { id: 7, kind: "card", cardTypeCode: "debit", sortOrder: 4 },
    { id: 8, kind: "card", cardTypeCode: null, sortOrder: 5 },
  ];
  const snapshot = structuredClone(methods);
  assert.deepEqual(
    domain.paymentMethodsByKind(methods).map((method) => method.id),
    [3, 1, 2, 7, 4, 5, 6, 8],
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
      ...cardBenefitDefaults,
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
    await repository.endExpense(db, netflix.id, ledgerDomain.monthKey());
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
        ...cardBenefitDefaults,
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
      19,
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
      19,
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
          ...cardBenefitDefaults,
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
        ...cardBenefitDefaults,
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
      ...cardBenefitDefaults,
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_samsung",
      name: "X",
      bankId: banks[0].id,
      settlementDay: 25,
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
      ...cardBenefitDefaults,
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
      ...cardBenefitDefaults,
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
      19,
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
          ...cardBenefitDefaults,
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
    await repository.endExpense(db, b, ledgerDomain.monthKey());
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
      19,
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
      19,
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
    await repository.endExpense(db, variableId, ledgerDomain.monthKey());
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
      19,
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

test("expense start month defaults to current month and includes already passed charge days without backfilling prior months", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const previous = ledgerDomain.moveMonth(current, -1);
  const next = ledgerDomain.moveMonth(current, 1);
  try {
    await repository.initializeDatabase(db);
    await ledgerRepository.loadLedgerMonth(db, previous);
    await ledgerRepository.loadLedgerMonth(db, current);
    const input = { ...insuranceInput, chargeDay: 1 };
    delete input.startMonth;
    await repository.saveExpense(db, input);
    const expense = (await repository.readExpenses(db))[0];
    assert.equal(expense.startMonth, current);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, previous)).length,
      0,
    );
    const entries = await ledgerRepository.loadLedgerMonth(db, current);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].day, 1);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      entries,
    );
    await repository.saveExpense(db, {
      ...input,
      name: "다음 달 시작",
      startMonth: next,
    });
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, current)).length,
      1,
    );
    assert.equal((await ledgerRepository.loadLedgerMonth(db, next)).length, 2);
    for (const startMonth of ["bad", "2026-13", "2026-01-01", "0999-12"])
      await assert.rejects(
        repository.saveExpense(db, { ...input, startMonth }),
      );
  } finally {
    db.sqlite.close();
  }
});

test("ending uses an inclusive last month, retains unvisited history and actual zero, and excludes cached automatic future entries", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-ending-"));
  const path = join(directory, "ending.db");
  let db = sqliteAdapter(path);
  const current = ledgerDomain.monthKey();
  const last = ledgerDomain.moveMonth(current, 1);
  const after = ledgerDomain.moveMonth(current, 2);
  const unvisited = ledgerDomain.moveMonth(current, -2);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "관리비",
      amountTypeCode: "variable",
      amount: null,
    });
    const expenses = await repository.readExpenses(db);
    const currentBefore = await ledgerRepository.loadLedgerMonth(db, current);
    const cached = await ledgerRepository.loadLedgerMonth(db, after);
    const actual = cached.find((entry) => entry.amountTypeCode === "variable");
    await ledgerRepository.saveLedgerAmount(db, actual.id, 0);
    for (const expense of expenses)
      await repository.endExpense(db, expense.id, last);
    assert.equal((await repository.readExpenses(db)).length, 0);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      currentBefore,
    );
    assert.equal((await ledgerRepository.loadLedgerMonth(db, last)).length, 2);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, unvisited)).length,
      2,
    );
    const retained = await ledgerRepository.loadLedgerMonth(db, after);
    assert.equal(retained.length, 1);
    assert.equal(retained[0].id, actual.id);
    assert.equal(retained[0].amount, 0);
    assert.equal(retained[0].amountEntered, true);
    await assert.rejects(repository.endExpense(db, expenses[0].id, last));
    await assert.rejects(
      repository.saveExpense(
        db,
        { ...insuranceInput, amount: 60000 },
        expenses[0].id,
      ),
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, after),
      retained,
    );
    await ledgerRepository.saveLedgerAmount(db, actual.id, null);
    assert.equal((await ledgerRepository.loadLedgerMonth(db, after)).length, 0);
    assert.equal(
      (
        await ledgerRepository.loadLedgerMonth(
          db,
          ledgerDomain.moveMonth(after, 1),
        )
      ).length,
      0,
    );
    await repository.reorderExpenses(db, []);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ending failure rolls back both last-month boundary and automatic records; invalid month does not alter data", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const future = ledgerDomain.moveMonth(current, 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const entries = await ledgerRepository.loadLedgerMonth(db, future);
    const run = db.runAsync;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.startsWith("DELETE FROM ledger_entries"))
        throw new Error("Simulated ending failure");
      return result;
    };
    await assert.rejects(
      repository.endExpense(db, expense.id, current),
      /Simulated ending failure/,
    );
    db.runAsync = run;
    for (const invalid of [
      ledgerDomain.moveMonth(current, -1),
      "2026-13",
      "2026-01-01",
      "bad",
    ])
      await assert.rejects(repository.endExpense(db, expense.id, invalid));
    assert.deepEqual(await repository.readExpenses(db), [expense]);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, future),
      entries,
    );
  } finally {
    db.sqlite.close();
  }
});

test("v10 migration converts date settings to monthly latest values atomically without rewriting recorded months", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const previous = ledgerDomain.moveMonth(current, -1);
  const next = ledgerDomain.moveMonth(current, 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const records = await ledgerRepository.loadLedgerMonth(db, current);
    await db.execAsync(`ALTER TABLE expenses DROP COLUMN startMonth;
      ALTER TABLE expenses DROP COLUMN endMonth;
      DROP TABLE expense_amount_versions;
      CREATE TABLE expense_amount_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expenseId INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        effectiveDate TEXT NOT NULL, amountTypeCode TEXT NOT NULL, amount INTEGER,
        UNIQUE(expenseId,effectiveDate)); PRAGMA user_version = 10;`);
    for (const [date, amount] of [
      ["1000-01-01", 50000],
      [`${current}-01`, 55000],
      [`${current}-20`, 60000],
      [`${next}-15`, 70000],
    ])
      await db.runAsync(
        "INSERT INTO expense_amount_versions (expenseId,effectiveDate,amountTypeCode,amount) VALUES (?,?,'fixed',?)",
        expense.id,
        date,
        amount,
      );
    const oldHistory = await db.getAllAsync(
      "SELECT * FROM expense_amount_versions",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 11;")
        throw new Error("Simulated monthly migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated monthly migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      10,
    );
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(expenses)")).some(
        (column) => column.name === "startMonth",
      ),
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM expense_amount_versions"),
      oldHistory,
    );
    assert.deepEqual(
      await ledgerRepository.readLedgerMonth(db, current),
      records,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.equal((await repository.readExpenses(db))[0].startMonth, "1000-01");
    assert.deepEqual(
      (
        await db.getAllAsync(
          "SELECT effectiveMonth,amount FROM expense_amount_versions ORDER BY effectiveMonth",
        )
      ).map((row) => ({ ...row })),
      [
        { effectiveMonth: "1000-01", amount: 50000 },
        { effectiveMonth: current, amount: 60000 },
        { effectiveMonth: next, amount: 70000 },
      ],
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      records,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, previous))[0].amount,
      50000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, next))[0].amount,
      70000,
    );
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      records,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("editing a start month keeps expense identity, duplicate names, amount history and actuals across reconnects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-start-edit-"));
  const path = join(directory, "start.db");
  let db = sqliteAdapter(path);
  const current = ledgerDomain.monthKey();
  const before = ledgerDomain.moveMonth(current, -2);
  const previous = ledgerDomain.moveMonth(current, -1);
  const next = ledgerDomain.moveMonth(current, 1);
  const fixedInput = { ...insuranceInput, name: "같은 구독" };
  const variableInput = {
    ...fixedInput,
    amountTypeCode: "variable",
    amount: null,
  };
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, fixedInput);
    await repository.saveExpense(db, variableInput);
    await repository.saveExpense(db, { ...fixedInput, amount: 3000 });
    const expenses = await repository.readExpenses(db);
    const fixed = expenses.find((expense) => expense.amount === 50000);
    const variable = expenses.find(
      (expense) => expense.amountTypeCode === "variable",
    );
    const other = expenses.find((expense) => expense.amount === 3000);
    const oldRows = await ledgerRepository.loadLedgerMonth(db, before);
    const previousRows = await ledgerRepository.loadLedgerMonth(db, previous);
    const zero = oldRows.find((entry) => entry.expenseId === variable.id);
    const positive = previousRows.find(
      (entry) => entry.expenseId === variable.id,
    );
    await ledgerRepository.saveLedgerAmount(db, zero.id, 0);
    await ledgerRepository.saveLedgerAmount(db, positive.id, 12000);
    await repository.saveExpense(
      db,
      { ...fixedInput, amount: 55000 },
      fixed.id,
      current,
    );
    await repository.saveExpense(
      db,
      { ...fixedInput, amount: 60000 },
      fixed.id,
      next,
    );
    const currentRows = await ledgerRepository.loadLedgerMonth(db, current);
    const nextRows = await ledgerRepository.loadLedgerMonth(db, next);
    const history = await db.getAllAsync(
      "SELECT * FROM expense_amount_versions ORDER BY id",
    );
    await repository.saveExpense(
      db,
      { ...fixedInput, amount: 60000, startMonth: current },
      fixed.id,
    );
    await repository.saveExpense(
      db,
      { ...variableInput, startMonth: current },
      variable.id,
    );
    assert.equal((await repository.readExpenses(db)).length, 3);
    for (const id of [fixed.id, variable.id])
      assert.equal(
        (await repository.readExpenses(db)).find((expense) => expense.id === id)
          .startMonth,
        current,
      );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM expense_amount_versions ORDER BY id"),
      history,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      currentRows,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, next),
      nextRows,
    );
    const actualBefore = await ledgerRepository.loadLedgerMonth(db, before);
    const actualPrevious = await ledgerRepository.loadLedgerMonth(db, previous);
    assert.equal(actualBefore.length, 2);
    assert.equal(
      actualBefore.find((entry) => entry.expenseId === variable.id).amount,
      0,
    );
    assert.equal(
      actualBefore.find((entry) => entry.expenseId === variable.id).id,
      zero.id,
    );
    assert.equal(
      actualPrevious.find((entry) => entry.expenseId === variable.id).amount,
      12000,
    );
    assert.ok(actualBefore.some((entry) => entry.expenseId === other.id));
    assert.ok(!actualPrevious.some((entry) => entry.expenseId === fixed.id));
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, before),
      actualBefore,
    );
    // Omitting startMonth in another edit preserves the saved boundary.
    const { startMonth, ...withoutStart } = fixedInput;
    await repository.saveExpense(
      db,
      { ...withoutStart, amount: 60000, name: "이름 수정" },
      fixed.id,
    );
    assert.equal(
      (await repository.readExpenses(db)).find(
        (expense) => expense.id === fixed.id,
      ).startMonth,
      current,
    );
    // Moving the boundary earlier restores automatic occurrences using their historical price.
    await repository.saveExpense(
      db,
      { ...fixedInput, amount: 60000, startMonth: before },
      fixed.id,
    );
    const expanded = await ledgerRepository.loadLedgerMonth(db, before);
    assert.equal(expanded.length, 3);
    assert.equal(
      expanded.find((entry) => entry.expenseId === fixed.id).amount,
      50000,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, before),
      expanded,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      currentRows,
    );
    // A preserved actual reset outside the start boundary must not become an automatic occurrence.
    await ledgerRepository.saveLedgerAmount(db, zero.id, null);
    assert.ok(
      !(await ledgerRepository.loadLedgerMonth(db, before)).some(
        (entry) => entry.expenseId === variable.id,
      ),
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, previous)).find(
        (entry) => entry.expenseId === variable.id,
      ).amount,
      12000,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("combined start and amount edits are atomic and invalid start months leave all records untouched", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const before = ledgerDomain.moveMonth(current, -1);
  const next = ledgerDomain.moveMonth(current, 1);
  const input = { ...insuranceInput, amountTypeCode: "variable", amount: null };
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, input);
    const expense = (await repository.readExpenses(db))[0];
    const prior = (await ledgerRepository.loadLedgerMonth(db, before))[0];
    await ledgerRepository.saveLedgerAmount(db, prior.id, 0);
    await ledgerRepository.loadLedgerMonth(db, current);
    await ledgerRepository.loadLedgerMonth(db, next);
    const records = await db.getAllAsync(
      "SELECT * FROM ledger_entries ORDER BY id",
    );
    const history = await db.getAllAsync(
      "SELECT * FROM expense_amount_versions ORDER BY id",
    );
    for (const startMonth of ["bad", "2026-13", "2026-01-01", "0999-12"])
      await assert.rejects(
        repository.saveExpense(db, { ...input, startMonth }, expense.id),
      );
    const run = db.runAsync;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.startsWith("DELETE FROM ledger_entries WHERE expenseId"))
        throw new Error("Simulated start edit failure");
      return result;
    };
    const changed = { ...insuranceInput, amount: 55000, startMonth: current };
    await assert.rejects(
      repository.saveExpense(db, changed, expense.id, current),
      /Simulated start edit failure/,
    );
    db.runAsync = run;
    assert.deepEqual(await repository.readExpenses(db), [expense]);
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM ledger_entries ORDER BY id"),
      records,
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM expense_amount_versions ORDER BY id"),
      history,
    );
    await repository.saveExpense(db, changed, expense.id, current);
    const actual = (await ledgerRepository.loadLedgerMonth(db, before))[0];
    assert.equal(actual.id, prior.id);
    assert.equal(actual.amount, 0);
    assert.equal(actual.amountEntered, true);
    assert.equal(actual.amountTypeCode, "variable");
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, current))[0].amount,
      55000,
    );
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, next))[0].amount,
      55000,
    );
    assert.equal((await repository.readExpenses(db))[0].startMonth, current);
  } finally {
    db.sqlite.close();
  }
});

test("ended expenses can be registered for a new period without filling the gap or altering original records", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-renewal-"));
  const path = join(directory, "renew.db");
  let db = sqliteAdapter(path);
  const last = ledgerDomain.monthKey();
  const gap = ledgerDomain.moveMonth(last, 1);
  const start = ledgerDomain.moveMonth(last, 2);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const method = (await repository.readMethods(db))[0];
    const input = {
      ...insuranceInput,
      categoryCode: "subscription",
      methodId: method.id,
    };
    await repository.saveExpense(db, input);
    const original = (await repository.readExpenses(db))[0];
    const recorded = await ledgerRepository.loadLedgerMonth(db, last);
    await ledgerRepository.loadLedgerMonth(db, gap);
    await ledgerRepository.loadLedgerMonth(db, start);
    await repository.endExpense(db, original.id, last);
    const ended = await repository.readExpenses(db, "ended");
    assert.equal(ended.length, 1);
    assert.equal(ended[0].id, original.id);
    assert.equal(ended[0].endMonth, last);
    assert.equal((await repository.readExpenses(db)).length, 0);
    const restarted = { ...input, startMonth: start, amount: 60000 };
    for (const invalidStart of [last, ledgerDomain.moveMonth(last, -1)])
      await assert.rejects(
        repository.saveExpense(
          db,
          { ...restarted, startMonth: invalidStart },
          undefined,
          undefined,
          original.id,
        ),
      );
    await assert.rejects(
      repository.saveExpense(db, restarted, undefined, undefined, 999999),
    );
    await repository.saveExpense(
      db,
      restarted,
      undefined,
      undefined,
      original.id,
    );
    const active = (await repository.readExpenses(db))[0];
    assert.notEqual(active.id, original.id);
    assert.equal(active.methodId, method.id);
    assert.equal(active.startMonth, start);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, last),
      recorded,
    );
    assert.equal((await ledgerRepository.loadLedgerMonth(db, gap)).length, 0);
    const fresh = await ledgerRepository.loadLedgerMonth(db, start);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].expenseId, active.id);
    assert.equal(fresh[0].amount, 60000);
    assert.deepEqual(await ledgerRepository.loadLedgerMonth(db, start), fresh);
    // Removing the old period never removes its new registration.
    await repository.deleteExpense(db, original.id);
    assert.equal((await repository.readExpenses(db, "ended")).length, 0);
    assert.deepEqual(await repository.readExpenses(db), [active]);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, last),
      recorded,
    );
    await assert.rejects(
      repository.saveExpense(db, restarted, undefined, undefined, original.id),
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(await ledgerRepository.loadLedgerMonth(db, start), fresh);
    assert.equal((await ledgerRepository.loadLedgerMonth(db, gap)).length, 0);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("delete removes active and ended visibility but preserves monthly snapshots and actual zero while stopping future automatic entries", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const previous = ledgerDomain.moveMonth(current, -1);
  const future = ledgerDomain.moveMonth(current, 1);
  try {
    await repository.initializeDatabase(db);
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'monthly_card_usage'",
      ),
      undefined,
    );
    await repository.saveExpense(db, insuranceInput);
    await repository.saveExpense(db, {
      ...insuranceInput,
      amountTypeCode: "variable",
      amount: null,
    });
    await repository.saveExpense(db, {
      ...insuranceInput,
      name: "남기는 항목",
      amount: 3000,
    });
    const expenses = await repository.readExpenses(db);
    const fixed = expenses.find((expense) => expense.amount === 50000);
    const variable = expenses.find(
      (expense) => expense.amountTypeCode === "variable",
    );
    const remaining = expenses.find((expense) => expense.amount === 3000);
    const pastRows = await ledgerRepository.loadLedgerMonth(db, previous);
    const currentRows = await ledgerRepository.loadLedgerMonth(db, current);
    const futureRows = await ledgerRepository.loadLedgerMonth(db, future);
    const manual = futureRows.find((entry) => entry.expenseId === variable.id);
    await ledgerRepository.saveLedgerAmount(db, manual.id, 0);
    await repository.deleteExpense(db, fixed.id);
    await repository.deleteExpense(db, variable.id);
    assert.deepEqual(await repository.readExpenses(db), [remaining]);
    assert.equal((await repository.readExpenses(db, "ended")).length, 0);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, previous),
      pastRows,
    );
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      currentRows,
    );
    const kept = await ledgerRepository.loadLedgerMonth(db, future);
    assert.equal(kept.length, 2);
    assert.equal(kept.find((entry) => entry.id === manual.id).amount, 0);
    assert.ok(!kept.some((entry) => entry.expenseId === fixed.id));
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT isDeleted FROM expenses WHERE id = ?",
          fixed.id,
        )
      ).isDeleted,
      1,
    );
    await repository.reorderExpenses(db, [remaining.id]);
    await assert.rejects(repository.endExpense(db, fixed.id, current));
    await assert.rejects(repository.saveExpense(db, insuranceInput, fixed.id));
    await assert.rejects(repository.deleteExpense(db, fixed.id));
    await assert.rejects(repository.readExpenses(db, "unknown"));
    await ledgerRepository.saveLedgerAmount(db, manual.id, null);
    assert.equal(
      (await ledgerRepository.loadLedgerMonth(db, future)).length,
      1,
    );
    // Invalid flags cannot be written directly to the DB either.
    await assert.rejects(
      db.runAsync(
        "UPDATE expenses SET isDeleted = 2 WHERE id = ?",
        remaining.id,
      ),
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("failed deletion rolls back list flags, end month and future calendar records together", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  const future = ledgerDomain.moveMonth(current, 1);
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const records = await ledgerRepository.loadLedgerMonth(db, future);
    const run = db.runAsync;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.startsWith("DELETE FROM ledger_entries"))
        throw new Error("Simulated deletion failure");
      return result;
    };
    await assert.rejects(
      repository.deleteExpense(db, expense.id),
      /Simulated deletion failure/,
    );
    db.runAsync = run;
    assert.deepEqual(await repository.readExpenses(db), [expense]);
    assert.equal((await repository.readExpenses(db, "ended")).length, 0);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, future),
      records,
    );
  } finally {
    db.sqlite.close();
  }
});

test("v11 migration preserves retired card totals and calendar history, rolls back failures and retries safely", async () => {
  const db = sqliteAdapter();
  const current = ledgerDomain.monthKey();
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, insuranceInput);
    const expense = (await repository.readExpenses(db))[0];
    const records = await ledgerRepository.loadLedgerMonth(db, current);
    await repository.endExpense(db, expense.id, current);
    await db.execAsync(`ALTER TABLE expenses DROP COLUMN isDeleted;
      CREATE TABLE monthly_card_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL,
        methodId INTEGER NOT NULL, methodName TEXT NOT NULL, providerName TEXT NOT NULL,
        providerCode TEXT, cardTypeCode TEXT, amount INTEGER NOT NULL,
        UNIQUE(month, methodId)); PRAGMA user_version = 11;`);
    await db.runAsync(
      "INSERT INTO monthly_card_usage (month,methodId,methodName,providerName,providerCode,cardTypeCode,amount) VALUES (?,1,'카드','국민','card_kb','credit',450000)",
      current,
    );
    const retained = await db.getAllAsync("SELECT * FROM monthly_card_usage");
    const ended = await repository.readExpenses(db, "ended");
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 12;")
        throw new Error("Simulated deletion flag migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated deletion flag migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      11,
    );
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(expenses)")).some(
        (column) => column.name === "isDeleted",
      ),
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM monthly_card_usage"),
      retained,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await repository.readExpenses(db, "ended"), ended);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, current),
      records,
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM monthly_card_usage"),
      retained,
    );
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM monthly_card_usage"),
      retained,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("card benefit form preserves edits on failure, prevents duplicate saves and requires a zero instead of blank benefits", async () => {
  const calls = [];
  let fail = true;
  let closed = 0;
  const card = {
    id: 9,
    kind: "card",
    providerCode: "card_samsung",
    name: "혜택 카드",
    bankId: 1,
    settlementDay: 25,
    cardTypeCode: "credit",
    benefitTypeCode: "fixed",
    benefitAmount: 10000,
  };
  const { render, control } = methodFormFixture({
    method: card,
    methods: [{ ...bankInput, id: 1, provider: "KB국민은행" }],
    saveMethod: async (input, id) => {
      calls.push({ input, id });
      if (fail) throw new Error("Simulated save failure");
    },
    onClose: () => closed++,
  });
  assert.equal(control("월 고정 혜택").value, "10,000");
  control("월 혜택").onChange("variable");
  assert.equal(control("월 예상 혜택").value, "10,000");
  control("월 예상 혜택").onChangeText("0");
  const save = control("저장").onPress;
  save();
  save();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(closed, 0);
  assert.equal(control("월 예상 혜택").value, "0");
  assert.ok(render().some((node) => node.props?.error));
  fail = false;
  control("저장").onPress();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(closed, 1);
  assert.equal(calls[1].id, card.id);
  assert.equal(calls[1].input.benefitTypeCode, "variable");
  assert.equal(calls[1].input.benefitAmount, 0);
  control("월 예상 혜택").onChangeText("");
  control("저장").onPress();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(closed, 1);
  assert.ok(render().some((node) => node.props?.error));
  control("월 예상 혜택").onChangeText("1000000000");
  assert.equal(control("저장").disabled, false);
  assert.ok(control("월 예상 혜택").error);
});

test("card registration requires every applicable field and hides the credit-only date for debit cards", async () => {
  const calls = [];
  const bank = { ...bankInput, id: 1, provider: "KB국민은행" };
  const { render, control, component } = methodFormFixture({
    methods: [bank],
    saveMethod: async (input) => calls.push(input),
  });
  const blocked = async (message) => {
    control("저장").onPress();
    await settle();
    assert.equal(calls.length, 0);
    assert.ok(render().some((node) => node.props?.error?.includes(message)));
  };
  assert.equal(control("카드 종류").value, null);
  assert.equal(control("월 혜택").value, null);
  await blocked("카드사");
  component("ProviderSelect").onChange("card_samsung");
  await blocked("카드 이름");
  control("카드 이름").onChangeText("신규 카드");
  await blocked("카드 종류");
  control("카드 종류").onChange("credit");
  await blocked("통장");
  assert.deepEqual(
    control("출금 통장").options.map((option) => option.code),
    [1],
  );
  control("출금 통장").onChange(1);
  await blocked("출금일");
  control("출금일").onChange("31");
  await blocked("고정·변동");
  control("월 혜택").onChange("fixed");
  await blocked("혜택 금액");
  control("월 고정 혜택").onChangeText("0");
  control("저장").onPress();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cardTypeCode, "credit");
  assert.equal(calls[0].bankId, 1);
  assert.equal(calls[0].settlementDay, 31);
  assert.equal(calls[0].benefitTypeCode, "fixed");
  assert.equal(calls[0].benefitAmount, 0);
  control("카드 종류").onChange("debit");
  assert.equal(
    render().find((node) => node.props?.label === "출금일"),
    undefined,
  );
  control("월 혜택").onChange("variable");
  control("월 예상 혜택").onChangeText("10000");
  control("저장").onPress();
  await settle();
  assert.equal(calls[1].cardTypeCode, "debit");
  assert.equal(calls[1].settlementDay, null);
  assert.equal(calls[1].benefitTypeCode, "variable");
  assert.equal(calls[1].benefitAmount, 10000);

  const noBank = methodFormFixture({
    method: { ...calls[0], id: 9, bankId: null },
    saveMethod: async () => assert.fail("A card without a bank must not save"),
  });
  assert.equal(noBank.control("출금 통장").disabled, true);
  assert.deepEqual(noBank.control("출금 통장").options, []);
  noBank.control("저장").onPress();
  await settle();
  assert.ok(
    noBank
      .render()
      .some((node) => node.props?.error?.includes("통장을 먼저 등록")),
  );
});

test("card saves reject missing required fields on insert and update while incomplete legacy records remain recoverable", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    const valid = {
      ...cardBenefitDefaults,
      kind: "card",
      cardTypeCode: "credit",
      providerCode: "card_samsung",
      name: "카드",
      bankId: bank.id,
      settlementDay: 25,
    };
    await repository.saveMethod(db, valid);
    const card = (await repository.readMethods(db)).find(
      (method) => method.kind === "card",
    );
    const before = await repository.readMethods(db);
    for (const [patch, message] of [
      [{ providerCode: null }, /목록에서/],
      [{ name: "   " }, /카드 이름/],
      [{ cardTypeCode: null }, /신용카드 또는 체크카드/],
      [{ bankId: null }, /통장/],
      [{ bankId: undefined }, /통장/],
      [{ bankId: card.id }, /통장/],
      [{ settlementDay: null }, /출금일/],
      [{ settlementDay: 0 }, /출금일/],
      [{ settlementDay: 32 }, /출금일/],
      [{ benefitTypeCode: null }, /월 혜택/],
      [{ benefitAmount: null }, /월 혜택/],
      [{ benefitTypeCode: undefined, benefitAmount: undefined }, /월 혜택/],
    ]) {
      for (const id of [undefined, card.id])
        await assert.rejects(
          repository.saveMethod(db, { ...valid, ...patch }, id),
          message,
        );
    }
    assert.deepEqual(await repository.readMethods(db), before);
    await repository.saveExpense(db, { ...insuranceInput, methodId: card.id });
    const expenses = await repository.readExpenses(db);
    await db.runAsync(
      `UPDATE payment_methods SET cardTypeCode = NULL, bankId = NULL, settlementDay = NULL,
      benefitTypeCode = NULL, benefitAmount = NULL WHERE id = ?`,
      card.id,
    );
    await repository.initializeDatabase(db);
    const legacy = (await repository.readMethods(db)).find(
      (method) => method.id === card.id,
    );
    assert.equal(legacy.cardTypeCode, null);
    assert.equal(legacy.benefitAmount, null);
    assert.equal(legacy.bankId, null);
    await assert.rejects(
      repository.saveMethod(
        db,
        { ...legacy, providerCode: valid.providerCode },
        card.id,
      ),
      /신용카드 또는 체크카드/,
    );
    await repository.saveMethod(db, valid, card.id);
    assert.deepEqual(await repository.readMethods(db), before);
    assert.deepEqual(await repository.readExpenses(db), expenses);
  } finally {
    db.sqlite.close();
  }
});

test("method form reveals errors after blur or submit, clears corrected fields and focuses the first visible error", async () => {
  const fixture = methodFormFixture({
    methods: [{ ...bankInput, id: 1, provider: "KB국민은행" }],
    saveMethod: async () => assert.fail("Incomplete form must not save"),
  });
  const { render, control, component, revealed, focused } = fixture;
  assert.equal(
    render().some((node) => node.props?.error),
    false,
  );
  control("카드 이름").onBlur();
  assert.ok(control("카드 이름").error);
  assert.equal(control("카드 종류").error, "");
  control("카드 이름").onChangeText("생활 카드");
  assert.equal(control("카드 이름").error, "");
  control("저장").onPress();
  await settle();
  assert.equal(revealed.at(-1), "cardTypeCode");
  assert.equal(focused.at(-1), "cardTypeCode");
  assert.ok(control("카드 종류").error);
  assert.ok(component("ProviderSelect").error);
  assert.ok(control("출금 통장").error);
  assert.ok(control("월 혜택").error);
  assert.ok(control("월 혜택 금액").error);
  control("카드 종류").onChange("credit");
  assert.equal(control("카드 종류").error, "");
  assert.ok(control("출금일").error);
  control("저장").onPress();
  await settle();
  assert.equal(revealed.at(-1), "providerCode");
  component("ProviderSelect").onChange("card_samsung");
  assert.equal(component("ProviderSelect").error, "");
  control("월 혜택 금액").onChangeText("0");
  assert.equal(control("월 혜택 금액").error, "");
  assert.equal(control("저장").disabled, false);
});

test("shared fields expose visual error feedback and modal navigation waits for layout before scrolling and focusing", () => {
  const uiRuntime = () =>
    hookRuntime("src/components/ui.tsx", {
      "./theme": loadTypeScript("src/components/theme.ts"),
      "./typography": { AppText: "Text", AppTextInput: "Input" },
      "react-native": {
        View: "View",
        Modal: "Modal",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        KeyboardAvoidingView: "KeyboardAvoidingView",
        ActivityIndicator: "Spinner",
        Keyboard: { dismiss: () => {} },
        Platform: { OS: "ios" },
        useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }),
        StyleSheet: { create: (styles) => styles },
      },
      "react-native-safe-area-context": {
        SafeAreaProvider: "SafeAreaProvider",
        SafeAreaView: "SafeAreaView",
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
      },
      "@expo/vector-icons/Ionicons": { default: "Icon" },
      "../hooks/use-month-pin": { useMonthPin: () => ({}) },
    });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const fields = uiRuntime();
  const tree = fields.render((ui) =>
    ui.Field({
      label: "카드 이름",
      value: "",
      onChangeText: () => {},
      placeholder: "",
      required: true,
      error: "카드 이름을 입력해 주세요.",
    }),
  );
  const input = flatten(tree).find((node) => node.type === "Input");
  assert.equal(input.props.accessibilityHint, "카드 이름을 입력해 주세요.");
  assert.ok(
    input.props.style.some(
      (style) => style?.borderColor === fields.module.colors.red,
    ),
  );
  const feedback = fields.module.FieldMessage({
    error: input.props.accessibilityHint,
  });
  assert.equal(feedback.props.accessibilityRole, "alert");
  assert.ok(
    flatten(feedback).some(
      (node) => node.props?.name === "alert-circle-outline",
    ),
  );
  const inlineFields = uiRuntime();
  const controlRef = { current: null };
  const changes = [];
  let blurred = false;
  const inline = flatten(
    inlineFields.render((ui) =>
      ui.Field({
        label: "오하Check",
        labelLeading: "logo",
        inlineLabel: true,
        unit: "원",
        value: "9,999,999,999",
        onChangeText: (value) => changes.push(value),
        onBlur: () => {
          blurred = true;
        },
        placeholder: "0",
        numeric: true,
        maxLength: 13,
        controlRef,
      }),
    ),
  ).find((node) => node.type === "Input");
  assert.equal(inline.props.accessibilityLabel, "오하Check (원)");
  assert.equal(inline.props.ref, controlRef);
  assert.equal(inline.props.value, "9,999,999,999");
  assert.equal(inline.props.keyboardType, "number-pad");
  assert.equal(inline.props.maxLength, 13);
  inline.props.onChangeText("");
  inline.props.onBlur();
  assert.deepEqual(changes, [""]);
  assert.equal(blurred, true);
  for (const presentation of ["full_screen", "dialog"]) {
    const modal = uiRuntime();
    let nodes = flatten(
      modal.render((ui) =>
        ui.FormModal({
          title: "카드 등록",
          presentation,
          onClose: () => {},
          children: null,
        }),
      ),
    );
    const dialog = nodes.find((node) => node.type?.name === "DialogContent");
    if (dialog) nodes = flatten(dialog.type(dialog.props));
    const scroll = nodes.find((node) => node.type === "ScrollView");
    const provider = nodes.find(
      (node) => typeof node.props?.value === "function",
    );
    const container = { id: "form-content" };
    provider.props.children.props.ref.current = container;
    const scrolls = [];
    scroll.props.ref.current = { scrollTo: (options) => scrolls.push(options) };
    const frames = [];
    const original = global.requestAnimationFrame;
    global.requestAnimationFrame = (callback) => frames.push(callback);
    let focused = 0;
    try {
      provider.props.value(
        {
          measureLayout: (ancestor, success) => {
            assert.equal(ancestor, container);
            success(0, 240);
          },
        },
        () => focused++,
      );
      assert.equal(focused, 0);
      assert.equal(scrolls.length, 0);
      frames.shift()();
      assert.deepEqual(scrolls, [{ y: 228, animated: true }]);
      assert.equal(focused, 1);
      provider.props.value(
        { measureLayout: (_ancestor, _success, fail) => fail() },
        () => focused++,
      );
      frames.shift()();
      assert.equal(focused, 2);
    } finally {
      if (original) global.requestAnimationFrame = original;
      else delete global.requestAnimationFrame;
    }
  }
});

test("reordering classified cards keeps legacy card positions and references across reopen", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    for (const name of ["A", "기존 카드", "B"])
      await repository.saveMethod(db, {
        ...cardBenefitDefaults,
        kind: "card",
        providerCode: "card_samsung",
        cardTypeCode: "credit",
        name,
        bankId: bank.id,
        settlementDay: 25,
      });
    const cards = (await repository.readMethods(db)).filter(
      (method) => method.kind === "card",
    );
    const [a, legacy, b] = cards;
    await db.runAsync(
      "UPDATE payment_methods SET cardTypeCode = NULL WHERE id = ?",
      legacy.id,
    );
    await repository.saveExpense(db, {
      ...insuranceInput,
      methodId: legacy.id,
    });
    const expenses = await repository.readExpenses(db);
    const current = (await repository.readMethods(db)).filter(
      (method) => method.kind === "card",
    );
    const legacyBefore = current.find((method) => method.id === legacy.id);
    const merged = domain.mergePaymentMethodOrder(current, [b, a]);
    assert.deepEqual(
      merged.map((method) => method.id),
      [b.id, legacy.id, a.id],
    );
    await repository.reorderMethods(
      db,
      "card",
      merged.map((method) => method.id),
    );
    await repository.initializeDatabase(db);
    const saved = await repository.readMethods(db);
    assert.deepEqual(
      saved.find((method) => method.id === legacy.id),
      legacyBefore,
    );
    assert.deepEqual(
      domain
        .groupCardMethods(saved)
        .flatMap((section) => section.data.map((method) => method.id)),
      [b.id, a.id],
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
  } finally {
    db.sqlite.close();
  }
});

test("card monthly benefits persist, switch types and allow zero while rejecting blank values without changing history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-benefits-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    const input = {
      kind: "card",
      providerCode: "card_samsung",
      name: "월 혜택 카드",
      bankId: bank.id,
      settlementDay: 25,
      cardTypeCode: "credit",
      benefitTypeCode: "fixed",
      benefitAmount: 10000,
    };
    await repository.saveMethod(db, input);
    const card = (await repository.readMethods(db)).find(
      (m) => m.kind === "card",
    );
    await repository.saveExpense(db, { ...insuranceInput, methodId: card.id });
    const expenses = await repository.readExpenses(db);
    const month = ledgerDomain.monthKey();
    const entries = await ledgerRepository.loadLedgerMonth(db, month);
    assert.equal(domain.cardBenefitLabel(card), "월 고정 혜택 10,000원");
    assert.equal(domain.cardBenefitLabel(bank), null);
    assert.equal(domain.parseAmount("0", 0), 0);
    assert.equal(domain.parseAmount("0"), null);
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      (await repository.readMethods(db)).find((m) => m.id === card.id),
      card,
    );

    const variable = {
      ...input,
      benefitTypeCode: "variable",
      benefitAmount: 12500,
    };
    await repository.saveMethod(db, variable, card.id);
    let saved = (await repository.readMethods(db)).find(
      (m) => m.id === card.id,
    );
    assert.equal(domain.cardBenefitLabel(saved), "월 변동 혜택 예상 12,500원");
    assert.deepEqual(
      { ...saved },
      {
        ...card,
        benefitTypeCode: "variable",
        benefitAmount: 12500,
      },
    );
    await repository.saveMethod(
      db,
      {
        ...variable,
        benefitAmount: 0,
        cardTypeCode: "debit",
        settlementDay: null,
      },
      card.id,
    );
    saved = (await repository.readMethods(db)).find((m) => m.id === card.id);
    assert.equal(saved.benefitAmount, 0);
    assert.equal(domain.cardBenefitLabel(saved), "월 변동 혜택 예상 0원");
    assert.equal(saved.bankId, bank.id);

    const methods = await repository.readMethods(db);
    assert.equal(domain.paymentMethodsTotal(methods, methods, expenses), 50000);
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, month),
      entries,
    );
    await assert.rejects(
      repository.saveMethod(
        db,
        { ...input, benefitTypeCode: null, benefitAmount: null },
        card.id,
      ),
      /월 혜택/,
    );
    saved = (await repository.readMethods(db)).find((m) => m.id === card.id);
    assert.equal(saved.benefitTypeCode, "variable");
    assert.equal(saved.benefitAmount, 0);
    assert.equal(domain.cardBenefitLabel(saved), "월 변동 혜택 예상 0원");
    assert.deepEqual(
      (await repository.readMethods(db)).find((m) => m.id === bank.id),
      bank,
    );
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("card benefit validation and SQLite constraints reject invalid codes, incomplete pairs and bank benefits", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const input = {
      kind: "card",
      providerCode: "card_samsung",
      name: "혜택 카드",
      bankId: (await repository.readMethods(db))[0].id,
      settlementDay: 25,
      cardTypeCode: "credit",
      benefitTypeCode: "fixed",
      benefitAmount: 10000,
    };
    await repository.saveMethod(db, input);
    const methods = await repository.readMethods(db);
    const card = methods.find((m) => m.kind === "card");
    const bank = methods.find((m) => m.kind === "bank");
    for (const patch of [
      { benefitTypeCode: "고정" },
      { benefitTypeCode: "unknown" },
      { benefitTypeCode: null },
      { benefitAmount: null },
      { benefitAmount: -1 },
      { benefitAmount: 1.5 },
      { benefitAmount: 1000000000 },
      { benefitAmount: "10000" },
      { benefitAmount: NaN },
      { benefitAmount: Infinity },
    ]) {
      await assert.rejects(
        repository.saveMethod(db, { ...input, ...patch }, card.id),
        /월 혜택/,
      );
    }
    await assert.rejects(
      repository.saveMethod(
        db,
        { ...bankInput, benefitTypeCode: "fixed", benefitAmount: 10000 },
        bank.id,
      ),
      /통장에는 카드 혜택/,
    );
    for (const [id, type, amount] of [
      [card.id, "고정", 10000],
      [card.id, null, 10000],
      [card.id, "fixed", null],
      [card.id, "fixed", -1],
      [card.id, "variable", 1.5],
      [card.id, "fixed", 1000000000],
      [bank.id, "fixed", 10000],
    ]) {
      await assert.rejects(
        db.runAsync(
          "UPDATE payment_methods SET benefitTypeCode = ?, benefitAmount = ? WHERE id = ?",
          type,
          amount,
          id,
        ),
        /CHECK constraint/,
      );
    }
    assert.deepEqual(await repository.readMethods(db), methods);
    await repository.saveMethod(
      db,
      { ...input, benefitAmount: 999999999 },
      card.id,
    );
    assert.equal(
      (await repository.readMethods(db)).find((m) => m.id === card.id)
        .benefitAmount,
      999999999,
    );
  } finally {
    db.sqlite.close();
  }
});

test("v12 benefit migration preserves data and references, rolls back failures, retries and keeps saved benefits on reinitialization", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    const input = {
      ...cardBenefitDefaults,
      kind: "card",
      providerCode: "card_samsung",
      name: "기존 카드",
      bankId: bank.id,
      settlementDay: 25,
      cardTypeCode: "credit",
    };
    await repository.saveMethod(db, input);
    const card = (await repository.readMethods(db)).find(
      (m) => m.kind === "card",
    );
    await repository.saveExpense(db, { ...insuranceInput, methodId: card.id });
    const month = ledgerDomain.monthKey();
    const entries = await ledgerRepository.loadLedgerMonth(db, month);
    const expenses = await repository.readExpenses(db);
    await db.execAsync(`ALTER TABLE payment_methods DROP COLUMN benefitAmount;
      ALTER TABLE payment_methods DROP COLUMN benefitTypeCode;
      PRAGMA user_version = 12;`);
    const legacyMethods = await db.getAllAsync(
      "SELECT * FROM payment_methods ORDER BY id",
    );
    const sequence = await db.getAllAsync(
      "SELECT * FROM sqlite_sequence ORDER BY name",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 13;")
        throw new Error("Simulated benefit migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated benefit migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      12,
    );
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(payment_methods)")).some(
        (column) =>
          column.name === "benefitTypeCode" || column.name === "benefitAmount",
      ),
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM payment_methods ORDER BY id"),
      legacyMethods,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM payment_methods ORDER BY id"),
      legacyMethods.map((method) =>
        Object.assign(Object.create(Object.getPrototypeOf(method)), method, {
          benefitTypeCode: null,
          benefitAmount: null,
        }),
      ),
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM sqlite_sequence ORDER BY name"),
      sequence,
    );
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(
      await ledgerRepository.loadLedgerMonth(db, month),
      entries,
    );
    await repository.saveMethod(
      db,
      { ...input, benefitTypeCode: "variable", benefitAmount: 10000 },
      card.id,
    );
    const methods = await repository.readMethods(db);
    await repository.initializeDatabase(db);
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
    await assert.rejects(
      db.runAsync(
        "UPDATE payment_methods SET benefitAmount = NULL WHERE id = ?",
        card.id,
      ),
      /CHECK constraint/,
    );
  } finally {
    db.sqlite.close();
  }
});

test("monthly benefit summaries use confirmed actuals including zero and otherwise retain estimates", () => {
  const cards = [
    {
      methodId: 1,
      benefitTypeCode: "fixed",
      expectedAmount: 10000,
      amount: 10000,
    },
    {
      methodId: 2,
      benefitTypeCode: "variable",
      expectedAmount: 2500,
      amount: null,
    },
    {
      methodId: 3,
      benefitTypeCode: "variable",
      expectedAmount: 5000,
      amount: null,
    },
  ];
  assert.deepEqual(
    cardBenefitDomain.cardBenefitMonthSummary({ cards, confirmed: false }),
    {
      total: 17500,
      variableCount: 2,
      pending: 2,
      confirmed: false,
    },
  );
  assert.deepEqual(
    cardBenefitDomain.cardBenefitMonthSummary({
      cards: cards.map((card) => ({
        ...card,
        amount: card.methodId === 1 ? 10000 : 0,
      })),
      confirmed: true,
    }),
    {
      total: 10000,
      variableCount: 2,
      pending: 0,
      confirmed: true,
    },
  );
  assert.deepEqual(cardBenefitDomain.cardBenefitMonthSummary(null), {
    total: 0,
    variableCount: 0,
    pending: 0,
    confirmed: false,
  });
});

test("expense views open on the calendar and retain both views while toggling and revisiting the tab", () => {
  let params = {};
  const cleared = [];
  const runtime = hookRuntime("src/app/(tabs)/expenses.tsx", {
    "react-native": { View: "View" },
    "expo-router": {
      useLocalSearchParams: () => params,
      router: {
        setParams: (next) => {
          cleared.push(next);
          params = { ...params, ...next };
        },
      },
    },
    "../../components/expense-list-view": { ExpenseListView: "ListView" },
    "../../components/expense-calendar-view": {
      ExpenseCalendarView: "CalendarView",
    },
    "../../components/expense-view-button": { ExpenseViewButton: "Switcher" },
    "../../components/ui": { s: { flex: {} } },
    "../../hooks/use-month-pin": { useMonthPin: () => ({ busy: false }) },
  });
  const render = () => {
    const root = runtime.render((module) => module.default());
    const wrappers = root.props.children;
    const list = wrappers[0].props.children;
    const calendar = wrappers[1].props.children;
    return {
      wrappers,
      list,
      calendar,
      switcher: calendar.props.viewSwitcher.props,
    };
  };
  let view = render();
  assert.equal(view.switcher.value, "calendar");
  assert.equal(view.calendar.props.active, true);
  assert.equal(view.list.props.active, false);
  assert.equal(view.wrappers[0].props.accessibilityElementsHidden, true);
  view.switcher.onChange("list");
  view = render();
  assert.equal(view.switcher.value, "list");
  assert.equal(view.list.props.active, true);
  assert.equal(view.calendar.props.active, false);
  assert.equal(view.wrappers[1].props.accessibilityElementsHidden, true);
  runtime.focus(false);
  runtime.focus(true);
  assert.equal(render().switcher.value, "list");
  view.switcher.onChange("calendar");
  assert.equal(render().calendar.props.active, true);
  runtime.flush();
  // Every home shortcut opens the list, even after previously choosing calendar.
  for (let visit = 0; visit < 2; visit++) {
    runtime.focus(false);
    params = { view: "list" };
    view = render();
    assert.equal(view.list.props.active, true);
    assert.equal(view.calendar.props.active, false);
    runtime.flush();
    runtime.focus(true);
    assert.deepEqual(cleared.at(-1), { view: undefined });
    assert.equal(render().switcher.value, "list");
    render().switcher.onChange("calendar");
    assert.equal(render().switcher.value, "calendar");
    runtime.flush();
    runtime.focus(false);
    runtime.focus(true);
    assert.equal(render().switcher.value, "calendar");
  }
});

test("calendar estimates follow month totals and card edits without changing day entries or showing stale amounts during loading", () => {
  const entries = [
    { id: 1, day: 1, amount: 50000, methodId: 1, amountTypeCode: "fixed" },
    { id: 2, day: 2, amount: 15000, methodId: 1, amountTypeCode: "variable" },
    { id: 3, day: 1, amount: null, methodId: null, amountTypeCode: "variable" },
    { id: 4, day: 3, amount: 0, methodId: null, amountTypeCode: "variable" },
  ];
  const original = structuredClone(entries);
  const store = {
    busy: false,
    methods: [
      {
        id: 1,
        kind: "card",
        cardTypeCode: "credit",
        benefitTypeCode: "fixed",
        benefitAmount: 10000,
      },
      {
        id: 2,
        kind: "card",
        cardTypeCode: "debit",
        benefitTypeCode: "variable",
        benefitAmount: 2500,
      },
      { id: 3, kind: "card", benefitTypeCode: null, benefitAmount: null },
    ],
  };
  let snapshot = { entries, loading: false, error: null };
  let confirmedBenefits = null;
  let benefitsLoading = false;
  let requestedMonth;
  let requestedActive;
  let retries = 0;
  const runtime = hookRuntime("src/components/expense-calendar-view.tsx", {
    "react-native": {
      ActivityIndicator: "Spinner",
      FlatList: "FlatList",
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { create: (value) => value, hairlineWidth: 1 },
    },
    "./typography": { AppText: "Text" },
    "@expo/vector-icons/Ionicons": "Icon",
    "../hooks/use-month-pin": { useMonthPin: () => store },
    "../hooks/use-ledger-month": {
      useLedgerMonth: (month, active) => {
        requestedMonth = month;
        requestedActive = active;
        return { ...snapshot, retry: () => retries++ };
      },
    },
    "../hooks/use-card-benefit-month": {
      useCardBenefitMonth: (month) => ({
        snapshot: confirmedBenefits ?? {
          month,
          confirmed: false,
          cards: store.methods
            .filter(
              (method) =>
                method.kind === "card" &&
                method.benefitTypeCode &&
                method.benefitAmount !== null,
            )
            .map((method) => ({
              methodId: method.id,
              benefitTypeCode: method.benefitTypeCode,
              expectedAmount: method.benefitAmount,
              amount:
                method.benefitTypeCode === "fixed"
                  ? method.benefitAmount
                  : null,
            })),
        },
        loading: benefitsLoading,
        error: null,
        retry: () => {},
      }),
    },
    "../utils/card-benefits": cardBenefitDomain,
    "./card-benefit-form": { CardBenefitForm: "BenefitForm" },
    "../utils/ledger": ledgerDomain,
    "../utils/expenses": domain,
    "./list-controls": { RegisterButton: "RegisterButton" },
    "./expense-form": { ExpenseForm: "ExpenseForm" },
    "./ledger-calendar": { LedgerCalendar: "Calendar" },
    "./ledger-entry-row": { LedgerEntryRow: "EntryRow" },
    "./ledger-amount-form": { LedgerAmountForm: "AmountForm" },
    "./ui": {
      Button: "Button",
      Empty: "Empty",
      FormModal: "Modal",
      Header: "Header",
      Screen: "Screen",
      s: {},
      colors: {},
    },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = (active = true) => {
    const root = runtime.render(({ ExpenseCalendarView }) =>
      ExpenseCalendarView({ active, viewSwitcher: null }),
    );
    const list = flatten(root).find((node) => node.type === "FlatList").props;
    const nodes = flatten([list.ListHeaderComponent, list.ListFooterComponent]);
    return {
      root,
      list,
      nodes,
      label: (prefix) =>
        nodes.find((node) =>
          node.props?.accessibilityLabel?.startsWith(prefix),
        ),
      calendar: nodes.find((node) => node.type === "Calendar")?.props,
    };
  };
  let view = render();
  const firstMonth = requestedMonth;
  assert.equal(view.label("월 지출 합계").props.children, "65,000원");
  assert.equal(
    view.label("월 지출 합계").props.accessibilityLabel,
    "월 지출 합계 65,000원, 전체 4건, 미입력 1건",
  );
  assert.deepEqual(view.label("예상 혜택").props.children, ["−", "12,500원"]);
  assert.equal(view.label("혜택 반영 예상액").props.children, "52,500원");
  view.calendar.onSelect(1);
  view = render();
  assert.deepEqual(
    view.list.data.map((entry) => entry.id),
    [1, 3],
  );
  assert.equal(view.label("혜택 반영 예상액").props.children, "52,500원");
  flatten(view.list.renderItem({ item: entries[2] }))
    .find((node) => node.type === "EntryRow")
    .props.onPress();
  const amountModal = flatten(render().root).find(
    (node) => node.type === "Modal" && node.props.title === "변동 금액 입력",
  );
  assert.equal(amountModal.props.presentation, "dialog");
  const amountForm = flatten(amountModal).find(
    (node) => node.type === "AmountForm",
  );
  assert.equal(amountForm.props.entry, entries[2]);
  amountForm.props.onClose();
  assert.ok(!flatten(render().root).some((node) => node.type === "AmountForm"));
  render(false);
  assert.equal(requestedActive, false);
  view = render();
  assert.equal(view.calendar.selectedDay, 1);
  assert.equal(requestedMonth, firstMonth);
  store.methods = store.methods.map((method) =>
    method.id === 2 ? { ...method, benefitAmount: 5000 } : method,
  );
  view = render();
  assert.equal(view.label("혜택 반영 예상액").props.children, "50,000원");
  view.nodes
    .find((node) => node.props?.accessibilityLabel === "다음 달")
    .props.onPress();
  snapshot = {
    entries: [{ id: 5, day: 1, amount: 1000 }],
    loading: false,
    error: null,
  };
  view = render();
  assert.equal(requestedMonth, ledgerDomain.moveMonth(firstMonth, 1));
  assert.equal(view.label("월 지출 합계").props.children, "1,000원");
  assert.equal(view.label("혜택 반영 예상액").props.children, "-14,000원");
  view.calendar.onSelect(ledgerDomain.daysInMonth(requestedMonth));
  view = render();
  assert.equal(view.list.ListEmptyComponent, null);
  view.label("카드 혜택 정산").props.onPress();
  view = render();
  assert.equal(
    flatten(view.root).find((node) => node.type === "BenefitForm").props
      .snapshot.month,
    requestedMonth,
  );
  confirmedBenefits = {
    month: requestedMonth,
    confirmed: true,
    cards: [
      {
        methodId: 1,
        benefitTypeCode: "fixed",
        expectedAmount: 10000,
        amount: 10000,
      },
      {
        methodId: 2,
        benefitTypeCode: "variable",
        expectedAmount: 5000,
        amount: 0,
      },
    ],
  };
  view = render();
  assert.deepEqual(view.label("확정 혜택").props.children, ["−", "10,000원"]);
  assert.equal(view.label("혜택 반영 예상액").props.children, "-9,000원");
  assert.equal(view.calendar.benefitsConfirmed, true);
  confirmedBenefits = null;
  benefitsLoading = true;
  view = render();
  assert.equal(view.label("월 지출 합계").props.children, "—");
  assert.equal(view.label("혜택 반영 예상액").props.children, "—");
  assert.deepEqual(view.calendar.entries, []);
  assert.equal(view.calendar.dataReady, false);
  assert.equal(view.list.ListFooterComponent, null);
  benefitsLoading = false;
  snapshot = { ...snapshot, loading: true };
  view = render();
  assert.equal(view.label("혜택 반영 예상액").props.children, "—");
  assert.ok(view.calendar);
  assert.equal(view.calendar.dataReady, false);
  assert.deepEqual(view.calendar.entries, []);
  assert.equal(view.calendar.benefitsConfirmed, false);
  assert.equal(view.calendar.benefitsPending, false);
  assert.deepEqual(view.list.data, []);
  assert.equal(view.list.ListFooterComponent, null);
  flatten(view.list.renderItem({ item: entries[2] }))
    .find((node) => node.type === "EntryRow")
    .props.onPress();
  assert.ok(!flatten(render().root).some((node) => node.type === "AmountForm"));
  snapshot = { ...snapshot, loading: false, error: "조회 실패" };
  view = render();
  assert.equal(view.label("혜택 반영 예상액").props.children, "—");
  assert.ok(view.calendar);
  assert.deepEqual(view.calendar.entries, []);
  view.nodes
    .find((node) => node.type === "Button" && node.props.label === "다시 시도")
    .props.onPress();
  assert.equal(retries, 1);
  store.methods = [];
  snapshot = { entries: [], loading: false, error: null };
  view = render();
  assert.equal(view.label("월 지출 합계").props.children, "0원");
  assert.equal(view.label("혜택 반영 예상액").props.children, "0원");
  assert.deepEqual(view.label("예상 혜택").props.children, ["", "0원"]);
  assert.deepEqual(entries, original);
});

async function seedSettlementCards(db) {
  await repository.saveMethod(db, bankInput);
  const bank = (await repository.readMethods(db))[0];
  const input = {
    kind: "card",
    providerCode: "card_samsung",
    name: "같은 카드",
    bankId: bank.id,
    settlementDay: 25,
    cardTypeCode: "credit",
    benefitTypeCode: "variable",
    benefitAmount: 5000,
  };
  for (const patch of [
    { name: "고정 카드", benefitTypeCode: "fixed", benefitAmount: 10000 },
    {},
    { cardTypeCode: "debit", settlementDay: null, benefitAmount: 3000 },
  ])
    await repository.saveMethod(db, { ...input, ...patch });
  // These settlement fixtures model cards already held before the test months.
  await db.runAsync(
    "UPDATE card_benefit_versions SET effectiveMonth = '1000-01'",
  );
  const cards = (await repository.readMethods(db))
    .filter((method) => method.kind === "card")
    .sort((a, b) => a.id - b.id);
  return { bank, fixed: cards[0], first: cards[1], second: cards[2], input };
}

test("monthly benefit confirmation stores zero and snapshots once per card, preserves ledger totals and history after edits or deletion", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { fixed, first, second, input } = await seedSettlementCards(db);
    await repository.saveExpense(db, { ...insuranceInput, methodId: first.id });
    const entries = await ledgerRepository.loadLedgerMonth(db, "2024-02");
    const methods = await repository.readMethods(db);
    const preview = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-02",
    );
    assert.equal(preview.confirmed, false);
    assert.equal(
      cardBenefitDomain.cardBenefitMonthSummary(preview).total,
      18000,
    );
    assert.equal(
      preview.cards.filter((card) => card.amount === null).length,
      2,
    );
    await cardBenefitRepository.saveCardBenefitMonth(db, "2024-02", [
      { methodId: first.id, amount: 0 },
      { methodId: second.id, amount: 1200 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-02",
    );
    assert.equal(confirmed.confirmed, true);
    assert.equal(
      cardBenefitDomain.cardBenefitMonthSummary(confirmed).total,
      11200,
    );
    assert.equal(
      confirmed.cards.find((card) => card.methodId === first.id).amount,
      0,
    );
    assert.equal(
      confirmed.cards.filter((card) => card.name === "같은 카드").length,
      2,
    );
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(
      await ledgerRepository.readLedgerMonth(db, "2024-02"),
      entries,
    );
    const march = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-03",
    );
    assert.equal(march.confirmed, false);
    assert.equal(cardBenefitDomain.cardBenefitMonthSummary(march).total, 18000);
    await repository.saveMethod(
      db,
      {
        ...input,
        name: "바뀐 고정 카드",
        benefitTypeCode: "fixed",
        benefitAmount: 20000,
      },
      fixed.id,
    );
    await repository.deleteMethod(db, first.id);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, "2024-02"),
      confirmed,
    );
    const next = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-03",
    );
    assert.equal(cardBenefitDomain.cardBenefitMonthSummary(next).total, 18000);
    await cardBenefitRepository.saveCardBenefitMonth(db, "2024-02", [
      { methodId: first.id, amount: 600 },
      { methodId: second.id, amount: 0 },
    ]);
    const edited = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-02",
    );
    assert.equal(
      cardBenefitDomain.cardBenefitMonthSummary(edited).total,
      10600,
    );
    assert.equal(
      edited.cards.find((card) => card.methodId === fixed.id).amount,
      10000,
    );
    assert.equal(
      edited.cards.find((card) => card.methodId === fixed.id).name,
      "고정 카드",
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("benefit confirmation rejects incomplete, duplicate and invalid values, rolls back partial writes and preserves previous confirmations", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { first, second, fixed } = await seedSettlementCards(db);
    const inputs = [
      { methodId: first.id, amount: 0 },
      { methodId: second.id, amount: 3000 },
    ];
    for (const invalid of [
      [],
      inputs.slice(0, 1),
      [inputs[0], inputs[0]],
      [{ methodId: fixed.id, amount: 0 }, inputs[1]],
      ...[-1, 0.5, NaN, Infinity, 1000000000, null].map((amount) => [
        { ...inputs[0], amount },
        inputs[1],
      ]),
    ])
      await assert.rejects(
        cardBenefitRepository.saveCardBenefitMonth(db, "2026-04", invalid),
        /변동 카드별/,
      );
    for (const month of ["2026-00", "2026-13", "0000-01", "2026-4"])
      await assert.rejects(
        cardBenefitRepository.saveCardBenefitMonth(db, month, inputs),
        /월을/,
      );
    const run = db.runAsync;
    let writes = 0;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.includes("INSERT INTO monthly_card_benefits") && ++writes === 2)
        throw new Error("Simulated settlement failure");
      return result;
    };
    await assert.rejects(
      cardBenefitRepository.saveCardBenefitMonth(db, "2026-04", inputs),
      /Simulated settlement failure/,
    );
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM monthly_card_benefits"),
      [],
    );
    db.runAsync = run;
    await cardBenefitRepository.saveCardBenefitMonth(db, "2026-04", inputs);
    const before = await db.getAllAsync(
      "SELECT * FROM monthly_card_benefits ORDER BY id",
    );
    writes = 0;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.includes("INSERT INTO monthly_card_benefits") && ++writes === 2)
        throw new Error("Simulated edit failure");
      return result;
    };
    await assert.rejects(
      cardBenefitRepository.saveCardBenefitMonth(
        db,
        "2026-04",
        inputs.map((input) => ({ ...input, amount: 9000 })),
      ),
      /Simulated edit failure/,
    );
    db.runAsync = run;
    assert.deepEqual(
      await db.getAllAsync("SELECT * FROM monthly_card_benefits ORDER BY id"),
      before,
    );
    for (const sql of [
      "UPDATE monthly_card_benefits SET amount = -1",
      "UPDATE monthly_card_benefits SET amount = NULL",
      "UPDATE monthly_card_benefits SET benefitTypeCode = 'unknown'",
      "UPDATE monthly_card_benefits SET month = '2026-13'",
      "UPDATE monthly_card_benefits SET amount = 1 WHERE benefitTypeCode = 'fixed'",
    ])
      await assert.rejects(db.runAsync(sql), /constraint/);
  } finally {
    db.sqlite.close();
  }
});

test("v13 settlement migration preserves legacy data, rolls back and retries, and confirmed records survive reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-settlement-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    const { first, second } = await seedSettlementCards(db);
    await repository.saveExpense(db, { ...insuranceInput, methodId: first.id });
    const ledger = await ledgerRepository.loadLedgerMonth(db, "2026-10");
    const methods = await repository.readMethods(db);
    const expenses = await repository.readExpenses(db);
    await db.execAsync(
      "DROP TABLE monthly_card_benefits; PRAGMA user_version = 13;",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 14;")
        throw new Error("Simulated settlement migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated settlement migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      13,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'monthly_card_benefits'",
      ),
      undefined,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(await repository.readExpenses(db), expenses);
    assert.deepEqual(
      await ledgerRepository.readLedgerMonth(db, "2026-10"),
      ledger,
    );
    await cardBenefitRepository.saveCardBenefitMonth(db, "2026-10", [
      { methodId: first.id, amount: 999999999 },
      { methodId: second.id, amount: 0 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2026-10",
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, "2026-10"),
      confirmed,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("benefit month snapshots reject stale responses, refresh after writes and recover from failed reads", async () => {
  const requests = [];
  const store = {
    busy: false,
    dataRevision: 0,
    loadCardBenefitMonth: (month) =>
      new Promise((resolve, reject) =>
        requests.push({ month, resolve, reject }),
      ),
  };
  const runtime = hookRuntime("src/hooks/use-card-benefit-month.ts", {
    "./use-month-pin": { useMonthPin: () => store },
  });
  const render = (month = "2024-02", active = true) =>
    runtime.render(({ useCardBenefitMonth }) =>
      useCardBenefitMonth(month, active),
    );
  render();
  runtime.flush();
  render("2024-03");
  runtime.flush();
  requests[0].resolve({ month: "2024-02", confirmed: true, cards: [] });
  await settle();
  assert.equal(render("2024-03").snapshot, null);
  requests[1].reject(new Error("read failed"));
  await settle();
  let view = render("2024-03");
  assert.ok(view.error);
  view.retry();
  render("2024-03");
  runtime.flush();
  requests[2].resolve({ month: "2024-03", confirmed: true, cards: [] });
  await settle();
  assert.equal(render("2024-03").snapshot.confirmed, true);
  store.busy = true;
  assert.equal(render("2024-03").snapshot, null);
  runtime.flush();
  store.busy = false;
  store.dataRevision++;
  render("2024-03");
  runtime.flush();
  requests[3].resolve({ month: "2024-03", confirmed: false, cards: [] });
  await settle();
  assert.equal(render("2024-03").snapshot.confirmed, false);
  render("2024-03", false);
  runtime.flush();
  assert.equal(requests.length, 4);
  render("2024-03");
  runtime.flush();
  assert.equal(requests.length, 5);
});

test("calendar marks only each month's last day for benefit settlement, including leap February and months with no expenses", () => {
  const runtime = hookRuntime("src/components/ledger-calendar.tsx", {
    "react-native": {
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { create: (value) => value },
    },
    "./typography": { AppText: "Text" },
    "../utils/ledger": ledgerDomain,
    "../utils/expenses": domain,
    "./ui": { colors: { orange: "#E67824", green: "#16835D" } },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  for (const [month, lastDay] of [
    ["2024-02", 29],
    ["2026-02", 28],
    ["2026-04", 30],
    ["2026-10", 31],
  ]) {
    let selected;
    const render = (benefitsConfirmed, entries = [], dataReady = true) =>
      flatten(
        runtime.render(({ LedgerCalendar }) =>
          LedgerCalendar({
            month,
            entries,
            dataReady,
            selectedDay: 1,
            benefitsConfirmed,
            benefitsPending: !benefitsConfirmed,
            onSelect: (day) => (selected = day),
          }),
        ),
      );
    let cells = render(false).filter((node) =>
      node.props?.accessibilityLabel?.includes("카드 혜택 정산"),
    );
    assert.equal(cells.length, 1);
    const flattenedStyle = (style) => Object.assign({}, ...[style].flat());
    const dots = (cell) =>
      flatten(cell).filter(
        (node) =>
          node.type === "View" && flattenedStyle(node.props.style).width === 6,
      );
    const dotColors = (cell) =>
      dots(cell).map(
        (node) => flattenedStyle(node.props.style).backgroundColor,
      );
    assert.deepEqual(dotColors(cells[0]), ["#16835D"]);
    const children = cells[0].props.children.filter(Boolean);
    assert.equal(children.at(-1).type, "View");
    assert.equal(children[0].type, "Text");
    assert.equal(
      children.some(
        (node) =>
          node.type === "Text" &&
          typeof node.props.children === "string" &&
          node.props.children.includes("혜택"),
      ),
      false,
    );
    assert.ok(cells[0].props.accessibilityLabel.includes(`${lastDay}일`));
    cells[0].props.onPress();
    assert.equal(selected, lastDay);
    cells = render(true).filter((node) =>
      node.props?.accessibilityLabel?.includes("카드 혜택 정산"),
    );
    assert.ok(cells[0].props.accessibilityLabel.includes("확정 완료"));
    assert.equal(dots(cells[0]).length, 0);
    const pendingCells = render(
      false,
      [
        { id: 1, day: lastDay, amount: null },
        { id: 2, day: 1, amount: 12345 },
      ],
      false,
    ).filter((node) => node.type === "Pressable");
    assert.equal(pendingCells.length, lastDay);
    for (const cell of pendingCells) {
      assert.ok(cell.props.accessibilityLabel.endsWith("내역 조회 전"));
      assert.equal(dots(cell).length, 0);
      assert.equal(
        flatten(cell).filter((node) => node.type === "Text").length,
        1,
      );
    }
    pendingCells.at(-1).props.onPress();
    assert.equal(selected, lastDay);
    for (const confirmed of [false, true]) {
      const withPendingExpense = render(confirmed, [
        { id: 1, day: lastDay, amount: null },
      ]).find((node) =>
        node.props?.accessibilityLabel?.includes("카드 혜택 정산"),
      );
      assert.deepEqual(
        dotColors(withPendingExpense),
        confirmed ? ["#E67824"] : ["#E67824", "#16835D"],
      );
    }
  }
});

test("benefit form requires every variable actual, accepts zero, prevents duplicate submits and keeps edits after a failed save", async () => {
  let fail = false;
  let resolveSave;
  const saves = [];
  let closed = 0;
  const snapshot = {
    month: "2024-02",
    confirmed: false,
    cards: [
      {
        methodId: 1,
        name: "고정",
        providerName: "국민",
        benefitTypeCode: "fixed",
        expectedAmount: 10000,
        amount: 10000,
      },
      {
        methodId: 2,
        name: "동일 이름",
        providerName: "삼성",
        benefitTypeCode: "variable",
        expectedAmount: 5000,
        amount: null,
      },
      {
        methodId: 3,
        name: "동일 이름",
        providerName: "국민",
        benefitTypeCode: "variable",
        expectedAmount: 3000,
        amount: null,
      },
    ],
  };
  const runtime = hookRuntime("src/components/card-benefit-form.tsx", {
    "react-native": { View: "View" },
    "./typography": { AppText: "Text" },
    "../hooks/use-month-pin": {
      useMonthPin: () => ({
        busy: false,
        methods: [],
        saveCardBenefitMonth: (month, inputs) => {
          saves.push({ month, inputs });
          if (fail) return Promise.reject(new Error("save failed"));
          return new Promise((resolve) => (resolveSave = resolve));
        },
      }),
    },
    "../utils/expenses": domain,
    "../utils/ledger": ledgerDomain,
    "./ui": {
      Button: "Button",
      Field: "Field",
      FieldMessage: "FieldMessage",
      s: {},
      useFormNavigation: () => null,
    },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = (current = snapshot) =>
    flatten(
      runtime.render(({ CardBenefitForm }) =>
        CardBenefitForm({ snapshot: current, onClose: () => closed++ }),
      ),
    );
  const fields = () =>
    render()
      .filter((node) => node.props?.card)
      .map((node) => node.props);
  const button = () => render().find((node) => node.type === "Button").props;
  assert.equal(fields().length, 2);
  assert.ok(fields().every((field) => field.error === ""));
  assert.deepEqual(
    fields().map((field) => field.value),
    ["5,000", "3,000"],
  );
  assert.equal(saves.length, 0);
  fields()[0].onChange("");
  fields()[1].onChange("");
  button().onPress();
  assert.equal(saves.length, 0);
  assert.ok(fields().every((field) => field.error));
  fields()[0].onChange("0");
  fields()[1].onChange("1,250");
  assert.ok(fields().every((field) => field.error === ""));
  fail = true;
  button().onPress();
  await settle();
  assert.equal(closed, 0);
  assert.equal(fields()[1].value, "1,250");
  assert.equal(
    render().find((node) => node.type === "FieldMessage").props.error,
    "save failed",
  );
  fail = false;
  button().onPress();
  button().onPress();
  assert.equal(saves.length, 2);
  assert.deepEqual(saves[1], {
    month: "2024-02",
    inputs: [
      { methodId: 2, amount: 0 },
      { methodId: 3, amount: 1250 },
    ],
  });
  resolveSave();
  await settle();
  assert.equal(closed, 1);
});

test("benefit edits preserve earlier unconfirmed months and already confirmed actuals while replacing later scheduled estimates", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { first, second, input } = await seedSettlementCards(db);
    const now = ledgerDomain.monthKey();
    const earlier = ledgerDomain.moveMonth(now, -2);
    const next = ledgerDomain.moveMonth(now, 1);
    const later = ledgerDomain.moveMonth(now, 2);
    const confirmedMonth = ledgerDomain.moveMonth(now, 3);
    await cardBenefitRepository.saveCardBenefitMonth(db, confirmedMonth, [
      { methodId: first.id, amount: 7000 },
      { methodId: second.id, amount: 0 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      confirmedMonth,
    );
    await repository.saveMethod(
      db,
      { ...input, benefitTypeCode: "fixed", benefitAmount: 9000 },
      first.id,
      later,
    );
    const summary = async (month) =>
      cardBenefitDomain.cardBenefitMonthSummary(
        await cardBenefitRepository.loadCardBenefitMonth(db, month),
      );
    assert.equal((await summary(earlier)).total, 18000);
    assert.equal((await summary(now)).total, 18000);
    assert.equal((await summary(next)).total, 18000);
    assert.equal((await summary(later)).total, 22000);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, confirmedMonth),
      confirmed,
    );
    await repository.saveMethod(
      db,
      { ...input, benefitAmount: 6000 },
      first.id,
      next,
    );
    assert.equal((await summary(earlier)).total, 18000);
    assert.equal((await summary(next)).total, 19000);
    assert.equal((await summary(later)).total, 19000);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, confirmedMonth),
      confirmed,
    );
    assert.deepEqual(
      (
        await db.getAllAsync(
          "SELECT effectiveMonth FROM card_benefit_versions WHERE methodId = ? ORDER BY effectiveMonth",
          first.id,
        )
      ).map((row) => row.effectiveMonth),
      ["1000-01", next],
    );
    await repository.saveMethod(
      db,
      { ...input, name: "renamed", benefitAmount: 6000 },
      first.id,
    );
    const current = await cardBenefitRepository.loadCardBenefitMonth(db, now);
    assert.equal(
      current.cards.find((card) => card.methodId === first.id).expectedAmount,
      5000,
    );
    assert.equal((await summary(later)).total, 19000);
    assert.equal(
      (
        await cardBenefitRepository.loadCardBenefitMonth(db, earlier)
      ).cards.find((card) => card.methodId === first.id).name,
      input.name,
    );
  } finally {
    db.sqlite.close();
  }
});

test("deleting a card preserves past and current estimates, excludes the next month and retains future confirmations", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { first, second, input } = await seedSettlementCards(db);
    const now = ledgerDomain.monthKey();
    const previous = ledgerDomain.moveMonth(now, -1);
    const next = ledgerDomain.moveMonth(now, 1);
    const later = ledgerDomain.moveMonth(now, 2);
    await repository.saveExpense(db, { ...insuranceInput, methodId: first.id });
    const entries = await ledgerRepository.loadLedgerMonth(db, now);
    await cardBenefitRepository.saveCardBenefitMonth(db, later, [
      { methodId: first.id, amount: 700 },
      { methodId: second.id, amount: 0 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      later,
    );
    await repository.saveMethod(
      db,
      { ...input, benefitAmount: 9000 },
      first.id,
      later,
    );
    await repository.deleteMethod(db, first.id);
    assert.ok(
      !(await repository.readMethods(db)).some((card) => card.id === first.id),
    );
    for (const month of [previous, now]) {
      const preview = await cardBenefitRepository.loadCardBenefitMonth(
        db,
        month,
      );
      assert.equal(preview.confirmed, false);
      assert.equal(
        preview.cards.find((card) => card.methodId === first.id).expectedAmount,
        5000,
      );
    }
    assert.equal(
      (await cardBenefitRepository.loadCardBenefitMonth(db, next)).cards.some(
        (card) => card.methodId === first.id,
      ),
      false,
    );
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, later),
      confirmed,
    );
    assert.deepEqual(await ledgerRepository.readLedgerMonth(db, now), entries);
    assert.equal((await repository.readExpenses(db))[0].methodId, null);
    // A deleted card can still be finalized in a preserved month and edited again.
    await cardBenefitRepository.saveCardBenefitMonth(db, previous, [
      { methodId: first.id, amount: 0 },
      { methodId: second.id, amount: 1500 },
    ]);
    await cardBenefitRepository.saveCardBenefitMonth(db, previous, [
      { methodId: first.id, amount: 100 },
      { methodId: second.id, amount: 0 },
    ]);
    assert.equal(
      cardBenefitDomain.cardBenefitMonthSummary(
        await cardBenefitRepository.loadCardBenefitMonth(db, previous),
      ).total,
      10100,
    );
  } finally {
    db.sqlite.close();
  }
});

test("new cards start this month, bank deletion keeps card benefits, and invalid or failed changes roll back card settings and history", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveMethod(db, bankInput);
    const bank = (await repository.readMethods(db))[0];
    const input = {
      ...cardBenefitDefaults,
      kind: "card",
      providerCode: "card_samsung",
      name: "new card",
      bankId: bank.id,
      cardTypeCode: "credit",
      settlementDay: 25,
      benefitAmount: 5000,
    };
    await repository.saveMethod(db, input);
    const card = (await repository.readMethods(db)).find(
      (method) => method.kind === "card",
    );
    const now = ledgerDomain.monthKey();
    assert.deepEqual(
      (
        await cardBenefitRepository.loadCardBenefitMonth(
          db,
          ledgerDomain.moveMonth(now, -1),
        )
      ).cards,
      [],
    );
    assert.equal(
      (await cardBenefitRepository.loadCardBenefitMonth(db, now)).cards[0]
        .expectedAmount,
      5000,
    );
    const methods = await repository.readMethods(db);
    const history = await db.getAllAsync(
      "SELECT * FROM card_benefit_versions ORDER BY methodId, effectiveMonth",
    );
    for (const month of ["2026-13", "nope", ledgerDomain.moveMonth(now, -1)])
      await assert.rejects(
        repository.saveMethod(
          db,
          { ...input, benefitAmount: 9000 },
          card.id,
          month,
        ),
      );
    assert.deepEqual(await repository.readMethods(db), methods);
    const run = db.runAsync;
    db.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...params);
      if (sql.includes("INSERT INTO card_benefit_versions"))
        throw new Error("Simulated benefit history failure");
      return result;
    };
    await assert.rejects(
      repository.saveMethod(db, { ...input, benefitAmount: 9000 }, card.id),
      /Simulated benefit history failure/,
    );
    await assert.rejects(
      repository.deleteMethod(db, card.id),
      /Simulated benefit history failure/,
    );
    db.runAsync = run;
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(
      await db.getAllAsync(
        "SELECT * FROM card_benefit_versions ORDER BY methodId, effectiveMonth",
      ),
      history,
    );
    await repository.deleteMethod(db, bank.id);
    assert.equal(
      (await cardBenefitRepository.loadCardBenefitMonth(db, now)).cards[0]
        .expectedAmount,
      5000,
    );
    assert.equal((await repository.readMethods(db))[0].bankId, null);
    await assert.rejects(
      db.runAsync("UPDATE card_benefit_versions SET expectedAmount = -1"),
      /constraint/,
    );
    await assert.rejects(
      db.runAsync("UPDATE card_benefit_versions SET benefitTypeCode = NULL"),
      /constraint/,
    );
    await assert.rejects(
      db.runAsync(
        "UPDATE card_benefit_versions SET effectiveMonth = '2026-13'",
      ),
      /constraint/,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("v14 benefit history migration preserves confirmations and unvisited estimates, rolls back and remains stable across reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "month-pin-benefit-history-"));
  const path = join(directory, "month-pin.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    const { first, second } = await seedSettlementCards(db);
    const now = ledgerDomain.monthKey();
    const before = ledgerDomain.moveMonth(now, -2);
    await cardBenefitRepository.saveCardBenefitMonth(db, before, [
      { methodId: first.id, amount: 0 },
      { methodId: second.id, amount: 700 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      before,
    );
    const methods = await repository.readMethods(db);
    await db.execAsync(
      "DROP TABLE card_benefit_versions; PRAGMA user_version = 14;",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 15;")
        throw new Error("Simulated history migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /Simulated history migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      14,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'card_benefit_versions'",
      ),
      undefined,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await repository.readMethods(db), methods);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, before),
      confirmed,
    );
    const unvisited = ledgerDomain.moveMonth(now, -4);
    assert.equal(
      cardBenefitDomain.cardBenefitMonthSummary(
        await cardBenefitRepository.loadCardBenefitMonth(db, unvisited),
      ).total,
      18000,
    );
    await repository.deleteMethod(db, first.id);
    const retained = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      unvisited,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    await repository.initializeDatabase(db);
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, before),
      confirmed,
    );
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, unvisited),
      retained,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("card edits expose the same effective-month picker as expenses and submit the selected month", async () => {
  const now = ledgerDomain.monthKey();
  const calls = [];
  const method = {
    ...cardBenefitDefaults,
    id: 8,
    provider: "삼성카드",
    providerCode: "card_samsung",
    kind: "card",
    name: "card",
    bankId: 1,
    cardTypeCode: "credit",
    settlementDay: 25,
    benefitAmount: 5000,
  };
  const fixture = methodFormFixture({
    method,
    methods: [{ ...bankInput, id: 1, provider: "국민은행" }],
    saveMethod: async (input, id, effectiveMonth) =>
      calls.push({ input, id, effectiveMonth }),
  });
  assert.equal(fixture.component("MonthField"), undefined);
  fixture.control("월 고정 혜택").onChangeText("9000");
  assert.equal(fixture.control("변경 적용 월").minimumMonth, now);
  const next = ledgerDomain.moveMonth(now, 1);
  fixture.control("변경 적용 월").onChange(next);
  fixture.control("저장").onPress();
  await settle();
  assert.equal(calls[0].id, 8);
  assert.equal(calls[0].effectiveMonth, next);
  assert.equal(calls[0].input.benefitAmount, 9000);
});

test("entered variable expense amounts remain editable, including a previously entered zero", async () => {
  const native = {
    Pressable: "Pressable",
    View: "View",
    StyleSheet: { create: (value) => value },
  };
  let opened = 0;
  const runtime = hookRuntime("src/components/ledger-entry-row.tsx", {
    "react-native": native,
    "./typography": { AppText: "Text" },
    "@expo/vector-icons/Ionicons": "Icon",
    "../data/method-types": loadTypeScript("src/data/method-types.ts"),
    "../data/expense-types": loadTypeScript("src/data/expense-types.ts"),
    "../utils/expenses": domain,
    "./provider-icon": { ProviderIcon: "ProviderIcon" },
    "./ui": { colors: {} },
  });
  const row = runtime.render(({ LedgerEntryRow }) =>
    LedgerEntryRow({
      entry: {
        id: 1,
        name: "variable",
        amountTypeCode: "variable",
        amount: 0,
        amountEntered: true,
        methodKind: null,
      },
      disabled: false,
      onPress: () => opened++,
    }),
  );
  assert.equal(row.type, "Pressable");
  assert.equal(row.props.disabled, false);
  row.props.onPress();
  assert.equal(opened, 1);
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await repository.saveExpense(db, {
      ...insuranceInput,
      amountTypeCode: "variable",
      amount: null,
    });
    const entry = (
      await ledgerRepository.loadLedgerMonth(db, ledgerDomain.monthKey())
    )[0];
    await ledgerRepository.saveLedgerAmount(db, entry.id, 0);
    await ledgerRepository.saveLedgerAmount(db, entry.id, 12345);
    assert.equal(
      (await ledgerRepository.readLedgerMonth(db, entry.month))[0].amount,
      12345,
    );
    assert.equal(
      (await ledgerRepository.readLedgerMonth(db, entry.month))[0]
        .amountEntered,
      true,
    );
  } finally {
    db.sqlite.close();
  }
});

test("benefit form prefills estimates but confirms only on submit and preserves saved actuals including zero", async () => {
  for (const confirmed of [false, true]) {
    const snapshot = {
      month: "2026-10",
      confirmed,
      cards: [
        {
          methodId: 1,
          name: "first",
          providerName: "card",
          benefitTypeCode: "variable",
          expectedAmount: 5000,
          amount: confirmed ? 0 : null,
        },
        {
          methodId: 2,
          name: "second",
          providerName: "card",
          benefitTypeCode: "variable",
          expectedAmount: 0,
          amount: confirmed ? 2500 : null,
        },
      ],
    };
    const original = structuredClone(snapshot);
    const calls = [];
    let closed = 0;
    const runtime = hookRuntime("src/components/card-benefit-form.tsx", {
      "react-native": { View: "View" },
      "./typography": { AppText: "Text" },
      "../hooks/use-month-pin": {
        useMonthPin: () => ({
          busy: false,
          methods: [
            { id: 1, cardTypeCode: "credit" },
            { id: 2, cardTypeCode: "debit" },
          ],
          saveCardBenefitMonth: async (month, inputs) =>
            calls.push({ month, inputs }),
        }),
      },
      "../utils/expenses": domain,
      "../utils/ledger": ledgerDomain,
      "./ui": {
        Button: "Button",
        Field: "Field",
        FieldMessage: "FieldMessage",
        s: {},
        useFormNavigation: () => null,
      },
    });
    const flatten = (node) =>
      Array.isArray(node)
        ? node.flatMap(flatten)
        : node && typeof node === "object"
          ? [node, ...flatten(node.props?.children)]
          : [];
    const nodes = flatten(
      runtime.render(({ CardBenefitForm }) =>
        CardBenefitForm({ snapshot, onClose: () => closed++ }),
      ),
    );
    const fields = nodes.filter((node) => node.props?.card);
    assert.deepEqual(
      fields.map((node) => node.props.value),
      confirmed ? ["2,500", "0"] : ["0", "5,000"],
    );
    assert.equal(calls.length, 0);
    assert.deepEqual(snapshot, original);
    nodes.find((node) => node.type === "Button").props.onPress();
    await settle();
    assert.deepEqual(calls, [
      {
        month: "2026-10",
        inputs: [
          { methodId: 2, amount: confirmed ? 2500 : 0 },
          { methodId: 1, amount: confirmed ? 0 : 5000 },
        ],
      },
    ]);
    assert.equal(closed, 1);
    assert.deepEqual(snapshot, original);
  }
});

test("annual summary matches all twelve calendars, keeps actual zero and confirmed benefits, and remains idempotent", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { first, second } = await seedSettlementCards(db);
    await repository.saveExpense(db, {
      ...insuranceInput,
      startMonth: "2024-01",
    });
    const fixed = (await repository.readExpenses(db))[0];
    // A historical price change, including months not previously opened.
    await db.runAsync(
      "INSERT INTO expense_amount_versions (expenseId, effectiveMonth, amountTypeCode, amount) VALUES (?, '2024-07', 'fixed', 60000)",
      fixed.id,
    );
    await repository.saveExpense(db, {
      ...insuranceInput,
      startMonth: "2024-01",
      name: "보험료",
      amountTypeCode: "variable",
      amount: null,
    });
    for (const [month, amount] of [
      ["2024-02", 0],
      ["2024-03", 15000],
    ]) {
      const entry = (await ledgerRepository.loadLedgerMonth(db, month)).find(
        (entry) => entry.amountTypeCode === "variable",
      );
      await ledgerRepository.saveLedgerAmount(db, entry.id, amount);
    }
    await cardBenefitRepository.saveCardBenefitMonth(db, "2024-02", [
      { methodId: first.id, amount: 0 },
      { methodId: second.id, amount: 2000 },
    ]);
    const confirmed = await cardBenefitRepository.loadCardBenefitMonth(
      db,
      "2024-02",
    );
    const annual = await annualRepository.loadAnnualSummary(db, 2024);
    assert.equal(annual.months.length, 12);
    assert.deepEqual(
      annual.months.map((month) => month.month),
      annualDomain.monthsOfYear(2024),
    );
    assert.deepEqual(annualDomain.annualTotals(annual), {
      expenseTotal: 675000,
      benefitTotal: 210000,
      estimatedTotal: 465000,
      expenseCount: 24,
      pendingExpenses: 10,
      pendingBenefitMonths: 11,
      benefitCount: 36,
    });
    for (const month of annual.months) {
      const ledger = ledgerDomain.ledgerSummary(
        await ledgerRepository.loadLedgerMonth(db, month.month),
      );
      const benefits = cardBenefitDomain.cardBenefitMonthSummary(
        await cardBenefitRepository.loadCardBenefitMonth(db, month.month),
      );
      assert.equal(month.expenseTotal, ledger.total);
      assert.equal(month.pendingExpenses, ledger.pending);
      assert.equal(month.benefitTotal, benefits.total);
      assert.equal(month.pendingBenefits, benefits.pending);
    }
    const leapFebruary = await ledgerRepository.loadLedgerMonth(db, "2024-02");
    assert.ok(leapFebruary.every((entry) => entry.day === 29));
    assert.equal(
      leapFebruary.find((entry) => entry.amountTypeCode === "variable").amount,
      0,
    );
    assert.deepEqual(
      await annualRepository.loadAnnualSummary(db, 2024),
      annual,
    );
    assert.deepEqual(
      await cardBenefitRepository.loadCardBenefitMonth(db, "2024-02"),
      confirmed,
    );
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS count FROM ledger_entries"))
        .count,
      24,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("annual summary respects expense end/deletion and card benefit history without losing past values", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const now = new Date();
    const year = now.getFullYear();
    const throughMonth = now.getMonth() + 1;
    const { first } = await seedSettlementCards(db);
    await repository.saveExpense(db, {
      ...insuranceInput,
      startMonth: `${year}-01`,
    });
    const expense = (await repository.readExpenses(db))[0];
    const before = await annualRepository.loadAnnualSummary(db, year);
    await repository.deleteExpense(db, expense.id);
    await repository.deleteMethod(db, first.id);
    const after = await annualRepository.loadAnnualSummary(db, year);
    assert.equal(
      annualDomain.annualTotals(after).expenseTotal,
      throughMonth * 50000,
    );
    for (let index = 0; index < 12; index++) {
      assert.equal(
        after.months[index].expenseTotal,
        index < throughMonth ? 50000 : 0,
      );
      assert.equal(
        after.months[index].benefitTotal,
        before.months[index].benefitTotal - (index < throughMonth ? 0 : 5000),
      );
    }
    assert.equal(annualDomain.annualTotals(before).expenseTotal, 600000);
  } finally {
    db.sqlite.close();
  }
});

test("annual reads validate years, show empty and negative totals, and roll back generated months after a failure", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    for (const year of [999, 10000, 2024.5, NaN, "2024"])
      await assert.rejects(
        annualRepository.loadAnnualSummary(db, year),
        /연도/,
      );
    assert.equal(annualDomain.monthsOfYear(1000)[0], "1000-01");
    assert.equal(annualDomain.monthsOfYear(9999)[11], "9999-12");
    const empty = await annualRepository.loadAnnualSummary(db, 2024);
    assert.equal(empty.months.length, 12);
    assert.ok(
      Object.values(annualDomain.annualTotals(empty)).every(
        (value) => value === 0,
      ),
    );
    await seedSettlementCards(db);
    const benefitsOnly = await annualRepository.loadAnnualSummary(db, 2024);
    assert.equal(
      annualDomain.annualTotals(benefitsOnly).estimatedTotal,
      -216000,
    );
    await repository.saveExpense(db, {
      ...insuranceInput,
      startMonth: "2024-01",
    });
    const fail = {
      ...db,
      getAllAsync: async (sql, ...params) => {
        if (
          sql.includes("FROM monthly_card_benefits") &&
          params[0] === "2024-06"
        )
          throw new Error("annual read failed");
        return db.getAllAsync(sql, ...params);
      },
    };
    await assert.rejects(
      annualRepository.loadAnnualSummary(fail, 2024),
      /annual read failed/,
    );
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS count FROM ledger_entries"))
        .count,
      0,
    );
    assert.equal(
      annualDomain.annualTotals(
        await annualRepository.loadAnnualSummary(db, 2024),
      ).expenseTotal,
      600000,
    );
  } finally {
    db.sqlite.close();
  }
});

test("annual hook rejects stale years and revisions, pauses on tax view, retries errors, and refreshes on return", async () => {
  const requests = [];
  const store = {
    busy: false,
    dataRevision: 0,
    loadAnnualSummary: (year) =>
      new Promise((resolve, reject) =>
        requests.push({ year, resolve, reject }),
      ),
  };
  const runtime = hookRuntime("src/hooks/use-annual-summary.ts", {
    "./use-month-pin": { useMonthPin: () => store },
  });
  const render = (year = 2024, enabled = true) =>
    runtime.render(({ useAnnualSummary }) => useAnnualSummary(year, enabled));
  assert.equal(render().loading, true);
  runtime.flush();
  render(2025);
  runtime.flush();
  requests[1].resolve({ year: 2025, months: [] });
  await settle();
  requests[0].resolve({ year: 2024, months: [] });
  await settle();
  assert.equal(render(2025).snapshot.year, 2025);
  store.dataRevision++;
  assert.equal(render(2025).snapshot, null);
  runtime.flush();
  requests[2].reject(new Error("failed"));
  await settle();
  assert.ok(render(2025).error);
  render(2025).retry();
  assert.equal(render(2025).error, null);
  runtime.flush();
  render(2025, false);
  runtime.flush();
  requests[3].resolve({ year: 2025, months: [] });
  await settle();
  assert.equal(render(2025, false).snapshot, null);
  assert.equal(render(2025, false).loading, false);
  runtime.flush();
  assert.equal(requests.length, 4);
  render(2025);
  runtime.flush();
  requests[4].resolve({ year: 2025, months: [] });
  await settle();
  assert.equal(render(2025).snapshot.year, 2025);
  store.busy = true;
  assert.equal(render(2025).snapshot, null);
  runtime.flush();
  store.busy = false;
  render(2025);
  runtime.flush();
  requests[5].resolve({ year: 2025, months: [] });
  await settle();
  runtime.focus(false);
  runtime.focus(true);
  assert.equal(render(2025).snapshot, null);
  requests[6].resolve({ year: 2025, months: [] });
  await settle();
  assert.equal(render(2025).snapshot.year, 2025);
});

test("settlement starts with annual summary and switches views without discarding the annual screen", () => {
  const runtime = hookRuntime("src/app/(tabs)/settlement.tsx", {
    "react-native": {
      View: "View",
      StyleSheet: { create: (styles) => styles },
    },
    "../../components/annual-summary-view": { AnnualSummaryView: "Annual" },
    "../../components/year-end-tax-view": { YearEndTaxView: "Tax" },
    "../../components/list-controls": { ListTabs: "Tabs" },
    "../../components/ui": {
      Header: "Header",
      Screen: "Screen",
      s: { flex: {} },
    },
    "../../data/settlement-types": loadTypeScript(
      "src/data/settlement-types.ts",
    ),
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = () =>
    flatten(
      runtime.render(({ default: SettlementScreen }) => SettlementScreen()),
    );
  let nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "Tabs").props.value,
    "annual_summary",
  );
  assert.equal(nodes.find((node) => node.type === "Annual").props.active, true);
  const selectedYear = new Date().getFullYear() - 1;
  nodes.find((node) => node.type === "Annual").props.onYearChange(selectedYear);
  nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "Annual").props.year,
    selectedYear,
  );
  const options = nodes.find((node) => node.type === "Tabs").props.options;
  assert.deepEqual(
    options.map((option) => option.label),
    ["고정비", "연말정산"],
  );
  nodes.find((node) => node.type === "Tabs").props.onChange("year_end_tax");
  nodes = render();
  const taxKey = nodes.find((node) => node.type === "Tax").key;
  assert.equal(nodes.find((node) => node.type === "Tax").props.active, true);
  assert.equal(
    nodes.find((node) => node.type === "Tax").props.year,
    selectedYear,
  );
  assert.ok(!nodes.some((node) => node.type === "YearSelector"));
  const taxYear = selectedYear - 1;
  nodes.find((node) => node.type === "Tax").props.onYearChange(taxYear);
  nodes = render();
  assert.equal(nodes.find((node) => node.type === "Tax").props.year, taxYear);
  assert.equal(nodes.find((node) => node.type === "Tax").key, taxKey);
  assert.equal(
    nodes.find((node) => node.type === "Annual").props.active,
    false,
  );
  assert.equal(
    nodes.find((node) => node.props?.children?.type === "Annual").props
      .accessibilityElementsHidden,
    true,
  );
  assert.equal(
    nodes.find((node) => node.props?.children?.type === "Tax").props
      .accessibilityElementsHidden,
    false,
  );
  runtime.focus(false);
  runtime.focus(true);
  assert.equal(
    render().find((node) => node.type === "Tabs").props.value,
    "year_end_tax",
  );
  nodes.find((node) => node.type === "Tabs").props.onChange("annual_summary");
  assert.equal(
    render().find((node) => node.type === "Annual").props.year,
    taxYear,
  );
  assert.equal(
    render().find((node) => node.type === "Annual").props.active,
    true,
  );
});

test("annual view keeps totals and all twelve months through loading, empty years and retry states", () => {
  const requests = [];
  let state = { snapshot: null, loading: true, error: null };
  let retries = 0;
  const yearChanges = [];
  const runtime = hookRuntime("src/components/annual-summary-view.tsx", {
    "react-native": {
      View: "View",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      ActivityIndicator: "Spinner",
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons/Ionicons": "Icon",
    "./typography": { AppText: "Text" },
    "./year-selector": { YearSelector: "YearSelector" },
    "./ui": { Button: "Button", Empty: "Empty", s: {}, colors: {} },
    "../hooks/use-annual-summary": {
      useAnnualSummary: (year, active) => {
        requests.push({ year, active });
        return { ...state, retry: () => retries++ };
      },
    },
    "../hooks/use-month-pin": { useMonthPin: () => ({ busy: false }) },
    "../utils/annual-summary": annualDomain,
    "../utils/expenses": domain,
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [
            node,
            ...flatten(
              typeof node.type === "function"
                ? node.type(node.props)
                : node.props?.children,
            ),
          ]
        : [];
  const render = (active = true, year = 2026) =>
    flatten(
      runtime.render(({ AnnualSummaryView }) =>
        AnnualSummaryView({
          active,
          year,
          onYearChange: (next) => yearChanges.push(next),
        }),
      ),
    );
  let nodes = render();
  assert.ok(!nodes.some((node) => node.type === "Spinner"));
  assert.equal(
    nodes.filter((node) =>
      node.props?.accessibilityLabel?.match(/^\d+월, 조회 전$/),
    ).length,
    12,
  );
  assert.ok(nodes.some((node) => node.props?.accessibilityState?.busy));
  assert.ok(
    nodes.some(
      (node) => node.props?.accessibilityLabel === "연간 지출 합계 조회 전",
    ),
  );
  assert.deepEqual(requests.at(-1), { year: 2026, active: true });
  render(true, 2025);
  assert.deepEqual(requests.at(-1), { year: 2025, active: true });
  state = { snapshot: null, loading: false, error: "failed" };
  nodes = render();
  assert.ok(nodes.some((node) => node.props?.accessibilityRole === "alert"));
  assert.equal(
    nodes.filter((node) =>
      node.props?.accessibilityLabel?.match(/^\d+월, 조회 전$/),
    ).length,
    12,
  );
  nodes.find((node) => node.type === "Button").props.onPress();
  assert.equal(retries, 1);
  const yearSelector = nodes.find((node) => node.type === "YearSelector");
  yearSelector.props.onChange(2025);
  assert.deepEqual(yearChanges, [2025]);
  const months = annualDomain.monthsOfYear(2026).map((month) => ({
    month,
    expenseTotal: 0,
    expenseCount: 0,
    pendingExpenses: 0,
    benefitTotal: 0,
    benefitCount: 0,
    pendingBenefits: 0,
  }));
  state = { snapshot: { year: 2026, months }, loading: false, error: null };
  const emptyNodes = render();
  assert.ok(!emptyNodes.some((node) => node.type === "Empty"));
  assert.equal(
    emptyNodes.filter((node) =>
      node.props?.accessibilityLabel?.includes("지출 합계 내역 없음"),
    ).length,
    12,
  );
  assert.ok(
    emptyNodes.some(
      (node) =>
        node.type === "Text" && [node.props.children].flat().join("") === "0원",
    ),
  );
  months[0] = {
    ...months[0],
    expenseCount: 1,
    expenseTotal: 10000,
    benefitCount: 1,
    benefitTotal: 1000,
  };
  nodes = render();
  assert.ok(
    nodes.some((node) =>
      node.props?.accessibilityLabel?.includes("1월, 지출 합계 10,000원"),
    ),
  );
  state = { snapshot: null, loading: true, error: null };
  nodes = render(true, 2025);
  assert.equal(
    nodes.filter((node) =>
      node.props?.accessibilityLabel?.match(/^\d+월, 조회 전$/),
    ).length,
    12,
  );
  assert.ok(
    !nodes.some((node) =>
      [node.props?.children]
        .flat()
        .some(
          (child) => typeof child === "string" && child.includes("10,000원"),
        ),
    ),
  );
  assert.equal(
    emptyNodes.find((node) => node.type === "YearSelector").props.year,
    2026,
  );
  render(false);
  assert.equal(requests.at(-1).active, false);
});

test("tax salary is separate by year, editable, persists after reopening, and validates values at both layers", async () => {
  const directory = mkdtempSync(join(tmpdir(), "monthpin-tax-"));
  const path = join(directory, "test.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    assert.deepEqual(await taxRepository.loadYearEndTaxSettings(db, 2026), {
      year: 2026,
      grossSalary: null,
    });
    await taxRepository.saveYearEndTaxSalary(db, 2025, 40000000);
    await taxRepository.saveYearEndTaxSalary(db, 2026, 60000000);
    await taxRepository.saveYearEndTaxSalary(db, 2025, 42000000);
    assert.deepEqual(await taxRepository.loadYearEndTaxSettings(db, 2026), {
      year: 2026,
      grossSalary: 60000000,
    });
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2025)).grossSalary,
      42000000,
    );
    await taxRepository.saveYearEndTaxSalary(db, 2027, 0);
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2027)).grossSalary,
      0,
    );
    for (const year of [999, 10000, 2026.1, NaN, "2026"]) {
      await assert.rejects(
        taxRepository.loadYearEndTaxSettings(db, year),
        /연도/,
      );
      await assert.rejects(
        taxRepository.saveYearEndTaxSalary(db, year, 40000000),
        /연도/,
      );
    }
    for (const amount of [
      -1,
      1.5,
      10000000000,
      NaN,
      Infinity,
      null,
      "40000000",
    ])
      await assert.rejects(
        taxRepository.saveYearEndTaxSalary(db, 2026, amount),
        /총급여/,
      );
    for (const [year, amount] of [
      [999, 1],
      [10000, 1],
      [2028, -1],
      [2028, 1.5],
      [2028, 10000000000],
    ])
      await assert.rejects(
        db.runAsync(
          "INSERT INTO annual_tax_settings (year, grossSalary) VALUES (?, ?)",
          year,
          amount,
        ),
      );
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT COUNT(*) AS count FROM annual_tax_settings",
        )
      ).count,
      3,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2026)).grossSalary,
      60000000,
    );
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2025)).grossSalary,
      42000000,
    );
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2027)).grossSalary,
      0,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("v15 tax migration preserves existing records, rolls back a failed migration and can retry", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { first, second } = await seedSettlementCards(db);
    await repository.saveExpense(db, insuranceInput);
    await ledgerRepository.loadLedgerMonth(db, "2026-02");
    await cardBenefitRepository.saveCardBenefitMonth(db, "2026-02", [
      { methodId: first.id, amount: 5000 },
      { methodId: second.id, amount: 0 },
    ]);
    const preservedTables = [
      "payment_methods",
      "expenses",
      "ledger_entries",
      "expense_amount_versions",
      "card_benefit_versions",
      "monthly_card_benefits",
    ];
    const before = await Promise.all(
      preservedTables.map((table) =>
        db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`),
      ),
    );
    await db.execAsync(
      "DROP TABLE annual_tax_settings; PRAGMA user_version = 15;",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 16;")
        throw new Error("tax migration failed");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /tax migration failed/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      15,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'annual_tax_settings'",
      ),
      undefined,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(
      await Promise.all(
        preservedTables.map((table) =>
          db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`),
        ),
      ),
      before,
    );
    await taxRepository.saveYearEndTaxSalary(db, 2026, 40000000);
    await repository.initializeDatabase(db);
    assert.equal(
      (await taxRepository.loadYearEndTaxSettings(db, 2026)).grossSalary,
      40000000,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("salary target uses exactly 25 percent and keeps empty, zero, fractional won and salary limits distinct", () => {
  assert.equal(taxDomain.cardSpendingTarget(null), null);
  assert.equal(taxDomain.cardSpendingTarget(0), 0);
  assert.equal(taxDomain.cardSpendingTarget(40000000), 10000000);
  assert.equal(taxDomain.cardSpendingTarget(45000001), 11250000.25);
  assert.equal(taxDomain.cardSpendingTarget(9999999999), 2499999999.75);
  for (const text of ["", " ", "-1", "1.5", "1e6", "10000000000", "salary"])
    assert.equal(taxDomain.parseGrossSalary(text), null);
  assert.equal(taxDomain.parseGrossSalary("40,000,000"), 40000000);
  assert.equal(taxDomain.parseGrossSalary("0"), 0);
  assert.equal(taxDomain.parseGrossSalary("9,999,999,999"), 9999999999);
});

test("tax hook hides other-year or outdated values, retries failures and pauses when inactive", async () => {
  const requests = [];
  const store = {
    busy: false,
    dataRevision: 0,
    loadYearEndTaxYear: (year) =>
      new Promise((resolve, reject) =>
        requests.push({ year, resolve, reject }),
      ),
  };
  const runtime = hookRuntime("src/hooks/use-year-end-tax.ts", {
    "./use-month-pin": { useMonthPin: () => store },
  });
  const render = (year = 2026, active = true) =>
    runtime.render(({ useYearEndTax }) => useYearEndTax(year, active));
  render();
  runtime.flush();
  render(2025);
  runtime.flush();
  requests[1].resolve({ year: 2025, grossSalary: 30000000 });
  await settle();
  requests[0].resolve({ year: 2026, grossSalary: 40000000 });
  await settle();
  assert.equal(render(2025).snapshot.grossSalary, 30000000);
  store.busy = true;
  assert.equal(render(2025).snapshot, null);
  runtime.flush();
  store.dataRevision++;
  store.busy = false;
  render(2025);
  runtime.flush();
  requests[2].reject(new Error("failed"));
  await settle();
  assert.ok(render(2025).error);
  render(2025).retry();
  assert.equal(render(2025).error, null);
  runtime.flush();
  render(2025, false);
  runtime.flush();
  requests[3].resolve({ year: 2025, grossSalary: 0 });
  await settle();
  assert.equal(render(2025, false).snapshot, null);
  assert.equal(render(2025, false).loading, false);
  assert.equal(requests.length, 4);
  render(2025);
  runtime.flush();
  requests[4].resolve({ year: 2025, grossSalary: 0 });
  await settle();
  assert.equal(render(2025).snapshot.grossSalary, 0);
  runtime.focus(false);
  runtime.focus(true);
  assert.equal(render(2025).snapshot, null);
  requests[5].resolve({ year: 2025, grossSalary: 10000000 });
  await settle();
  assert.equal(render(2025).snapshot.grossSalary, 10000000);
});

test("salary form validates on submit, previews targets, prevents duplicate saves and keeps values after errors", async () => {
  const saves = [];
  let finish;
  let closed = 0;
  let focused = 0;
  const runtime = hookRuntime("src/components/year-end-salary-form.tsx", {
    "react-native": { View: "View" },
    "./typography": { AppText: "Text" },
    "../hooks/use-month-pin": {
      useMonthPin: () => ({
        busy: false,
        saveYearEndTaxSalary: (year, salary) => {
          saves.push({ year, salary });
          return new Promise((resolve, reject) => {
            finish = { resolve, reject };
          });
        },
      }),
    },
    "../utils/expenses": domain,
    "../utils/year-end-tax": taxDomain,
    "./ui": {
      Field: "Field",
      Button: "Button",
      FieldMessage: "Message",
      s: {},
      useFormNavigation: () => null,
    },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = () =>
    flatten(
      runtime.render(({ YearEndSalaryForm }) =>
        YearEndSalaryForm({
          settings: { year: 2026, grossSalary: null },
          onClose: () => closed++,
        }),
      ),
    );
  const field = () => render().find((node) => node.type === "Field").props;
  const button = () => render().find((node) => node.type === "Button").props;
  assert.equal(field().value, "");
  assert.equal(field().error, "");
  field().controlRef.current = { focus: () => focused++ };
  button().onPress();
  assert.equal(saves.length, 0);
  assert.equal(focused, 1);
  assert.ok(field().error);
  field().onChangeText("40000000");
  assert.equal(field().value, "40,000,000");
  assert.ok(
    render().some((node) => node.props?.children?.includes?.("10,000,000원")),
  );
  assert.equal(saves.length, 0);
  button().onPress();
  button().onPress();
  assert.deepEqual(saves, [{ year: 2026, salary: 40000000 }]);
  finish.reject(new Error("save failed"));
  await settle();
  assert.equal(closed, 0);
  assert.equal(field().value, "40,000,000");
  assert.equal(
    render().find((node) => node.type === "Message").props.error,
    "save failed",
  );
  field().onChangeText("0");
  button().onPress();
  assert.deepEqual(saves[1], { year: 2026, salary: 0 });
  finish.resolve();
  await settle();
  assert.equal(closed, 1);
});

test("tax view keeps its target card during loading, hides stale values and resets editors on year changes", () => {
  let state = {
    loading: false,
    error: null,
    snapshot: { year: 2026, grossSalary: null, months: [] },
  };
  let retries = 0;
  let changedYear = null;
  const runtime = hookRuntime("src/components/year-end-tax-view.tsx", {
    "react-native": {
      View: "View",
      ScrollView: "ScrollView",
      Pressable: "Pressable",
      ActivityIndicator: "Spinner",
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons/Ionicons": "Icon",
    "./typography": { AppText: "Text" },
    "./ui": { Button: "Button", FormModal: "Modal", s: {}, colors: {} },
    "./year-end-salary-form": { YearEndSalaryForm: "SalaryForm" },
    "./year-end-tax-guide": { YearEndTaxGuide: "TaxGuide" },
    "./year-end-spending-form": { YearEndSpendingForm: "SpendingForm" },
    "./year-end-card-selection-form": {
      YearEndCardSelectionForm: "CardSelectionForm",
    },
    "./year-selector": { YearSelector: "YearSelector" },
    "./list-controls": { CompactActionButton: "CompactActionButton" },
    "../hooks/use-year-end-tax": {
      useYearEndTax: () => ({ ...state, retry: () => retries++ }),
    },
    "../hooks/use-month-pin": { useMonthPin: () => ({ busy: false }) },
    "../utils/year-end-tax": taxDomain,
    "../utils/expenses": domain,
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = (year = 2026) =>
    flatten(
      runtime.render(({ YearEndTaxView }) =>
        YearEndTaxView({
          year,
          active: true,
          onYearChange: (year) => {
            changedYear = year;
          },
        }),
      ),
    );
  let nodes = render();
  const salaryAction = () =>
    nodes.find((node) =>
      node.props?.accessibilityLabel?.startsWith("2026년 연봉 "),
    );
  assert.equal(salaryAction().props.label, "연봉 입력");
  const yearSelector = () => nodes.find((node) => node.type === "YearSelector");
  state.snapshot.selectedCards = [11, 12, 13].map((methodId) => ({ methodId }));
  nodes = render();
  const cardAction = () => yearSelector().props.action.props;
  assert.equal(cardAction().label, "카드 선택 · 3개");
  cardAction().onPress();
  nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "Modal").props.presentation,
    "dialog",
  );
  assert.deepEqual(
    nodes.find((node) => node.type === "CardSelectionForm").props.selectedIds,
    [11, 12, 13],
  );
  nodes.find((node) => node.type === "CardSelectionForm").props.onClose();
  nodes = render();
  yearSelector().props.onChange(2025);
  assert.equal(changedYear, 2025);
  assert.ok(
    nodes.findIndex((node) =>
      node.props?.accessibilityLabel?.startsWith("목표금액"),
    ) < nodes.indexOf(yearSelector()),
  );
  assert.ok(
    nodes.indexOf(yearSelector()) <
      nodes.findIndex(
        (node) =>
          node.props?.accessibilityLabel === "2026년 1월 사용금액 미입력, 입력",
      ),
  );
  nodes
    .find(
      (node) =>
        node.props?.accessibilityLabel === "2026년 1월 사용금액 미입력, 입력",
    )
    .props.onPress();
  nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "Modal").props.title,
    "2026년 1월 사용금액",
  );
  assert.equal(
    nodes.find((node) => node.type === "Modal").props.presentation,
    "full_screen",
  );
  assert.equal(
    nodes.find((node) => node.type === "SpendingForm").props.amounts,
    null,
  );
  nodes.find((node) => node.type === "SpendingForm").props.onClose();
  nodes = render();
  assert.equal(
    nodes.find((node) => node.props?.accessibilityLabel?.startsWith("목표금액"))
      .props.children,
    "—",
  );
  assert.equal(
    nodes.find(
      (node) => node.props?.accessibilityLabel === "잔여금액 총급여 입력 전",
    ).props.children,
    "—",
  );
  assert.ok(
    nodes.findIndex((node) => node.props?.children === "목표금액") <
      nodes.indexOf(salaryAction()),
  );
  salaryAction().props.onPress();
  nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "Modal").props.presentation,
    "dialog",
  );
  assert.equal(
    nodes.find((node) => node.type === "SalaryForm").props.settings.grossSalary,
    null,
  );
  nodes.find((node) => node.type === "Modal").props.onClose();
  state.snapshot = { year: 2026, grossSalary: 40000000, months: [] };
  nodes = render();
  assert.equal(
    nodes.find((node) => node.props?.accessibilityLabel?.startsWith("목표금액"))
      .props.children,
    "10,000,000원",
  );
  assert.equal(
    nodes.find(
      (node) =>
        node.props?.accessibilityLabel ===
        "잔여금액 10,000,000원, 입력한 월 기준",
    ).props.children,
    "10,000,000원",
  );
  const pageCopy = nodes
    .flatMap((node) => [
      node.type === "Text" ? node.props.children : "",
      node.props?.accessibilityLabel ?? "",
      node.props?.accessibilityHint ?? "",
    ])
    .flat(Infinity)
    .join(" ");
  assert.ok(!pageCopy.includes("40,000,000"));
  assert.ok(!pageCopy.includes("40000000"));
  assert.ok(!pageCopy.includes("연간 총급여"));
  assert.equal(salaryAction().props.accessibilityLabel, "2026년 연봉 수정");
  assert.equal(salaryAction().props.label, "연봉 수정");
  for (const label of ["총급여의 25%", "사용금액 소득공제 기준"]) {
    assert.ok(nodes.some((node) => node.props?.children === label));
  }
  nodes
    .find(
      (node) => node.props?.accessibilityLabel === "사용금액 소득공제율 안내",
    )
    .props.onPress();
  nodes = render();
  assert.ok(nodes.some((node) => node.type === "TaxGuide"));
  assert.ok(!nodes.some((node) => node.type === "SalaryForm"));
  assert.equal(
    nodes.find((node) => node.type === "Modal").props.title,
    "사용금액 소득공제 안내",
  );
  nodes.find((node) => node.type === "Modal").props.onClose();
  nodes = render();
  assert.ok(!nodes.some((node) => node.type === "Modal"));
  salaryAction().props.onPress();
  assert.equal(
    render().find((node) => node.type === "SalaryForm").props.settings
      .grossSalary,
    40000000,
  );
  render()
    .find((node) => node.type === "Modal")
    .props.onClose();
  const entered = {
    year: 2026,
    month: 1,
    amounts: {
      cash_receipt: 100,
      debit_card: 200,
      local_card: 300,
      credit_card: 400,
    },
  };
  state.snapshot = { year: 2026, grossSalary: 40000000, months: [entered] };
  nodes = render();
  assert.equal(
    nodes.find(
      (node) =>
        node.props?.accessibilityLabel ===
        "잔여금액 9,999,000원, 입력한 월 기준",
    ).props.children,
    "9,999,000원",
  );
  nodes
    .find(
      (node) =>
        node.props?.accessibilityLabel === "2026년 1월 사용금액 1,000원, 수정",
    )
    .props.onPress();
  nodes = render();
  assert.deepEqual(
    nodes.find((node) => node.type === "SpendingForm").props.amounts,
    entered.amounts,
  );
  nodes.find((node) => node.type === "Modal").props.onClose();
  state.snapshot = { year: 2026, grossSalary: 0, months: [] };
  assert.equal(
    render().find((node) =>
      node.props?.accessibilityLabel?.startsWith("목표금액"),
    ).props.children,
    "0원",
  );
  state.snapshot = {
    year: 2026,
    grossSalary: 40000000,
    months: [
      { ...entered, month: 1, confirmed: false },
      { ...entered, month: 7, confirmed: true },
    ],
  };
  nodes = render();
  const confirmedMonth = nodes.find(
    (node) =>
      node.props?.accessibilityLabel ===
      "2026년 7월 사용금액 1,000원, 확정, 수정",
  );
  assert.ok(confirmedMonth);
  assert.ok(
    nodes.some(
      (node) =>
        node.props?.accessibilityLabel === "2026년 1월 사용금액 1,000원, 수정",
    ),
  );
  confirmedMonth.props.onPress();
  nodes = render();
  assert.equal(
    nodes.find((node) => node.type === "SpendingForm").props.confirmed,
    true,
  );
  nodes.find((node) => node.type === "SpendingForm").props.onClose();
  state = { snapshot: null, loading: true, error: null };
  nodes = render();
  assert.ok(!nodes.some((node) => node.type === "Spinner"));
  assert.ok(nodes.some((node) => node.props?.accessibilityState?.busy));
  assert.equal(
    nodes.find((node) => node.props?.accessibilityLabel === "목표금액 조회 중")
      .props.children,
    "—",
  );
  assert.equal(
    nodes.find((node) => node.props?.accessibilityLabel === "잔여금액 조회 중")
      .props.children,
    "—",
  );
  assert.equal(salaryAction().props.disabled, true);
  salaryAction().props.onPress();
  assert.ok(!render().some((node) => node.type === "SalaryForm"));
  const pendingMonth = nodes.find(
    (node) => node.props?.accessibilityLabel === "2026년 1월 사용금액 조회 전",
  );
  assert.equal(pendingMonth.props.disabled, true);
  pendingMonth.props.onPress();
  assert.ok(!render().some((node) => node.type === "SpendingForm"));
  assert.equal(yearSelector().props.year, 2026);
  assert.equal(cardAction().label, "카드 선택 · —");
  assert.equal(cardAction().disabled, true);
  cardAction().onPress();
  assert.ok(!render().some((node) => node.type === "CardSelectionForm"));
  state = { snapshot: null, loading: false, error: "failed" };
  nodes = render();
  nodes.find((node) => node.type === "Button").props.onPress();
  assert.equal(retries, 1);
  state = {
    snapshot: { year: 2026, grossSalary: 40000000, months: [] },
    loading: false,
    error: null,
  };
  // Changing away and back must not resurrect an editor or its draft.
  for (const open of [
    () => salaryAction().props.onPress(),
    () => cardAction().onPress(),
    () =>
      nodes
        .find((node) =>
          node.props?.accessibilityLabel?.startsWith("2026년 1월 사용금액"),
        )
        .props.onPress(),
    () =>
      nodes
        .find(
          (node) =>
            node.props?.accessibilityLabel === "사용금액 소득공제율 안내",
        )
        .props.onPress(),
  ]) {
    nodes = render();
    open();
    assert.ok(render().some((node) => node.type === "Modal"));
    state = { snapshot: null, loading: true, error: null };
    assert.ok(!render(2025).some((node) => node.type === "Modal"));
    state = {
      snapshot: { year: 2026, grossSalary: 40000000, months: [] },
      loading: false,
      error: null,
    };
    assert.ok(!render().some((node) => node.type === "Modal"));
  }
});

test("deduction guide explains tax bands before descending payment rates and shows a conditional tax-saving example without links", () => {
  const runtime = hookRuntime("src/components/year-end-tax-guide.tsx", {
    "react-native": {
      View: "View",
      StyleSheet: { create: (styles) => styles },
    },
    "./typography": { AppText: "Text" },
    "./ui": { colors: {} },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const nodes = flatten(
    runtime.render(({ YearEndTaxGuide }) => YearEndTaxGuide()),
  );
  const rates = nodes.filter((node) =>
    node.props?.accessibilityLabel?.includes("소득공제율"),
  );
  assert.deepEqual(
    rates.map((node) => node.props.accessibilityLabel),
    [
      "체크카드 소득공제율 30%",
      "현금영수증 소득공제율 30%",
      "신용카드 소득공제율 15%",
    ],
  );
  const bands = nodes.filter((node) =>
    node.props?.accessibilityLabel?.startsWith("과세표준"),
  );
  assert.equal(bands.length, 8);
  assert.ok(
    bands[0].props.accessibilityLabel.includes(
      "1,400만 원 이하 구간의 소득세율 6%",
    ),
  );
  assert.ok(
    bands[1].props.accessibilityLabel.includes(
      "1,400만 원 초과 5,000만 원 이하 구간의 소득세율 15%",
    ),
  );
  assert.ok(
    bands[7].props.accessibilityLabel.includes(
      "10억 원 초과 구간의 소득세율 45%",
    ),
  );
  assert.ok(nodes.indexOf(bands[7]) < nodes.indexOf(rates[0]));
  const text = nodes
    .filter((node) => node.type === "Text")
    .flatMap((node) => node.props.children)
    .filter((child) => typeof child === "string")
    .join(" ");
  assert.ok(text.includes("비과세·각종 공제"));
  assert.ok(text.includes("내 소득세율이 15%라면 소득세는 4만 5천 원 줄어요."));
  assert.ok(text.includes("공제 한도가 남아"));
  assert.ok(text.includes("지방소득세(소득세의 10%)는 별도"));
  assert.ok(text.includes("미리 낸 세금보다 최종 세금이 적을 때"));
  assert.ok(!nodes.some((node) => node.props?.href));
});

test("year selector hides the current-year shortcut on this year and labels the destination on other years", () => {
  const changes = [];
  const runtime = hookRuntime("src/components/year-selector.tsx", {
    "react-native": {
      View: "View",
      Pressable: "Pressable",
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons/Ionicons": "Icon",
    "./typography": { AppText: "Text" },
    "./ui": { colors: {} },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = (year = 2026, disabled = false) =>
    flatten(
      runtime.render(({ YearSelector }) =>
        YearSelector({
          year,
          disabled,
          onChange: (next) => changes.push(next),
        }),
      ),
    );
  const currentYear = new Date().getFullYear();
  const currentButtons = render(currentYear).filter(
    (node) => node.type === "Pressable",
  );
  assert.equal(currentButtons.length, 2);
  for (const node of currentButtons) node.props.onPress();
  assert.deepEqual(changes, [currentYear - 1, currentYear + 1]);
  const previousYearButtons = render(currentYear - 1).filter(
    (node) => node.type === "Pressable",
  );
  assert.equal(previousYearButtons.length, 3);
  const shortcut = previousYearButtons.find(
    (node) => node.props.accessibilityLabel === `${currentYear}년으로 돌아가기`,
  );
  assert.ok(shortcut);
  assert.ok(
    flatten(shortcut).some(
      (node) => node.type === "Text" && node.props.children[0] === currentYear,
    ),
  );
  shortcut.props.onPress();
  assert.equal(changes.at(-1), currentYear);
  assert.equal(
    render(1000).find((node) => node.props?.accessibilityLabel === "이전 연도")
      .props.disabled,
    true,
  );
  assert.equal(
    render(9999).find((node) => node.props?.accessibilityLabel === "다음 연도")
      .props.disabled,
    true,
  );
  assert.ok(
    render(2026, true)
      .filter((node) => node.type === "Pressable")
      .every((node) => node.props.disabled),
  );
});

const taxAmounts = (overrides = {}) => ({
  cash_receipt: 0,
  debit_card: 0,
  local_card: 0,
  credit_card: 0,
  ...overrides,
});

test("monthly tax amounts keep years, months and explicit zero separate, reject invalid saves atomically and survive reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "monthpin-tax-spending-"));
  const path = join(directory, "spending.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    assert.deepEqual(await taxRepository.loadYearEndTaxYear(db, 2026), {
      year: 2026,
      grossSalary: null,
      months: [],
      selectedCards: [],
    });
    await taxRepository.saveYearEndTaxSalary(db, 2026, 40000000);
    const first = {
      year: 2026,
      month: 1,
      amounts: taxAmounts({
        cash_receipt: 100000,
        debit_card: 200000,
        local_card: 300000,
        credit_card: 400000,
      }),
    };
    await taxRepository.saveYearEndTaxMonth(db, first);
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2026,
      month: 2,
      amounts: taxAmounts(),
    });
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2025,
      month: 1,
      amounts: taxAmounts({ local_card: 500 }),
    });
    let saved = await taxRepository.loadYearEndTaxYear(db, 2026);
    assert.equal(saved.months.length, 2);
    assert.equal(taxDomain.taxMonthTotal(saved.months[0].amounts), 1000000);
    assert.equal(taxDomain.taxMonthTotal(saved.months[1].amounts), 0);
    assert.equal(
      taxDomain.remainingTaxTarget(saved.grossSalary, saved.months),
      9000000,
    );
    const updated = { ...first, amounts: taxAmounts({ local_card: 123456 }) };
    await taxRepository.saveYearEndTaxMonth(db, updated);
    for (const month of [0, 13, 1.5, NaN, "1"])
      await assert.rejects(
        taxRepository.saveYearEndTaxMonth(db, { ...first, month }),
        /월/,
      );
    for (const year of [999, 10000, NaN])
      await assert.rejects(taxRepository.loadYearEndTaxYear(db, year), /연도/);
    for (const amount of [-1, 1.5, 10000000000, NaN, Infinity, null, "100"])
      await assert.rejects(
        taxRepository.saveYearEndTaxMonth(db, {
          ...first,
          amounts: taxAmounts({ credit_card: amount }),
        }),
        /사용금액/,
      );
    for (const amounts of [
      { cash_receipt: 1 },
      { ...taxAmounts(), unknown: 1 },
    ])
      await assert.rejects(
        taxRepository.saveYearEndTaxMonth(db, { ...first, amounts }),
        /사용금액/,
      );
    await db.execAsync(
      "CREATE TRIGGER fail_tax_month BEFORE UPDATE ON monthly_tax_spending WHEN NEW.credit_card = 777 BEGIN SELECT RAISE(ABORT, 'Simulated monthly failure'); END;",
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...first,
        amounts: taxAmounts({ cash_receipt: 99, credit_card: 777 }),
      }),
      /Simulated monthly failure/,
    );
    assert.deepEqual(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      { ...updated, cards: [], confirmed: false },
    );
    await db.execAsync("DROP TRIGGER fail_tax_month;");
    for (const [year, month, amount] of [
      [999, 1, 0],
      [2026, 13, 0],
      [2026, 3, -1],
      [2026, 3, 1.5],
      [2026, 3, 10000000000],
    ])
      await assert.rejects(
        db.runAsync(
          "INSERT INTO monthly_tax_spending (year, month, cash_receipt, debit_card, local_card, credit_card) VALUES (?, ?, ?, 0, 0, 0)",
          year,
          month,
          amount,
        ),
      );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    saved = await taxRepository.loadYearEndTaxYear(db, 2026);
    assert.equal(saved.grossSalary, 40000000);
    assert.deepEqual(saved.months, [
      { ...updated, cards: [], confirmed: false },
      {
        year: 2026,
        month: 2,
        amounts: taxAmounts(),
        cards: [],
        confirmed: false,
      },
    ]);
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2025)).months[0].amounts
        .local_card,
      500,
    );
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2027)).months.length,
      0,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("v16 monthly tax migration preserves salary and existing history, rolls back failures and retries idempotently", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    await seedSettlementCards(db);
    await repository.saveExpense(db, insuranceInput);
    await ledgerRepository.loadLedgerMonth(db, "2026-02");
    await taxRepository.saveYearEndTaxSalary(db, 2026, 40000000);
    const tables = [
      "payment_methods",
      "expenses",
      "ledger_entries",
      "expense_amount_versions",
      "card_benefit_versions",
      "monthly_card_benefits",
      "annual_tax_settings",
    ];
    const read = () =>
      Promise.all(
        tables.map((table) =>
          db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`),
        ),
      );
    const before = await read();
    await db.execAsync(
      "DROP TABLE monthly_tax_spending; PRAGMA user_version = 16;",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 17;")
        throw new Error("monthly migration failed");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /monthly migration failed/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      16,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'monthly_tax_spending'",
      ),
      undefined,
    );
    assert.deepEqual(await read(), before);
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await read(), before);
    assert.deepEqual(await taxRepository.loadYearEndTaxYear(db, 2026), {
      year: 2026,
      grossSalary: 40000000,
      months: [],
      selectedCards: [],
    });
  } finally {
    db.sqlite.close();
  }
});

test("tax spending totals count all four methods once, retain fractional targets and clamp remaining amounts at zero", () => {
  assert.deepEqual(
    loadTypeScript("src/data/tax-spending-types.ts").TAX_SPENDING_METHODS.map(
      (item) => item.code,
    ),
    ["cash_receipt", "debit_card", "local_card", "credit_card"],
  );
  assert.equal(taxDomain.parseTaxSpendingAmount(""), 0);
  assert.equal(taxDomain.parseTaxSpendingAmount("1,234"), 1234);
  assert.equal(taxDomain.parseTaxSpendingAmount("9,999,999,999"), 9999999999);
  for (const value of ["-1", "1.5", "1e3", "10000000000", "abc"])
    assert.equal(taxDomain.parseTaxSpendingAmount(value), null);
  const months = [
    {
      year: 2026,
      month: 1,
      amounts: taxAmounts({
        cash_receipt: 1,
        debit_card: 2,
        local_card: 3,
        credit_card: 4,
      }),
    },
  ];
  assert.equal(taxDomain.remainingTaxTarget(null, months), null);
  assert.equal(taxDomain.remainingTaxTarget(0, months), 0);
  assert.equal(taxDomain.remainingTaxTarget(100, months), 15);
  assert.equal(taxDomain.remainingTaxTarget(101, months), 15.25);
  assert.equal(taxDomain.remainingTaxTarget(40, months), 0);
  assert.equal(taxDomain.remainingTaxTarget(20, months), 0);
});

test("monthly tax form accepts blank zeroes, previews sums, preserves edits after failure and prevents duplicate saves", async () => {
  let fail = true;
  let finish;
  let closed = 0;
  let busy = false;
  const saves = [];
  const focused = [];
  const fixture = (
    amounts = null,
    selectedCards = [],
    cards = [],
    confirmed = false,
  ) => {
    const runtime = hookRuntime("src/components/year-end-spending-form.tsx", {
      "react-native": {
        View: "View",
        StyleSheet: { create: (styles) => styles },
      },
      "./typography": { AppText: "Text" },
      "./provider-icon": { ProviderIcon: "ProviderIcon" },
      "../data/providers": loadTypeScript("src/data/providers.ts"),
      "../data/method-types": loadTypeScript("src/data/method-types.ts"),
      "./ui": {
        ButtonGroup: "ButtonGroup",
        Field: "Field",
        FieldMessage: "FieldMessage",
        s: {},
        colors: loadTypeScript("src/components/theme.ts").colors,
        useFormNavigation: () => (node, focus) => focus(),
      },
      "../hooks/use-month-pin": {
        useMonthPin: () => ({
          busy,
          saveYearEndTaxMonth: async (entry) => {
            saves.push(entry);
            if (fail) throw new Error("저장 실패");
            await new Promise((resolve) => {
              finish = resolve;
            });
          },
        }),
      },
      "../data/tax-spending-types": loadTypeScript(
        "src/data/tax-spending-types.ts",
      ),
      "../utils/year-end-tax": taxDomain,
      "../utils/tax-spending-fields": loadTypeScript(
        "src/utils/tax-spending-fields.ts",
      ),
      "../utils/expenses": domain,
    });
    const flatten = (node) =>
      Array.isArray(node)
        ? node.flatMap(flatten)
        : node && typeof node === "object"
          ? [node, ...flatten(node.props?.children)]
          : [];
    const render = () =>
      flatten(
        runtime.render(({ YearEndSpendingForm }) =>
          YearEndSpendingForm({
            year: 2026,
            month: 1,
            amounts,
            selectedCards,
            cards,
            confirmed,
            onClose: () => closed++,
          }),
        ),
      );
    const field = (label) =>
      render().find(
        (node) => node.type === "Field" && node.props.label === label,
      ).props;
    const actions = () =>
      render().find((node) => node.type === "ButtonGroup").props.actions;
    const save = () =>
      actions()
        .find((action) => action.code === "save")
        .onPress();
    const confirm = () =>
      actions()
        .find((action) => action.code === "confirm")
        .onPress();
    return { render, field, save, confirm, actions };
  };
  const form = fixture();
  assert.deepEqual(
    form
      .render()
      .filter((node) => node.type === "Field")
      .map((node) => node.props.label),
    ["현금영수증", "지역카드"],
  );
  form.field("현금영수증").onChangeText("10000000000");
  form.field("현금영수증").controlRef({ focus: () => focused.push("cash") });
  form.confirm();
  await settle();
  assert.ok(form.field("현금영수증").error);
  assert.deepEqual(focused, ["cash"]);
  assert.equal(saves.length, 0);
  form.field("현금영수증").onChangeText("100000");
  form.field("지역카드").onChangeText("300000");
  assert.equal(form.field("현금영수증").value, "100,000");
  assert.ok(
    form
      .render()
      .some(
        (node) =>
          node.type === "Text" && node.props.children?.includes?.("400,000원"),
      ),
  );
  form.save();
  await settle();
  assert.deepEqual(saves[0], {
    year: 2026,
    month: 1,
    amounts: taxAmounts({
      cash_receipt: 100000,
      local_card: 300000,
    }),
    cards: [],
    confirmed: false,
  });
  assert.equal(closed, 0);
  assert.equal(form.field("현금영수증").value, "100,000");
  assert.equal(
    form.render().find((node) => node.type === "FieldMessage").props.error,
    "저장 실패",
  );
  fail = false;
  form.save();
  form.save();
  assert.equal(saves.length, 2);
  finish();
  await settle();
  assert.equal(closed, 1);
  const editing = fixture(taxAmounts({ credit_card: 987654 }));
  assert.equal(editing.field("카드 미지정 금액").value, "987,654");
  editing.field("카드 미지정 금액").onChangeText("");
  editing.save();
  assert.deepEqual(saves.at(-1).amounts, taxAmounts());
  finish();
  await settle();
  busy = true;
  const before = saves.length;
  editing.save();
  assert.equal(saves.length, before);
  busy = false;
  const card = {
    methodId: 11,
    name: "오하Check",
    providerName: "은행",
    cardTypeCode: "debit",
  };
  const perCard = fixture(null, [card]);
  perCard.field("오하Check").onChangeText("345000");
  perCard.save();
  assert.deepEqual(saves.at(-1).cards, [{ ...card, id: null, amount: 345000 }]);
  assert.equal(saves.at(-1).amounts.debit_card, 0);
  finish();
  await settle();
  const history = fixture(
    taxAmounts(),
    [],
    [{ ...card, id: 8, amount: 345000 }],
  );
  assert.equal(history.field("오하Check").value, "345,000");
  const zero = fixture(taxAmounts(), [card], [{ ...card, id: 8, amount: 0 }]);
  for (const label of ["현금영수증", "지역카드", "오하Check"]) {
    assert.equal(zero.field(label).value, "");
    assert.equal(zero.field(label).placeholder, "0");
  }
  zero.save();
  assert.deepEqual(saves.at(-1).amounts, taxAmounts());
  assert.deepEqual(saves.at(-1).cards, [{ ...card, id: 8, amount: 0 }]);
  finish();
  await settle();
  zero.field("오하Check").onChangeText("125000");
  assert.equal(zero.field("오하Check").value, "125,000");
  fail = true;
  zero.confirm();
  await settle();
  assert.equal(saves.at(-1).confirmed, true);
  assert.equal(zero.field("오하Check").value, "125,000");
  assert.equal(
    zero.render().find((node) => node.type === "FieldMessage").props.error,
    "저장 실패",
  );
  fail = false;
  zero.confirm();
  const pendingCount = saves.length;
  zero.save();
  zero.confirm();
  assert.equal(saves.length, pendingCount);
  assert.ok(zero.actions().every((action) => action.disabled));
  assert.equal(saves.at(-1).confirmed, true);
  finish();
  await settle();
  const confirmedForm = fixture(taxAmounts({ cash_receipt: 50 }), [], [], true);
  assert.deepEqual(
    confirmedForm.actions().map((action) => action.code),
    ["save"],
  );
  confirmedForm.field("현금영수증").onChangeText("75");
  confirmedForm.save();
  assert.equal(saves.at(-1).confirmed, true);
  assert.equal(saves.at(-1).amounts.cash_receipt, 75);
  finish();
  await settle();
});

const taxCardRepository = loadTypeScript("src/data/year-end-tax-cards.ts");
const taxFieldDomain = loadTypeScript("src/utils/tax-spending-fields.ts");

test("monthly tax confirmation saves atomically with amounts and cards, validates booleans, and survives reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "monthpin-tax-confirmation-"));
  const path = join(directory, "confirmation.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    const { second } = await seedSettlementCards(db);
    await taxCardRepository.saveYearEndTaxCards(db, 2026, [second.id]);
    const [selected] = (await taxRepository.loadYearEndTaxYear(db, 2026))
      .selectedCards;
    const draft = {
      year: 2026,
      month: 1,
      amounts: taxAmounts({ cash_receipt: 100 }),
      cards: [],
      confirmed: false,
    };
    await taxRepository.saveYearEndTaxMonth(db, draft);
    await db.execAsync(
      "CREATE TRIGGER fail_tax_confirmation BEFORE INSERT ON monthly_tax_cards WHEN NEW.amount = 777 BEGIN SELECT RAISE(ABORT, 'confirmation card failure'); END;",
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...draft,
        confirmed: true,
        amounts: taxAmounts({ cash_receipt: 999 }),
        cards: [{ ...selected, id: null, amount: 777 }],
      }),
      /confirmation card failure/,
    );
    assert.deepEqual(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      draft,
    );
    await db.execAsync("DROP TRIGGER fail_tax_confirmation;");
    await taxRepository.saveYearEndTaxMonth(db, {
      ...draft,
      confirmed: true,
      cards: [{ ...selected, id: null, amount: 250 }],
    });
    let saved = (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0];
    assert.equal(saved.confirmed, true);
    assert.equal(taxDomain.taxEntryTotal(saved), 350);
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT confirmed FROM monthly_tax_spending WHERE year = 2026 AND month = 1",
        )
      ).confirmed,
      1,
    );
    const { confirmed: _confirmed, ...olderInput } = saved;
    await taxRepository.saveYearEndTaxMonth(db, {
      ...olderInput,
      amounts: taxAmounts({ cash_receipt: 150 }),
    });
    saved = (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0];
    assert.equal(saved.confirmed, true);
    assert.equal(taxDomain.taxEntryTotal(saved), 400);
    for (const confirmed of [0, 1, "true", null, {}, []])
      await assert.rejects(
        taxRepository.saveYearEndTaxMonth(db, {
          ...saved,
          confirmed,
        }),
        /확정 상태/,
      );
    for (const value of [2, -1, 0.5, "invalid", null])
      await assert.rejects(
        db.runAsync(
          "UPDATE monthly_tax_spending SET confirmed = ? WHERE year = 2026 AND month = 1",
          value,
        ),
      );
    assert.deepEqual(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      saved,
    );
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2026,
      month: 2,
      amounts: taxAmounts(),
      confirmed: true,
    });
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2025,
      month: 1,
      amounts: taxAmounts(),
    });
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    const loaded = await taxRepository.loadYearEndTaxYear(db, 2026);
    assert.deepEqual(loaded.months[0], saved);
    assert.equal(loaded.months[1].confirmed, true);
    assert.equal(taxDomain.taxEntryTotal(loaded.months[1]), 0);
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2025)).months[0].confirmed,
      false,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("v18 tax confirmation migration preserves existing records as drafts, rolls back failures and retries once", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { second } = await seedSettlementCards(db);
    await taxRepository.saveYearEndTaxSalary(db, 2026, 40000000);
    await taxCardRepository.saveYearEndTaxCards(db, 2026, [second.id]);
    const [card] = (await taxRepository.loadYearEndTaxYear(db, 2026))
      .selectedCards;
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2026,
      month: 1,
      amounts: taxAmounts({ cash_receipt: 123 }),
      cards: [{ ...card, id: null, amount: 456 }],
    });
    await taxRepository.saveYearEndTaxMonth(db, {
      year: 2025,
      month: 12,
      amounts: taxAmounts(),
    });
    await repository.saveExpense(db, insuranceInput);
    await ledgerRepository.loadLedgerMonth(db, "2026-01");
    await db.execAsync(
      "ALTER TABLE monthly_tax_spending DROP COLUMN confirmed; PRAGMA user_version = 18;",
    );
    const tables = [
      "payment_methods",
      "expenses",
      "ledger_entries",
      "expense_amount_versions",
      "card_benefit_versions",
      "monthly_card_benefits",
      "annual_tax_settings",
      "annual_tax_cards",
      "monthly_tax_cards",
    ];
    const read = () =>
      Promise.all(
        tables.map((table) =>
          db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`),
        ),
      );
    const before = await read();
    const amountsBefore = await db.getAllAsync(
      "SELECT * FROM monthly_tax_spending ORDER BY year, month",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 19;")
        throw new Error("confirmation migration failure");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /confirmation migration failure/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      18,
    );
    assert.ok(
      !(await db.getAllAsync("PRAGMA table_info(monthly_tax_spending)")).some(
        (column) => column.name === "confirmed",
      ),
    );
    assert.deepEqual(await read(), before);
    assert.deepEqual(
      await db.getAllAsync(
        "SELECT * FROM monthly_tax_spending ORDER BY year, month",
      ),
      amountsBefore,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    await repository.initializeDatabase(db);
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      19,
    );
    assert.deepEqual(await read(), before);
    const rows = await db.getAllAsync(
      "SELECT * FROM monthly_tax_spending ORDER BY year, month",
    );
    assert.deepEqual(
      rows.map(({ confirmed, ...row }) => row),
      amountsBefore.map((row) => ({ ...row })),
    );
    assert.ok(rows.every((row) => row.confirmed === 0));
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0].confirmed,
      false,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
  }
});

test("v17 tax card migration moves legacy debit totals only to unique OhaCheck and rolls back the whole change on failure", async () => {
  const db = sqliteAdapter();
  try {
    await repository.initializeDatabase(db);
    const { second } = await seedSettlementCards(db);
    await db.runAsync(
      "UPDATE payment_methods SET name = '오하Check' WHERE id = ?",
      second.id,
    );
    const entries = [
      {
        year: 2025,
        month: 1,
        amounts: taxAmounts({
          debit_card: 123456,
          cash_receipt: 100,
          credit_card: 200,
        }),
      },
      {
        year: 2026,
        month: 1,
        amounts: taxAmounts({ debit_card: 987654, local_card: 300 }),
      },
      { year: 2026, month: 2, amounts: taxAmounts() },
    ];
    for (const entry of entries)
      await taxRepository.saveYearEndTaxMonth(db, entry);
    await taxRepository.saveYearEndTaxSalary(db, 2026, 40000000);
    await db.execAsync(
      "DROP TABLE monthly_tax_cards; DROP TABLE annual_tax_cards; PRAGMA user_version = 17;",
    );
    const before = await db.getAllAsync(
      "SELECT * FROM monthly_tax_spending ORDER BY year, month",
    );
    const exec = db.execAsync;
    db.execAsync = async (sql) => {
      await exec(sql);
      if (sql === "PRAGMA user_version = 18;")
        throw new Error("card migration failed");
    };
    await assert.rejects(
      repository.initializeDatabase(db),
      /card migration failed/,
    );
    assert.equal(
      (await db.getFirstAsync("PRAGMA user_version")).user_version,
      17,
    );
    assert.equal(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name = 'monthly_tax_cards'",
      ),
      undefined,
    );
    assert.deepEqual(
      await db.getAllAsync(
        "SELECT * FROM monthly_tax_spending ORDER BY year, month",
      ),
      before,
    );
    db.execAsync = exec;
    await repository.initializeDatabase(db);
    await repository.initializeDatabase(db);
    for (const entry of entries) {
      const loaded = await taxRepository.loadYearEndTaxYear(db, entry.year);
      const month = loaded.months.find((item) => item.month === entry.month);
      assert.equal(month.amounts.debit_card, 0);
      assert.equal(month.cards.length, 1);
      assert.equal(month.cards[0].methodId, second.id);
      assert.equal(month.cards[0].name, "오하Check");
      assert.equal(month.cards[0].amount, entry.amounts.debit_card);
      assert.equal(
        taxDomain.taxEntryTotal(month),
        taxDomain.taxMonthTotal(entry.amounts),
      );
      assert.equal(loaded.selectedCards[0].methodId, second.id);
      assert.equal(month.amounts.credit_card, entry.amounts.credit_card);
    }
    const loaded = await taxRepository.loadYearEndTaxYear(db, 2026);
    assert.equal(
      taxDomain.remainingTaxTarget(loaded.grossSalary, loaded.months),
      9012046,
    );
    assert.equal(
      (await db.getAllAsync("SELECT * FROM monthly_tax_cards")).length,
      3,
    );
  } finally {
    db.sqlite.close();
  }
});

test("absent or duplicate OhaCheck names never receive an arbitrary legacy assignment", async () => {
  for (const duplicate of [false, true]) {
    const db = sqliteAdapter();
    try {
      await repository.initializeDatabase(db);
      const { second, input } = await seedSettlementCards(db);
      if (duplicate) {
        await db.runAsync(
          "UPDATE payment_methods SET name = '오하Check' WHERE id = ?",
          second.id,
        );
        await repository.saveMethod(db, {
          ...input,
          name: "오하Check",
          cardTypeCode: "debit",
          settlementDay: null,
        });
      }
      await taxRepository.saveYearEndTaxMonth(db, {
        year: 2026,
        month: 1,
        amounts: taxAmounts({ debit_card: 123 }),
      });
      await db.execAsync(
        "DROP TABLE monthly_tax_cards; DROP TABLE annual_tax_cards; PRAGMA user_version = 17;",
      );
      await repository.initializeDatabase(db);
      const loaded = await taxRepository.loadYearEndTaxYear(db, 2026);
      assert.equal(loaded.months[0].amounts.debit_card, 123);
      assert.deepEqual(loaded.months[0].cards, []);
      assert.deepEqual(loaded.selectedCards, []);
    } finally {
      db.sqlite.close();
    }
  }
});

test("selected tax cards and monthly amounts persist by ID and year, survive deselection and deletion, and save atomically", async () => {
  const directory = mkdtempSync(join(tmpdir(), "monthpin-tax-cards-"));
  const path = join(directory, "cards.db");
  let db = sqliteAdapter(path);
  try {
    await repository.initializeDatabase(db);
    const { first, second, bank } = await seedSettlementCards(db);
    await taxCardRepository.saveYearEndTaxCards(db, 2026, [
      second.id,
      first.id,
    ]);
    await taxCardRepository.saveYearEndTaxCards(db, 2025, [first.id]);
    for (const ids of [[bank.id], [99999], [first.id, first.id], ["1"]])
      await assert.rejects(
        taxCardRepository.saveYearEndTaxCards(db, 2026, ids),
      );
    const selected = (await taxRepository.loadYearEndTaxYear(db, 2026))
      .selectedCards;
    assert.deepEqual(
      selected.map((card) => card.methodId),
      [second.id, first.id],
    );
    const entry = {
      year: 2026,
      month: 1,
      amounts: taxAmounts({ cash_receipt: 10, local_card: 20 }),
      cards: selected.map((card, index) => ({
        ...card,
        id: null,
        amount: index ? 200 : 100,
      })),
    };
    await taxRepository.saveYearEndTaxMonth(db, entry);
    let month = (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0];
    assert.equal(taxDomain.taxEntryTotal(month), 330);
    const original = structuredClone(month);
    await db.execAsync(
      "CREATE TRIGGER reject_tax_card BEFORE UPDATE ON monthly_tax_cards WHEN NEW.amount = 777 BEGIN SELECT RAISE(ABORT, 'failed card amount'); END;",
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...month,
        amounts: taxAmounts({ cash_receipt: 999 }),
        cards: month.cards.map((card) => ({ ...card, amount: 777 })),
      }),
      /failed card amount/,
    );
    assert.deepEqual(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      original,
    );
    await db.execAsync("DROP TRIGGER reject_tax_card;");
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, { ...month, cards: [] }),
      /내역/,
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...month,
        cards: [month.cards[0], month.cards[0], month.cards[1]],
      }),
      /내역/,
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...month,
        cards: month.cards.map((card) => ({ ...card, amount: -1 })),
      }),
      /사용금액/,
    );
    await assert.rejects(
      taxRepository.saveYearEndTaxMonth(db, {
        ...month,
        cards: [
          ...month.cards,
          { ...month.cards[0], id: null, methodId: bank.id },
        ],
      }),
      /선택/,
    );
    await taxCardRepository.saveYearEndTaxCards(db, 2026, []);
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2026)).selectedCards.length,
      0,
    );
    assert.equal(
      taxDomain.taxEntryTotal(
        (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      ),
      330,
    );
    await db.runAsync(
      "UPDATE payment_methods SET name = '변경한 카드명' WHERE id = ?",
      second.id,
    );
    await repository.deleteMethod(db, second.id);
    month = (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0];
    const deleted = month.cards.find(
      (card) => card.id === original.cards[0].id,
    );
    assert.equal(deleted.methodId, null);
    assert.equal(deleted.name, original.cards[0].name);
    assert.equal(deleted.amount, 100);
    assert.equal(taxDomain.taxEntryTotal(month), 330);
    await taxRepository.saveYearEndTaxMonth(db, {
      ...month,
      cards: month.cards.map((card) => ({
        ...card,
        amount: card.id === deleted.id ? 150 : card.amount,
      })),
    });
    assert.equal(
      taxDomain.taxEntryTotal(
        (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      ),
      380,
    );
    assert.equal(
      (await taxRepository.loadYearEndTaxYear(db, 2025)).selectedCards[0]
        .methodId,
      first.id,
    );
    db.sqlite.close();
    db = sqliteAdapter(path);
    await repository.initializeDatabase(db);
    assert.equal(
      taxDomain.taxEntryTotal(
        (await taxRepository.loadYearEndTaxYear(db, 2026)).months[0],
      ),
      380,
    );
    assert.deepEqual(await db.getAllAsync("PRAGMA foreign_key_check"), []);
  } finally {
    db.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tax spending fields place cash and local cards first, retain saved deselected cards and isolate IDs with duplicate names", () => {
  const selected = [
    {
      methodId: 1,
      name: "오하Check",
      providerName: "은행",
      cardTypeCode: "debit",
    },
    {
      methodId: 2,
      name: "오하Check",
      providerName: "다른 은행",
      cardTypeCode: "debit",
    },
  ];
  const saved = [
    { ...selected[0], id: 10, amount: 123 },
    {
      id: 20,
      methodId: null,
      name: "삭제된 신용카드",
      providerName: "카드사",
      cardTypeCode: "credit",
      amount: 456,
    },
  ];
  const fields = taxFieldDomain.taxSpendingFields(
    taxAmounts({ credit_card: 789 }),
    selected,
    saved,
  );
  assert.deepEqual(
    fields.slice(0, 2).map((field) => field.code),
    ["cash_receipt", "local_card"],
  );
  assert.deepEqual(
    fields.slice(2).map((field) => field.key),
    ["entry_10", "method_2", "entry_20", "credit_card"],
  );
  assert.equal(fields[2].initialValue, 123);
  assert.match(fields[4].hint, /삭제된/);
  assert.equal(fields[5].initialValue, 789);
  const deselected = taxFieldDomain.taxSpendingFields(taxAmounts(), [], saved);
  assert.equal(
    deselected.find((field) => field.key === "entry_10").initialValue,
    123,
  );
  assert.match(
    deselected.find((field) => field.key === "entry_10").hint,
    /선택 해제/,
  );
  const mixed = taxFieldDomain.taxSpendingFields(
    taxAmounts({ debit_card: 321, credit_card: 789 }),
    [
      {
        methodId: 3,
        name: "신용카드",
        providerName: "카드사",
        cardTypeCode: "credit",
      },
      ...selected,
    ],
    saved,
  );
  assert.deepEqual(
    mixed.map((field) => field.key),
    [
      "cash_receipt",
      "local_card",
      "entry_10",
      "method_2",
      "debit_card",
      "method_3",
      "entry_20",
      "credit_card",
    ],
  );
  assert.deepEqual(
    mixed.map((field) => field.group),
    [
      "general",
      "general",
      "debit",
      "debit",
      "debit",
      "credit",
      "credit",
      "credit",
    ],
  );
});

test("yearly card selection uses saved IDs, excludes banks and untyped cards, and retains choices after failures", async () => {
  const methods = [
    { id: 1, kind: "bank", name: "통장", provider: "은행" },
    {
      id: 11,
      kind: "card",
      name: "오하Check",
      provider: "은행",
      providerCode: null,
      cardTypeCode: "debit",
    },
    {
      id: 12,
      kind: "card",
      name: "신용1",
      provider: "카드사",
      providerCode: null,
      cardTypeCode: "credit",
    },
    {
      id: 13,
      kind: "card",
      name: "종류 미지정",
      provider: "카드사",
      providerCode: null,
      cardTypeCode: null,
    },
  ];
  let fail = true;
  let finish;
  let closed = 0;
  const saves = [];
  const runtime = hookRuntime(
    "src/components/year-end-card-selection-form.tsx",
    {
      "react-native": {
        View: "View",
        Pressable: "Pressable",
        StyleSheet: { create: (styles) => styles },
      },
      "@expo/vector-icons/Ionicons": "Icon",
      "./typography": { AppText: "Text" },
      "./ui": {
        Button: "Button",
        FieldMessage: "FieldMessage",
        colors: {},
        s: {},
      },
      "./provider-icon": { ProviderIcon: "ProviderIcon" },
      "../utils/expenses": domain,
      "../hooks/use-month-pin": {
        useMonthPin: () => ({
          methods,
          busy: false,
          saveYearEndTaxCards: async (year, ids) => {
            saves.push({ year, ids });
            if (fail) throw new Error("카드 저장 실패");
            await new Promise((resolve) => {
              finish = resolve;
            });
          },
        }),
      },
    },
  );
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = () =>
    flatten(
      runtime.render(({ YearEndCardSelectionForm }) =>
        YearEndCardSelectionForm({
          year: 2025,
          selectedIds: [11],
          onClose: () => closed++,
        }),
      ),
    );
  const choices = () =>
    render().filter((node) => node.props?.accessibilityRole === "checkbox");
  assert.equal(choices().length, 2);
  assert.equal(
    choices().find((node) => node.props.accessibilityLabel === "은행 오하Check")
      .props.accessibilityState.checked,
    true,
  );
  choices()
    .find((node) => node.props.accessibilityLabel === "카드사 신용1")
    .props.onPress();
  const save = () =>
    render()
      .find((node) => node.type === "Button")
      .props.onPress();
  save();
  await settle();
  assert.deepEqual(saves[0], { year: 2025, ids: [11, 12] });
  assert.equal(closed, 0);
  assert.equal(
    render().find((node) => node.type === "FieldMessage").props.error,
    "카드 저장 실패",
  );
  assert.ok(choices().every((node) => node.props.accessibilityState.checked));
  fail = false;
  save();
  save();
  assert.equal(saves.length, 2);
  finish();
  await settle();
  assert.equal(closed, 1);
});
