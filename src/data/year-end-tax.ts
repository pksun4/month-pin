import type { SQLiteDatabase } from "expo-sqlite";
import type { YearEndTaxSettings } from "./models";
import {
  isValidGrossSalary,
  MAX_GROSS_SALARY,
  validateTaxYear,
} from "../utils/year-end-tax";

export const YEAR_END_TAX_SCHEMA = `
  CREATE TABLE IF NOT EXISTS annual_tax_settings (
    year INTEGER PRIMARY KEY NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1000 AND 9999),
    grossSalary INTEGER NOT NULL CHECK (typeof(grossSalary) = 'integer' AND grossSalary BETWEEN 0 AND ${MAX_GROSS_SALARY})
  );
`;

export async function loadYearEndTaxSettings(
  db: SQLiteDatabase,
  year: number,
): Promise<YearEndTaxSettings> {
  validateTaxYear(year);
  const saved = await db.getFirstAsync<{ grossSalary: number }>(
    "SELECT grossSalary FROM annual_tax_settings WHERE year = ?",
    year,
  );
  return { year, grossSalary: saved?.grossSalary ?? null };
}

export async function saveYearEndTaxSalary(
  db: SQLiteDatabase,
  year: number,
  grossSalary: number,
) {
  validateTaxYear(year);
  if (!isValidGrossSalary(grossSalary))
    throw new Error("총급여를 0원부터 9,999,999,999원까지 입력해 주세요.");
  await db.runAsync(
    `INSERT INTO annual_tax_settings (year, grossSalary) VALUES (?, ?)
     ON CONFLICT(year) DO UPDATE SET grossSalary = excluded.grossSalary`,
    year,
    grossSalary,
  );
}
