import type { MethodKind, PaymentMethod } from "../data/models";
import {
  getCardBenefitType,
  getCardType,
  type CardBenefitTypeCode,
  type CardTypeCode,
} from "../data/method-types";
import { getProvider, type ProviderCode } from "../data/providers";
import { parseAmount, parseDay } from "./expenses";

export const METHOD_FORM_FIELDS = [
  "cardTypeCode",
  "providerCode",
  "name",
  "bankId",
  "day",
  "benefitTypeCode",
  "benefitAmount",
] as const;
export type MethodFormField = (typeof METHOD_FORM_FIELDS)[number];
export interface MethodFormValues {
  kind: MethodKind;
  providerCode: ProviderCode | null;
  name: string;
  cardTypeCode: CardTypeCode | null;
  bankId: number | null;
  day: string;
  benefitTypeCode: CardBenefitTypeCode | null;
  benefitAmount: string;
}

export function methodFormErrors(
  values: MethodFormValues,
  banks: readonly PaymentMethod[],
) {
  const errors: Partial<Record<MethodFormField, string>> = {};
  const {
    kind,
    providerCode,
    name,
    cardTypeCode,
    bankId,
    day,
    benefitTypeCode,
    benefitAmount,
  } = values;
  if (!providerCode || getProvider(providerCode)?.kind !== kind)
    errors.providerCode = `${kind === "bank" ? "은행을" : "카드사를"} 선택해 주세요.`;
  if (!name.trim())
    errors.name = `${kind === "bank" ? "통장 별명을" : "카드 이름을"} 입력해 주세요.`;
  else if (name.trim().length > 40) errors.name = "40자 이내로 입력해 주세요.";
  if (kind === "card") {
    if (!getCardType(cardTypeCode))
      errors.cardTypeCode = "카드 종류를 선택해 주세요.";
    if (!banks.some((bank) => bank.kind === "bank" && bank.id === bankId))
      errors.bankId = banks.length
        ? "연결할 통장을 선택해 주세요."
        : "통장을 먼저 등록해 주세요.";
    if (cardTypeCode === "credit" && parseDay(day) === null)
      errors.day = "출금일은 1~31일로 입력해 주세요.";
    if (!getCardBenefitType(benefitTypeCode))
      errors.benefitTypeCode = "고정·변동 유형을 선택해 주세요.";
    if (parseAmount(benefitAmount, 0) === null)
      errors.benefitAmount = benefitAmount.trim()
        ? "0~999,999,999원으로 입력해 주세요."
        : "혜택 금액을 입력해 주세요. 없으면 0원이에요.";
  }
  return errors;
}
