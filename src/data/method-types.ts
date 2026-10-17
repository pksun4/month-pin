export const METHOD_KINDS = [
  { code: "bank", label: "통장" },
  { code: "card", label: "카드" },
] as const;

export type MethodKind = (typeof METHOD_KINDS)[number]["code"];

export const METHOD_SORT_OPTIONS = [
  { code: "provider", label: "기관순" },
  { code: "registered", label: "등록순" },
  { code: "amount", label: "고정비순" },
  { code: "custom", label: "내순서" },
] as const;

export type MethodSortCode = (typeof METHOD_SORT_OPTIONS)[number]["code"];

export const CARD_TYPES = [
  { code: "debit", label: "체크카드" },
  { code: "credit", label: "신용카드" },
] as const;

export type CardTypeCode = (typeof CARD_TYPES)[number]["code"];

export function getCardType(code: string | null) {
  return CARD_TYPES.find((type) => type.code === code);
}

export const CARD_BENEFIT_TYPES = [
  { code: "fixed", label: "고정" },
  { code: "variable", label: "변동" },
] as const;

export type CardBenefitTypeCode = (typeof CARD_BENEFIT_TYPES)[number]["code"];

export function getCardBenefitType(code: string | null) {
  return CARD_BENEFIT_TYPES.find((type) => type.code === code);
}
