import type { SQLiteDatabase } from "expo-sqlite";
import type {
  CardBenefitEntry,
  CardBenefitMonth,
  CardBenefitInput,
} from "./models";
import { CARD_BENEFIT_TYPES } from "./method-types";
import { daysInMonth } from "../utils/ledger";
import { readCardBenefitEstimates } from "./card-benefit-history";

const benefitCodes = CARD_BENEFIT_TYPES.map((type) => `'${type.code}'`).join(
  ", ",
);

export const CARD_BENEFIT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS monthly_card_benefits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL CHECK (month GLOB '[1-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND CAST(substr(month, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
    methodId INTEGER NOT NULL CHECK (methodId > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    providerCode TEXT REFERENCES payment_providers(code),
    providerName TEXT NOT NULL,
    benefitTypeCode TEXT NOT NULL CHECK (benefitTypeCode IN (${benefitCodes})),
    expectedAmount INTEGER NOT NULL CHECK (typeof(expectedAmount) = 'integer' AND expectedAmount BETWEEN 0 AND 999999999),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 0 AND 999999999),
    UNIQUE (month, methodId),
    CHECK (benefitTypeCode != 'fixed' OR amount = expectedAmount)
  );
`;

export async function loadCardBenefitMonth(
  db: SQLiteDatabase,
  month: string,
): Promise<CardBenefitMonth> {
  daysInMonth(month);
  const saved = await db.getAllAsync<CardBenefitEntry>(
    `SELECT methodId, name, providerCode, providerName, benefitTypeCode, expectedAmount, amount
     FROM monthly_card_benefits WHERE month = ? ORDER BY id`,
    month,
  );
  if (saved.length) return { month, confirmed: true, cards: saved };
  const cards = await readCardBenefitEstimates(db, month);
  return { month, confirmed: false, cards };
}

export async function saveCardBenefitMonth(
  db: SQLiteDatabase,
  month: string,
  inputs: readonly CardBenefitInput[],
) {
  daysInMonth(month);
  await db.withTransactionAsync(async () => {
    const snapshot = await loadCardBenefitMonth(db, month);
    const variable = snapshot.cards.filter(
      (card) => card.benefitTypeCode === "variable",
    );
    const values = new Map(
      inputs.map((input) => [input.methodId, input.amount]),
    );
    if (
      variable.length === 0 ||
      inputs.length !== variable.length ||
      values.size !== inputs.length ||
      variable.some((card) => !values.has(card.methodId)) ||
      inputs.some(
        (input) =>
          !Number.isSafeInteger(input.methodId) ||
          input.methodId < 1 ||
          !Number.isSafeInteger(input.amount) ||
          input.amount < 0 ||
          input.amount > 999999999,
      )
    )
      throw new Error(
        "변동 카드별 실제 혜택을 0원부터 999,999,999원까지 입력해 주세요.",
      );

    // Snapshot IDs deliberately have no live-card FK, like ledger_entries.methodId.
    // Confirmed months keep their original cards, names and fixed benefits after card edits/deletion.
    for (const card of snapshot.cards) {
      const amount =
        card.benefitTypeCode === "fixed"
          ? card.expectedAmount
          : values.get(card.methodId)!;
      await db.runAsync(
        `INSERT INTO monthly_card_benefits
          (month, methodId, name, providerCode, providerName, benefitTypeCode, expectedAmount, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(month, methodId) DO UPDATE SET amount = excluded.amount`,
        month,
        card.methodId,
        card.name,
        card.providerCode,
        card.providerName,
        card.benefitTypeCode,
        card.expectedAmount,
        amount,
      );
    }
  });
}
