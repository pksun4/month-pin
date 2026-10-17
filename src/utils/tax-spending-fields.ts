import type { TaxCardSpending, YearEndTaxCard } from "../data/models";
import {
  TAX_SPENDING_METHODS,
  type TaxSpendingAmounts,
  type TaxSpendingMethodCode,
} from "../data/tax-spending-types";

export interface TaxSpendingField {
  key: string;
  group: "general" | "debit" | "credit";
  label: string;
  hint?: string;
  initialValue: number | null;
  code?: TaxSpendingMethodCode;
  card?: TaxCardSpending;
}

export function taxSpendingFields(
  amounts: TaxSpendingAmounts | null,
  selected: readonly YearEndTaxCard[],
  saved: readonly TaxCardSpending[],
): TaxSpendingField[] {
  const fields: TaxSpendingField[] = TAX_SPENDING_METHODS.filter(
    (method) => method.code === "cash_receipt" || method.code === "local_card",
  ).map((method) => ({
    key: method.code,
    group: "general",
    code: method.code,
    label: method.label,
    initialValue: amounts?.[method.code] ?? null,
  }));
  const cards: TaxCardSpending[] = selected.map(
    (card) =>
      saved.find((entry) => entry.methodId === card.methodId) ?? {
        ...card,
        id: null,
        amount: 0,
      },
  );
  cards.push(
    ...saved.filter(
      (entry) =>
        !cards.some((card) => entry.id !== null && card.id === entry.id),
    ),
  );
  for (const card of cards) {
    const included = selected.some((entry) => entry.methodId === card.methodId);
    fields.push({
      key: card.id === null ? `method_${card.methodId}` : `entry_${card.id}`,
      group: card.cardTypeCode,
      card,
      label: card.name,
      hint: included
        ? undefined
        : card.methodId === null
          ? "삭제된 카드의 저장 금액"
          : "선택 해제된 카드의 저장 금액",
      initialValue: card.id === null && amounts === null ? null : card.amount,
    });
  }
  for (const code of ["debit_card", "credit_card"] as const) {
    if ((amounts?.[code] ?? 0) > 0)
      fields.push({
        key: code,
        group: code === "debit_card" ? "debit" : "credit",
        code,
        label: "카드 미지정 금액",
        initialValue: amounts![code],
        hint: "기존에 합계로 입력한 금액을 보존했어요. 카드별로 옮길 때는 중복되지 않게 조정해 주세요.",
      });
  }
  const groupOrder = { general: 0, debit: 1, credit: 2 };
  return fields.sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);
}
