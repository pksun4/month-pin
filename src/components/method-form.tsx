import { AppText as Text } from "./typography";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MethodKind, PaymentMethod } from "../data/models";
import { getProvider, type ProviderCode } from "../data/providers";
import {
  CARD_TYPES,
  METHOD_KINDS,
  type CardTypeCode,
} from "../data/method-types";
import { useMonthPin } from "../hooks/use-month-pin";
import { parseDay } from "../utils/expenses";
import { Button, Field, s } from "./ui";
import { ProviderSelect } from "./provider-select";
import { FormSegments } from "./form-segments";
import { FormSelect } from "./form-select";
import { ChargeDayField } from "./charge-day-field";
import { ProviderIcon } from "./provider-icon";

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
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const banks = methods.filter((item) => item.kind === "bank");
  const bankOptions = [
    { code: null, label: "미지정" },
    ...banks.map((bank) => ({
      code: bank.id,
      label: bank.name,
      description: bank.provider,
      icon: <ProviderIcon code={bank.providerCode} size={24} />,
    })),
  ];
  const invalidDay =
    kind === "card" &&
    cardTypeCode === "credit" &&
    day.length > 0 &&
    parseDay(day) === null;

  function changeKind(nextKind: MethodKind) {
    if (nextKind === kind) return;
    setKind(nextKind);
    setProviderCode(null);
    setError("");
  }

  async function submit() {
    if (submitting.current) return;
    if (!providerCode || getProvider(providerCode)?.kind !== kind) {
      setError(`${kind === "bank" ? "은행을" : "카드사를"} 선택해 주세요.`);
      return;
    }
    if (!name.trim()) {
      setError(
        `${kind === "bank" ? "통장 별명을" : "카드 이름을"} 입력해 주세요.`,
      );
      return;
    }
    if (kind === "card" && cardTypeCode === null) {
      setError("신용카드 또는 체크카드를 선택해 주세요.");
      return;
    }
    const needsDay = kind === "card" && cardTypeCode === "credit";
    const settlementDay = needsDay && day.trim() ? parseDay(day) : null;
    if (needsDay && day.trim() && settlementDay === null) {
      setError("출금일은 1일부터 31일까지 입력해 주세요.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      await saveMethod(
        {
          kind,
          providerCode,
          name: name.trim(),
          bankId: kind === "card" ? bankId : null,
          settlementDay,
          cardTypeCode: kind === "card" ? cardTypeCode : null,
        },
        method?.id,
      );
      onClose();
    } catch {
      setError("저장하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <>
      {(!method || kind === "card") && (
        <View style={styles.selections}>
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
            <FormSegments
              label="카드 종류"
              options={CARD_TYPES}
              value={cardTypeCode}
              disabled={busy}
              onChange={(value) => {
                setCardTypeCode(value);
                if (value === "debit") setDay("");
                setError("");
              }}
            />
          )}
        </View>
      )}
      {method && kind === "card" && method.cardTypeCode === null && (
        <Text style={s.caption}>기존 카드의 종류를 선택해 주세요.</Text>
      )}
      <ProviderSelect
        key={kind}
        kind={kind}
        value={providerCode}
        onChange={(value) => {
          setProviderCode(value);
          setError("");
        }}
        disabled={busy}
      />
      {method && !method.providerCode && (
        <Text style={s.caption}>
          기존 기관명: {method.provider}. 수정하려면 목록에서{" "}
          {kind === "bank" ? "은행을" : "카드사를"} 선택해 주세요.
        </Text>
      )}
      <Field
        label={kind === "bank" ? "통장 별명" : "카드 이름"}
        value={name}
        onChangeText={setName}
        placeholder={
          kind === "bank" ? "예: 급여 통장" : "예: taptap O, 생활비 카드"
        }
      />
      {kind === "card" && (
        <>
          <FormSelect
            label={cardTypeCode === "debit" ? "연결 통장" : "출금 통장"}
            options={bankOptions}
            value={bankId}
            inlineLabel
            disabled={busy}
            onChange={(value) => {
              setBankId(value);
              setError("");
            }}
          />
          <Text style={s.caption}>
            {banks.length === 0
              ? "통장을 먼저 등록하면 선택할 수 있어요. 연결은 선택 사항이에요."
              : "통장 연결은 선택 사항이에요. 별명이나 은행명으로 검색할 수 있어요."}
          </Text>
          {cardTypeCode === "credit" && (
            <>
              <ChargeDayField
                label="출금일"
                optional
                value={day}
                onChange={(value) => {
                  setDay(value);
                  setError("");
                }}
                disabled={busy}
              />
              <Text style={s.caption}>
                카드 대금이 통장에서 빠져나가는 날짜예요. 고정비의 카드 승인일과
                별도로 관리해요.
              </Text>
            </>
          )}
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy || invalidDay}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({ selections: { gap: 4 } });
