import type { SQLiteDatabase } from "expo-sqlite";
import type { AnnualMonthSummary, AnnualSummary } from "./models";
import { loadLedgerMonth } from "./ledger";
import { loadCardBenefitMonth } from "./card-benefits";
import { ledgerSummary } from "../utils/ledger";
import { cardBenefitMonthSummary } from "../utils/card-benefits";
import { monthsOfYear } from "../utils/annual-summary";

export async function loadAnnualSummary(
  db: SQLiteDatabase,
  year: number,
): Promise<AnnualSummary> {
  const monthKeys = monthsOfYear(year);
  const months: AnnualMonthSummary[] = [];
  // Month reads also create missing ledger entries. Keep the year consistent
  // and roll back those inserts if any month fails to load.
  await db.withTransactionAsync(async () => {
    for (const month of monthKeys) {
      const expenses = ledgerSummary(await loadLedgerMonth(db, month));
      const snapshot = await loadCardBenefitMonth(db, month);
      const benefits = cardBenefitMonthSummary(snapshot);
      months.push({
        month,
        expenseTotal: expenses.total,
        expenseCount: expenses.count,
        pendingExpenses: expenses.pending,
        benefitTotal: benefits.total,
        pendingBenefits: benefits.pending,
        benefitCount: snapshot.cards.length,
      });
    }
  });
  return { year, months };
}
