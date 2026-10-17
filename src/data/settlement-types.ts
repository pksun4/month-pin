export const SETTLEMENT_VIEWS = [
  { code: "annual_summary", label: "연간 요약" },
  { code: "year_end_tax", label: "연말정산" },
] as const;

export type SettlementViewCode = (typeof SETTLEMENT_VIEWS)[number]["code"];
