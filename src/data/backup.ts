import type { SQLiteDatabase } from "expo-sqlite";

// Explicitly include every MonthPin table, including snapshots of deleted records.
export const BACKUP_TABLES = [
  "payment_providers",
  "payment_methods",
  "expenses",
  "ledger_entries",
  "expense_amount_versions",
  "monthly_card_benefits",
  "card_benefit_versions",
  "annual_tax_settings",
  "monthly_tax_spending",
  "annual_tax_cards",
  "monthly_tax_cards",
  "interest_income_entries",
] as const;

// Older installs retain this retired feature's data; never silently discard it.
const OPTIONAL_BACKUP_TABLES = ["monthly_card_usage"] as const;
const ALLOWED_TABLES = [...BACKUP_TABLES, ...OPTIONAL_BACKUP_TABLES] as const;
type RequiredTableName = (typeof BACKUP_TABLES)[number];
type OptionalTableName = (typeof OPTIONAL_BACKUP_TABLES)[number];
type TableName = (typeof ALLOWED_TABLES)[number];
type Row = Record<string, string | number | null>;
export interface Backup {
  format: "monthpin_backup";
  formatVersion: 1;
  schemaVersion: number;
  createdAt: string;
  tables: Record<RequiredTableName, Row[]> &
    Partial<Record<OptionalTableName, Row[]>>;
  sequences: { name: string; seq: number }[];
}

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const invalid = () => new Error("올바른 몬스핀 백업 파일이 아니에요.");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const LEGACY_CARD_USAGE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS monthly_card_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    methodId INTEGER NOT NULL,
    methodName TEXT NOT NULL,
    providerName TEXT NOT NULL,
    providerCode TEXT,
    cardTypeCode TEXT,
    amount INTEGER NOT NULL,
    UNIQUE(month, methodId)
  );
