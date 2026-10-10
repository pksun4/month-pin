// Stable stored codes. Labels can change without changing saved values.
export const EXPENSE_AMOUNT_TYPES = [
  { code: "fixed", label: "고정", description: "매월 같은 금액" },
  { code: "variable", label: "변동", description: "매월 다른 금액" },
] as const;

export type ExpenseAmountTypeCode =
  (typeof EXPENSE_AMOUNT_TYPES)[number]["code"];

export const EXPENSE_CATEGORIES = [
  { code: "living", label: "생활" },
  { code: "subscription", label: "구독" },
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORIES)[number]["code"];
export const EXPENSE_CATEGORY_FILTERS = [
  { code: "all", label: "전체" },
  ...EXPENSE_CATEGORIES,
] as const;
export type ExpenseCategoryFilterCode =
  (typeof EXPENSE_CATEGORY_FILTERS)[number]["code"];

export function getExpenseCategory(code: string | null) {
  return EXPENSE_CATEGORIES.find((category) => category.code === code);
}

export const EXPENSE_SORT_OPTIONS = [
  { code: "charge_day", label: "결제일순" },
  { code: "registered", label: "등록순" },
  { code: "amount", label: "금액순" },
  { code: "custom", label: "내 순서" },
] as const;

export type ExpenseSortCode = (typeof EXPENSE_SORT_OPTIONS)[number]["code"];

export function getExpenseAmountType(code: string) {
  return EXPENSE_AMOUNT_TYPES.find((type) => type.code === code);
}
