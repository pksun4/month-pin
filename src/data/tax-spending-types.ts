export const TAX_SPENDING_METHODS = [
  { code: "cash_receipt", label: "현금영수증" },
  { code: "debit_card", label: "체크카드" },
  { code: "local_card", label: "지역카드" },
  { code: "credit_card", label: "신용카드" },
] as const;

export type TaxSpendingMethodCode =
  (typeof TAX_SPENDING_METHODS)[number]["code"];
export type TaxSpendingAmounts = Record<TaxSpendingMethodCode, number>;

export const MAX_TAX_SPENDING_AMOUNT = 9999999999;