`;

export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    !isRecord(value) ||
    value.format !== "monthpin_backup" ||
    value.formatVersion !== 1 ||
    !Number.isSafeInteger(value.schemaVersion) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !isRecord(value.tables) ||
    !Array.isArray(value.sequences)
  )
    throw invalid();
  const tables = value.tables;
  if (
    !BACKUP_TABLES.every((name) => Object.hasOwn(tables, name)) ||
    Object.keys(tables).some(
      (name) => !ALLOWED_TABLES.includes(name as TableName),
    )
  )
    throw invalid();
  for (const name of Object.keys(tables) as TableName[]) {
    const rows = tables[name];
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row) =>
          !isRecord(row) ||
          Object.values(row).some(
            (cell) =>
              cell !== null &&
              typeof cell !== "string" &&
              !(typeof cell === "number" && Number.isSafeInteger(cell)),
          ),
      )
    )
      throw invalid();
  }
  const sequenceNames = new Set<string>();
  for (const sequence of value.sequences) {
    if (
      !isRecord(sequence) ||
      !sameKeys(sequence, ["name", "seq"]) ||
      typeof sequence.name !== "string" ||
      !ALLOWED_TABLES.includes(sequence.name as TableName) ||
      !Object.hasOwn(value.tables, sequence.name) ||
      sequenceNames.has(sequence.name) ||
      !Number.isSafeInteger(sequence.seq) ||
      (sequence.seq as number) < 0
    )
      throw invalid();
    sequenceNames.add(sequence.name);
  }
  return value as unknown as Backup;
}

async function schemaVersion(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
}

async function checkTables(db: SQLiteDatabase) {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const missing = BACKUP_TABLES.filter(
    (name) => !tables.some((table) => table.name === name),
  );
  const unknown = tables.filter(
    ({ name }) => !ALLOWED_TABLES.includes(name as TableName),
  );
  if (missing.length || unknown.length)
    throw new Error(
      `백업 기능 업데이트가 필요해요. 저장 구조를 확인해 주세요. (${[
        ...missing.map((name) => `누락: ${name}`),
        ...unknown.map(({ name }) => `미지원: ${name}`),
      ].join(", ")})`,
    );
  return ALLOWED_TABLES.filter((name) =>
    tables.some((table) => table.name === name),
  );
}

export async function createBackup(db: SQLiteDatabase): Promise<Backup> {
  let backup!: Backup;
  await db.withTransactionAsync(async () => {
    const names = await checkTables(db);
    const tables = {} as Backup["tables"];
    for (const name of names)
      tables[name] = await db.getAllAsync<Row>(`SELECT * FROM ${name}`);
    backup = {
      format: "monthpin_backup",
      formatVersion: 1,
      schemaVersion: await schemaVersion(db),
      createdAt: new Date().toISOString(),
      tables,
      sequences: await db.getAllAsync(
        "SELECT name, seq FROM sqlite_sequence ORDER BY name",
      ),
    };
  });
  return backup;
}

// Import into an unused app only: never replace or merge existing financial data.
// The provider serializes this transaction with all normal reads and writes.
export async function restoreBackup(db: SQLiteDatabase, input: Backup) {
  const backup = parseBackup(JSON.stringify(input));
  if (backup.schemaVersion !== (await schemaVersion(db)))
    throw new Error("백업한 앱과 같은 버전으로 업데이트한 뒤 불러와 주세요.");
  await db.withTransactionAsync(async () => {
    const existingNames = await checkTables(db);
    for (const name of existingNames.slice(1)) {
      if (await db.getFirstAsync(`SELECT 1 FROM ${name} LIMIT 1`))
        throw new Error(
          "기존 기록을 보호하기 위해 데이터가 없는 앱에서만 불러올 수 있어요.",
        );
    }
    // Only restore the known archival table when the source actually had it.
    // The DDL is application-owned; no SQL from the backup is executed.
    if (Object.hasOwn(backup.tables, "monthly_card_usage"))
      await db.execAsync(LEGACY_CARD_USAGE_SCHEMA);
    // Defer the self-reference from cards to bank accounts until all rows exist.
    await db.execAsync("PRAGMA defer_foreign_keys = ON;");
    const autoTables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%'",
    );
    if (
      backup.sequences.some(
        ({ name }) => !autoTables.some((table) => table.name === name),
      )
    )
      throw invalid();
    const providers = await db.getAllAsync<Row>(
      "SELECT * FROM payment_providers",
    );
    for (const name of ALLOWED_TABLES) {
      const rows = backup.tables[name];
      if (!rows) continue;
      const info = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(${name})`,
      );
      const columns = info.map((column) => column.name);
      if (
        name === "payment_providers" &&
        providers.length !== backup.tables[name].length
      )
        throw invalid();
      for (const row of rows) {
        if (
          !sameKeys(row, columns) ||
          (Object.hasOwn(row, "id") &&
            (typeof row.id !== "number" || row.id < 1))
        )
          throw invalid();
        if (name === "payment_providers") {
          if (
            !providers.some((provider) =>
              columns.every((key) => provider[key] === row[key]),
            )
          )
            throw invalid();
          continue;
        }
        await db.runAsync(
          `INSERT INTO ${name} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          ...columns.map((column) => row[column]),
        );
      }
    }
    for (const { name } of autoTables) {
      const maxId = (backup.tables[name as TableName] ?? []).reduce(
        (max, row) => Math.max(max, row.id as number),
        0,
      );
      const saved = backup.sequences.find((sequence) => sequence.name === name);
      if ((saved?.seq ?? 0) < maxId) throw invalid();
      await db.runAsync("DELETE FROM sqlite_sequence WHERE name = ?", name);
      if (saved)
        await db.runAsync(
          "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)",
          name,
          saved.seq,
        );
    }
    const foreignKeys = await db.getAllAsync("PRAGMA foreign_key_check");
    const integrity = await db.getFirstAsync<{ quick_check: string }>(
      "PRAGMA quick_check",
    );
    if (foreignKeys.length || integrity?.quick_check !== "ok") throw invalid();
  });
}
