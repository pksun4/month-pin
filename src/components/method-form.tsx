import { AppText as Text } from "./typography";
import { useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import type { MethodKind, PaymentMethod } from "../data/models";
import type { ProviderCode } from "../data/providers";
import {
  CARD_TYPES,
  CARD_BENEFIT_TYPES,
  METHOD_KINDS,
  type CardBenefitTypeCode,
  type CardTypeCode,
} from "../data/method-types";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatAmountInput, parseAmount, parseDay } from "../utils/expenses";
import {
  METHOD_FORM_FIELDS,
  methodFormErrors,
  type MethodFormField,
} from "../utils/method-form";
import { Button, Field, FieldMessage, s, useFormNavigation } from "./ui";
import { ProviderSelect } from "./provider-select";
import { FormSegments } from "./form-segments";
import { FormSelect } from "./form-select";
import { ChargeDayField } from "./charge-day-field";
import { ProviderIcon } from "./provider-icon";
import { MonthField } from "./month-field";
import { monthKey, isValidMonth } from "../utils/ledger";

export function MethodForm({
  method,
  initialKind,
  onClose,
}: {
  method?: PaymentMethod;
  initialKind: MethodKind;
  onClose: () => void;
}) {
  const { methods, saveMethod, busy } = useMonthPin();
  const [kind, setKind] = useState<MethodKind>(method?.kind ?? initialKind);
  const [providerCode, setProviderCode] = useState<ProviderCode | null>(
    method?.providerCode ?? null,
  );
  const [name, setName] = useState(method?.name ?? "");
  const [bankId, setBankId] = useState<number | null>(method?.bankId ?? null);
  const [cardTypeCode, setCardTypeCode] = useState<CardTypeCode | null>(
    method?.cardTypeCode ?? null,
  );
  const [day, setDay] = useState(
    method?.settlementDay ? String(method.settlementDay) : "",
  );
  const [benefitTypeCode, setBenefitTypeCode] =
    useState<CardBenefitTypeCode | null>(method?.benefitTypeCode ?? null);
  const [benefitAmount, setBenefitAmount] = useState(
    method?.benefitAmount != null
      ? formatAmountInput(String(method.benefitAmount))
      : "",
  );
  const [effectiveMonth, setEffectiveMonth] = useState(() => monthKey());
  const benefitChanged =
    !!method &&
    kind === "card" &&
    (benefitTypeCode !== method.benefitTypeCode ||
      parseAmount(benefitAmount, 0) !== method.benefitAmount);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<MethodFormField, boolean>>
  >({});
  const [saveError, setSaveError] = useState("");
  const submitting = useRef(false);
  const cardTypeCodeContainerRef = useRef<View>(null);
  const providerCodeContainerRef = useRef<View>(null);
  const nameContainerRef = useRef<View>(null);
  const bankIdContainerRef = useRef<View>(null);
  const dayContainerRef = useRef<View>(null);
  const benefitTypeCodeContainerRef = useRef<View>(null);
  const benefitAmountContainerRef = useRef<View>(null);
  const cardTypeCodeControlRef = useRef<View>(null);
  const providerCodeControlRef = useRef<View>(null);
  const nameControlRef = useRef<TextInput>(null);
  const bankIdControlRef = useRef<View>(null);
  const dayControlRef = useRef<TextInput>(null);
  const benefitTypeCodeControlRef = useRef<View>(null);
  const benefitAmountControlRef = useRef<TextInput>(null);
  const revealField = useFormNavigation();
  const banks = methods.filter((item) => item.kind === "bank");
  const bankOptions = banks.map((bank) => ({
    code: bank.id,
    label: bank.name,
    description: bank.provider,
    icon: <ProviderIcon code={bank.providerCode} size={24} />,
  }));
  const errors = methodFormErrors(
    {
      kind,
      providerCode,
      name,
      bankId,
      cardTypeCode,
      day,
      benefitTypeCode,
      benefitAmount,
    },
    banks,
  );
  const message = (field: MethodFormField) =>
    submitted || touched[field] ? (errors[field] ?? "") : "";
  function touch(field: MethodFormField) {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setSaveError("");
  }
  function changeKind(next: MethodKind) {
    if (kind === next) return;
    setKind(next);
    setProviderCode(null);
    setTouched({});
    setSubmitted(false);
    setSaveError("");
  }
  async function submit() {
    if (busy || submitting.current) return;
    setSubmitted(true);
    setSaveError("");
    const first = METHOD_FORM_FIELDS.find((field) => errors[field]);
    if (first) {
      const containers = {
        cardTypeCode: cardTypeCodeContainerRef,
        providerCode: providerCodeContainerRef,
        name: nameContainerRef,
        bankId: bankIdContainerRef,
        day: dayContainerRef,
        benefitTypeCode: benefitTypeCodeContainerRef,
        benefitAmount: benefitAmountContainerRef,
      };
      const controls = {
        cardTypeCode: cardTypeCodeControlRef,
        providerCode: providerCodeControlRef,
        name: nameControlRef,
        bankId: bankIdControlRef,
        day: dayControlRef,
        benefitTypeCode: benefitTypeCodeControlRef,
        benefitAmount: benefitAmountControlRef,
      };
      const focus = () => controls[first].current?.focus();
      if (revealField) revealField(containers[first].current, focus);
      else focus();
      return;
    }
    if (!providerCode) return;
    if (
      benefitChanged &&
      (!isValidMonth(effectiveMonth) || effectiveMonth < monthKey())
    ) {
      setSaveError("변경 적용 월은 이번 달 이후로 선택해 주세요.");
      return;
    }
    submitting.current = true;
    try {
      await saveMethod(
        {
          kind,
          providerCode,
          name: name.trim(),
          bankId: kind === "card" ? bankId : null,
          settlementDay:
            kind === "card" && cardTypeCode === "credit" ? parseDay(day) : null,
          cardTypeCode: kind === "card" ? cardTypeCode : null,
          benefitTypeCode: kind === "card" ? benefitTypeCode : null,
          benefitAmount: kind === "card" ? parseAmount(benefitAmount, 0) : null,
        },
        method?.id,
        benefitChanged ? effectiveMonth : undefined,
      );
      onClose();
    } catch {
      setSaveError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
    }
  }
  return (
    <>
      {!method && (
        <FormSegments
          label="종류"
          options={METHOD_KINDS}
          value={kind}
          disabled={busy}
          onChange={changeKind}
        />
      )}
      {kind === "card" && (
        <View
          ref={cardTypeCodeContainerRef}
          collapsable={false}
          testID="method-field-cardTypeCode"
        >
          <FormSegments
            label="카드 종류"
            options={CARD_TYPES}
            value={cardTypeCode}
            disabled={busy}
            required
            error={message("cardTypeCode")}
            controlRef={cardTypeCodeControlRef}
            onBlur={() => touch("cardTypeCode")}
            onChange={(value) => {
              setCardTypeCode(value);
              if (value === "debit") setDay("");
              touch("cardTypeCode");
            }}
          />
        </View>
      )}
      <View
        ref={providerCodeContainerRef}
        collapsable={false}
        testID="method-field-providerCode"
      >
        <ProviderSelect
          key={kind}
          kind={kind}
          value={providerCode}
          disabled={busy}
          required
          error={message("providerCode")}
          controlRef={providerCodeControlRef}
          onBlur={() => touch("providerCode")}
          onChange={(value) => {
            setProviderCode(value);
            touch("providerCode");
          }}
        />
        {method && !method.providerCode && (
          <Text style={s.fieldHint}>이전 기관명: {method.provider}</Text>
        )}
      </View>
      <View
        ref={nameContainerRef}
        collapsable={false}
        testID="method-field-name"
      >
        <Field
          label={kind === "bank" ? "통장 별명" : "카드 이름"}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setSaveError("");
          }}
          placeholder={
            kind === "bank" ? "예: 급여 통장" : "예: taptap O, 생활비 카드"
          }
          required
          disabled={busy}
          error={message("name")}
          controlRef={nameControlRef}
          onBlur={() => touch("name")}
        />
      </View>
      {kind === "card" && (
        <>
          <View
            ref={bankIdContainerRef}
            collapsable={false}
            testID="method-field-bankId"
          >
            <FormSelect
              label={cardTypeCode === "debit" ? "연결 통장" : "출금 통장"}
              options={bankOptions}
              value={bankId}
              inlineLabel
              required
              disabled={busy || banks.length === 0}
              error={message("bankId")}
              hint={
                banks.length === 0
                  ? "통장 탭에서 통장을 먼저 등록해 주세요."
                  : undefined
              }
              controlRef={bankIdControlRef}
              onBlur={() => touch("bankId")}
              onChange={(value) => {
                setBankId(value);
                touch("bankId");
              }}
            />
          </View>
          {cardTypeCode === "credit" && (
            <View
              ref={dayContainerRef}
              collapsable={false}
              testID="method-field-day"
            >
              <ChargeDayField
                label="출금일"
                value={day}
                disabled={busy}
                required
                error={message("day")}
                controlRef={dayControlRef}
                onBlur={() => touch("day")}
                onChange={(value) => {
                  setDay(value);
                  setSaveError("");
                }}
              />
            </View>
          )}
          <View
            ref={benefitTypeCodeContainerRef}
            collapsable={false}
            testID="method-field-benefitTypeCode"
          >
            <FormSegments
              label="월 혜택"
              options={CARD_BENEFIT_TYPES}
              value={benefitTypeCode}
              disabled={busy}
              required
              error={message("benefitTypeCode")}
              controlRef={benefitTypeCodeControlRef}
              onBlur={() => touch("benefitTypeCode")}
              onChange={(value) => {
                setBenefitTypeCode(value);
                touch("benefitTypeCode");
              }}
            />
          </View>
          <View
            ref={benefitAmountContainerRef}
            collapsable={false}
            testID="method-field-benefitAmount"
          >
            <Field
              label={
                benefitTypeCode === "fixed"
                  ? "월 고정 혜택"
                  : benefitTypeCode === "variable"
                    ? "월 예상 혜택"
                    : "월 혜택 금액"
              }
              unit="원"
              value={benefitAmount}
              numeric
              maxLength={13}
              placeholder="예: 10,000"
              required
              disabled={busy}
              error={message("benefitAmount")}
              controlRef={benefitAmountControlRef}
              onBlur={() => touch("benefitAmount")}
              hint={
                benefitTypeCode === "variable"
                  ? "월 예상액을 입력해 주세요. 혜택이 없으면 0원이에요."
                  : "혜택이 없으면 0원을 입력해 주세요."
              }
              onChangeText={(value) => {
                setBenefitAmount((previous) =>
                  formatAmountInput(value, previous),
                );
                setSaveError("");
              }}
            />
          </View>
        </>
      )}
      {benefitChanged && (
        <MonthField
          label="변경 적용 월"
          minimumMonth={monthKey()}
          value={effectiveMonth}
          onChange={(value) => {
            setEffectiveMonth(value);
            setSaveError("");
          }}
          disabled={busy}
          hint="선택한 월부터 새 혜택을 반영해요. 이전 달의 예상액과 이미 확정한 금액은 유지돼요."
        />
      )}
      {saveError && <FieldMessage error={saveError} />}
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}
