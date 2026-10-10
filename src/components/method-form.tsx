import { useRef, useState } from "react";
import { Text, View } from "react-native";
import type { MethodKind, PaymentMethod } from "../data/models";
import { getProvider, type ProviderCode } from "../data/providers";
import {
  CARD_TYPES,
  METHOD_KINDS,
  type CardTypeCode,
} from "../data/method-types";
import { useMonthPin } from "../hooks/use-month-pin";
import { methodLabel, parseDay } from "../utils/expenses";
import { Button, Choice, Field, s } from "./ui";
import { ProviderSelect } from "./provider-select";

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
      {!method && (
        <View style={s.row}>
          {METHOD_KINDS.map((option) => (
            <View key={option.code} style={s.flex}>
              <Choice
                label={option.label}
                selected={kind === option.code}
                onPress={() => changeKind(option.code)}
              />
            </View>
          ))}
        </View>
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
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="카드 종류"
            style={s.choices}
          >
            <Text style={s.fieldLabel}>카드 종류</Text>
            <View style={s.row}>
              {CARD_TYPES.map((type) => (
                <View key={type.code} style={s.flex}>
                  <Choice
                    label={type.label}
                    selected={cardTypeCode === type.code}
                    disabled={busy}
                    onPress={() => {
                      setCardTypeCode(type.code);
                      if (type.code === "debit") setDay("");
                      setError("");
                    }}
                  />
                </View>
              ))}
            </View>
            {method && method.cardTypeCode === null && (
              <Text style={s.caption}>기존 카드의 종류를 선택해 주세요.</Text>
            )}
          </View>
          <View style={s.choices}>
            <Text style={s.fieldLabel}>
              {cardTypeCode === "debit"
                ? "연결 통장 (선택)"
                : "카드 대금 출금 통장 (선택)"}
            </Text>
            <Choice
              label="미지정"
              selected={bankId === null}
              onPress={() => setBankId(null)}
            />
            {banks.map((bank) => (
              <Choice
                key={bank.id}
                label={methodLabel(bank)}
                selected={bankId === bank.id}
                onPress={() => setBankId(bank.id)}
              />
            ))}
            {banks.length === 0 && (
              <Text style={s.caption}>
                통장을 먼저 등록하면 여기에서 선택할 수 있어요.
              </Text>
            )}
          </View>
          {cardTypeCode === "credit" && (
            <>
              <Field
                label="카드 대금 출금일 (선택)"
                value={day}
                onChangeText={setDay}
                placeholder="1 ~ 31"
                numeric
                maxLength={2}
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
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}
