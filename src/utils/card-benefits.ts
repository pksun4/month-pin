import type { CardBenefitMonth } from "../data/models";

export function cardBenefitMonthSummary(snapshot: CardBenefitMonth | null) {
  const cards = snapshot?.cards ?? [];
  return {
    total: cards.reduce(
      (sum, card) => sum + (card.amount ?? card.expectedAmount),
      0,
    ),
    variableCount: cards.filter((card) => card.benefitTypeCode === "variable")
      .length,
    pending: cards.filter(
      (card) => card.benefitTypeCode === "variable" && card.amount === null,
    ).length,
    confirmed: snapshot?.confirmed ?? false,
  };
}
