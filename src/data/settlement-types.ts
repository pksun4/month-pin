export const SETTLEMENT_VIEWS = [
  { code: "annual_summary", label: "고정비" },
  { code: "interest_income", label: "이자" },
  { code: "year_end_tax", label: "연말정산" },
] as const;

export type SettlementViewCode = (typeof SETTLEMENT_VIEWS)[number]["code"];
