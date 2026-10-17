import { useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AppText as Text } from "./typography";
import type { CardBenefitEntry, CardBenefitMonth } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatAmountInput, money, sortCardsByType } from "../utils/expenses";
import { formatMonth, parseLedgerAmount } from "../utils/ledger";
import { Button, Field, FieldMessage, s, useFormNavigation } from "./ui";

type FocusRequest = { methodId: number; attempt: number };

export function CardBenefitForm({
  snapshot,
  onClose,
}: {
  snapshot: CardBenefitMonth;
  onClose: () => void;
}) {
  const { saveCardBenefitMonth, busy, methods } = useMonthPin();
  const variable = sortCardsByType(
    snapshot.cards
      .filter((card) => card.benefitTypeCode === "variable")
      .map((card) => ({
        card,
        cardTypeCode: methods.find((method) => method.id === card.methodId)
          ?.cardTypeCode,
      })),
  ).map(({ card }) => card);
  const fixedTotal = snapshot.cards
    .filter((card) => card.benefitTypeCode === "fixed")
    .reduce((sum, card) => sum + card.expectedAmount, 0);
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      variable.map((card) => [
        card.methodId,
        formatAmountInput(String(card.amount ?? card.expectedAmount)),
      ]),
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [saveError, setSaveError] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const savingRef = useRef(false);
  const errors = Object.fromEntries(
    variable.map((card) => [
      card.methodId,
      parseLedgerAmount(values[card.methodId] ?? "") === null
        ? "실제 혜택을 0원부터 999,999,999원까지 입력해 주세요."
        : "",
    ]),
  );
  async function save() {
    if (busy || savingRef.current) return;
    setSubmitted(true);
    setSaveError("");
    const first = variable.find((card) => errors[card.methodId]);
    if (first) {
      setFocusRequest((previous) => ({
        methodId: first.methodId,
        attempt: (previous?.attempt ?? 0) + 1,
      }));
      return;
    }
    savingRef.current = true;
    try {
      await saveCardBenefitMonth(
        snapshot.month,
        variable.map((card) => ({
          methodId: card.methodId,
          amount: parseLedgerAmount(values[card.methodId])!,
        })),
      );
      onClose();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      savingRef.current = false;
    }
  }
  return (
    <>
      <Text style={s.body}>
        {formatMonth(snapshot.month)}의 실제 카드 혜택을 확인해 주세요.{" "}
        {!snapshot.confirmed &&
          "예상 금액을 미리 채웠어요. 실제와 다르면 수정해 주세요. "}
        혜택이 없으면 0원을 입력해 주세요.
      </Text>
      {variable.map((card) => (
        <CardBenefitAmountField
          key={card.methodId}
          card={card}
          value={values[card.methodId] ?? ""}
          disabled={busy}
          error={
            submitted || touched[card.methodId] ? errors[card.methodId] : ""
          }
          focusRequest={
            focusRequest?.methodId === card.methodId ? focusRequest : undefined
          }
          onBlur={() =>
            setTouched((previous) => ({ ...previous, [card.methodId]: true }))
          }
          onChange={(value) => {
            setValues((previous) => ({
              ...previous,
              [card.methodId]: formatAmountInput(
                value,
                previous[card.methodId],
              ),
            }));
            setSaveError("");
          }}
        />
      ))}
      <Text style={s.caption}>
        고정 혜택 {money(fixedTotal)}은 자동으로 포함돼요. 이 달의 확정 금액만
        저장하며, 카드의 월 예상액은 유지해요.
      </Text>
      <FieldMessage error={saveError} />
      <Button
        label={
          busy
            ? "저장 중…"
            : snapshot.confirmed
              ? "확정 금액 수정"
              : "혜택 확정"
        }
        disabled={busy || variable.length === 0}
        onPress={() => void save()}
      />
    </>
  );
}

function CardBenefitAmountField({
  card,
  value,
  error,
  disabled,
  focusRequest,
  onBlur,
  onChange,
}: {
  card: CardBenefitEntry;
  value: string;
  error: string;
  disabled: boolean;
  focusRequest?: FocusRequest;
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);
  const revealField = useFormNavigation();
  useEffect(() => {
    if (!focusRequest) return;
    const focus = () => inputRef.current?.focus();
    if (revealField) revealField(containerRef.current, focus);
    else focus();
  }, [focusRequest, revealField]);
  return (
    <View ref={containerRef} collapsable={false}>
      <Field
        label={`${card.providerName} · ${card.name}`}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        numeric
        required
        disabled={disabled}
        error={error}
        hint={`월 예상 혜택 ${money(card.expectedAmount)}`}
        placeholder="실제 혜택 금액 (원)"
        maxLength={11}
        controlRef={inputRef}
      />
    </View>
  );
}
