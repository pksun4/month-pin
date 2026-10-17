import type { AnnualSummary } from "../data/models";

export function monthsOfYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error("연도를 다시 확인해 주세요.");
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function annualTotals(snapshot: AnnualSummary) {
  const expenseTotal = snapshot.months.reduce(
    (sum, month) => sum + month.expenseTotal,
    0,
  );
  const benefitTotal = snapshot.months.reduce(
    (sum, month) => sum + month.benefitTotal,
    0,
  );
  return {
    expenseTotal,
    benefitTotal,
    estimatedTotal: expenseTotal - benefitTotal,
    expenseCount: snapshot.months.reduce(
      (sum, month) => sum + month.expenseCount,
      0,
    ),
    pendingExpenses: snapshot.months.reduce(
      (sum, month) => sum + month.pendingExpenses,
      0,
    ),
    pendingBenefitMonths: snapshot.months.filter(
      (month) => month.pendingBenefits > 0,
    ).length,
    benefitCount: snapshot.months.reduce(
      (sum, month) => sum + month.benefitCount,
      0,
    ),
  };
}
