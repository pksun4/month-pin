import type { SQLiteDatabase } from "expo-sqlite";
import type { CardBenefitTypeCode } from "./method-types";
import { CARD_BENEFIT_TYPES } from "./method-types";
import type { CardBenefitEntry } from "./models";
import type { ProviderCode } from "./providers";
import { isValidMonth, monthKey } from "../utils/ledger";

export interface CardBenefitSetting {
  name: string;
  providerCode: ProviderCode | null;
  providerName: string;
  benefitTypeCode: CardBenefitTypeCode | null;
  expectedAmount: number | null;
}

export const CARD_BENEFIT_HISTORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS card_benefit_versions (
    methodId INTEGER NOT NULL CHECK (methodId > 0),
    effectiveMonth TEXT NOT NULL CHECK (effectiveMonth GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND CAST(substr(effectiveMonth, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    providerCode TEXT REFERENCES payment_providers(code),
    providerName TEXT NOT NULL,
    benefitTypeCode TEXT CHECK (benefitTypeCode IS NULL OR benefitTypeCode IN (${CARD_BENEFIT_TYPES.map((type) => `'${type.code}'`).join(", ")})),
    expectedAmount INTEGER,
    PRIMARY KEY (methodId, effectiveMonth),
    CHECK ((benefitTypeCode IS NULL AND expectedAmount IS NULL)
      OR (benefitTypeCode IS NOT NULL AND expectedAmount IS NOT NULL
        AND typeof(expectedAmount) = 'integer' AND expectedAmount BETWEEN 0 AND 999999999))
  );
`;

// Unknown legacy registration dates keep the previous all-month display range.
// Seed only cards without any history; never add a baseline to newly registered cards.
export function seedCardBenefitHistory(db: SQLiteDatabase) {
  return db.runAsync(`INSERT INTO card_benefit_versions
    (methodId, effectiveMonth, name, providerCode, providerName, benefitTypeCode, expectedAmount)
    SELECT m.id, '1000-01', m.name, m.providerCode, COALESCE(p.name, m.legacyProvider), m.benefitTypeCode, m.benefitAmount
    FROM payment_methods m LEFT JOIN payment_providers p ON p.code = m.providerCode
    WHERE m.kind = 'card' AND NOT EXISTS (SELECT 1 FROM card_benefit_versions v WHERE v.methodId = m.id)`);
}

// Runs in the transaction for the card edit/deletion. Actual monthly confirmations are untouched.
export async function applyCardBenefitChange(
  db: SQLiteDatabase,
  methodId: number,
  setting: CardBenefitSetting,
  effectiveMonth: string,
) {
  if (!isValidMonth(effectiveMonth) || effectiveMonth < monthKey())
    throw new Error("변경 적용 월은 이번 달 이후로 선택해 주세요.");
  await db.runAsync(
    "DELETE FROM card_benefit_versions WHERE methodId = ? AND effectiveMonth >= ?",
    methodId,
    effectiveMonth,
  );
  await writeSetting(db, methodId, setting, effectiveMonth);
}

function writeSetting(
  db: SQLiteDatabase,
  methodId: number,
  setting: CardBenefitSetting,
  effectiveMonth: string,
) {
  return db.runAsync(
    `INSERT INTO card_benefit_versions
    (methodId, effectiveMonth, name, providerCode, providerName, benefitTypeCode, expectedAmount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(methodId, effectiveMonth) DO UPDATE SET name = excluded.name,
      providerCode = excluded.providerCode, providerName = excluded.providerName,
      benefitTypeCode = excluded.benefitTypeCode, expectedAmount = excluded.expectedAmount`,
    methodId,
    effectiveMonth,
    setting.name,
    setting.providerCode,
    setting.providerName,
    setting.benefitTypeCode,
    setting.expectedAmount,
  );
}

// A name/provider edit must not bring a scheduled benefit amount forward to this month.
export async function updateCardBenefitMetadata(
  db: SQLiteDatabase,
  methodId: number,
  setting: CardBenefitSetting,
) {
  const currentMonth = monthKey();
  const current = await db.getFirstAsync<
    Pick<CardBenefitSetting, "benefitTypeCode" | "expectedAmount">
  >(
    "SELECT benefitTypeCode, expectedAmount FROM card_benefit_versions WHERE methodId = ? AND effectiveMonth <= ? ORDER BY effectiveMonth DESC LIMIT 1",
    methodId,
    currentMonth,
  );
  if (current)
    await writeSetting(db, methodId, { ...setting, ...current }, currentMonth);
  await db.runAsync(
    "UPDATE card_benefit_versions SET name = ?, providerCode = ?, providerName = ? WHERE methodId = ? AND effectiveMonth >= ?",
    setting.name,
    setting.providerCode,
    setting.providerName,
    methodId,
    currentMonth,
  );
}

export function readCardBenefitEstimates(db: SQLiteDatabase, month: string) {
  return db.getAllAsync<CardBenefitEntry>(
    `SELECT v.methodId, v.name, v.providerCode, v.providerName,
    v.benefitTypeCode, v.expectedAmount,
    CASE WHEN v.benefitTypeCode = 'fixed' THEN v.expectedAmount ELSE NULL END AS amount
    FROM card_benefit_versions v
    LEFT JOIN payment_methods m ON m.id = v.methodId
    WHERE v.effectiveMonth = (SELECT MAX(previous.effectiveMonth) FROM card_benefit_versions previous
      WHERE previous.methodId = v.methodId AND previous.effectiveMonth <= ?)
      AND v.benefitTypeCode IS NOT NULL AND v.expectedAmount IS NOT NULL
    ORDER BY COALESCE(m.sortOrder, 2147483647), v.methodId`,
    month,
  );
}
