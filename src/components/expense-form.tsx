import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Expense } from "../data/models";
import {
  EXPENSE_AMOUNT_TYPES,
  EXPENSE_CATEGORIES,
  type ExpenseCategoryCode,
  type ExpenseAmountTypeCode,
} from "../data/expense-types";
import { useMonthPin } from "../hooks/use-month-pin";
import {
  formatAmountInput,
  parseAmount,
  parseDay,
  paymentMethodsByKind,
} from "../utils/expenses";
import { Button, Field, s } from "./ui";
import { EffectiveDateField } from "./effective-date-field";
import { FormSegments } from "./form-segments";
import { FormSelect } from "./form-select";
import { ChargeDayField } from "./charge-day-field";
import { ProviderIcon } from "./provider-icon";
import { METHOD_KINDS } from "../data/method-types";
import { dateKey, isValidDateKey } from "../utils/ledger";

export function ExpenseForm({
  expense,
  onClose,
  initialCategoryCode,
}: {
  expense?: Expense;
  onClose: () => void;
  initialCategoryCode?: ExpenseCategoryCode;
}) {
  const { methods, saveExpense, busy } = useMonthPin();
  const [name, setName] = useState(expense?.name ?? "");
  const [categoryCode, setCategoryCode] = useState<ExpenseCategoryCode | null>(
    expense ? expense.categoryCode : (initialCategoryCode ?? null),
  );
  const [amountTypeCode, setAmountTypeCode] = useState<ExpenseAmountTypeCode>(
    expense?.amountTypeCode ?? "fixed",
  );
  const [amount, setAmount] = useState(
    expense?.amount != null ? formatAmountInput(String(expense.amount)) : "",
  );
  const [day, setDay] = useState(expense ? String(expense.chargeDay) : "");
  const [methodId, setMethodId] = useState<number | null>(
    expense?.methodId ?? null,
  );
  const [error, setError] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => dateKey());
  const amountChanged =
    !!expense &&
    (amountTypeCode !== expense.amountTypeCode ||
      (amountTypeCode === "fixed" && parseAmount(amount) !== expense.amount));
  const submitting = useRef(false);
  const orderedMethods = paymentMethodsByKind(methods);
  const methodOptions = [
    { code: null, label: "미지정" },
    ...orderedMethods.map((method) => {
      const kindLabel = METHOD_KINDS.find(
        (kind) => kind.code === method.kind,
      )!.label;
      return {
        code: method.id,
        label: `${kindLabel} · ${method.name}`,
        description: method.provider,
        group: kindLabel,
        icon: <ProviderIcon code={method.providerCode} size={24} />,
      };
    }),
  ];

  async function submit() {
    if (submitting.current) return;
    const parsedAmount =
      amountTypeCode === "fixed" ? parseAmount(amount) : null;
    const parsedDay = parseDay(day);
    if (!name.trim()) {
      setError("고정비 이름을 입력해 주세요.");
      return;
    }
    if (amountTypeCode === "fixed" && parsedAmount === null) {
      setError("금액은 1원부터 999,999,999원까지 입력해 주세요.");
      return;
    }
    if (categoryCode === null) {
      setError("생활·구독 분류를 선택해 주세요.");
      return;
    }
    if (parsedDay === null) {
      setError("결제일은 1일부터 31일까지 입력해 주세요.");
      return;
    }
    if (
      amountChanged &&
      (!isValidDateKey(effectiveDate) || effectiveDate < dateKey())
    ) {
      setError("변경 적용일은 오늘 이후로 선택해 주세요.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      await saveExpense(
        {
          name: name.trim(),
          categoryCode,
          amountTypeCode,
          amount: parsedAmount,
          chargeDay: parsedDay,
          methodId,
        },
        expense?.id,
        amountChanged ? effectiveDate : undefined,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      submitting.current = false;
    }
  }

  return (
    <>
      <Field
        label="고정비 이름"
        value={name}
        onChangeText={setName}
        placeholder="예: 월세, 넷플릭스, 휴대폰 요금"
        maxLength={60}
      />
      <View style={styles.selections}>
        <FormSegments
          label="분류"
          options={EXPENSE_CATEGORIES}
          value={categoryCode}
          disabled={busy}
          onChange={(value) => {
            setCategoryCode(value);
            setError("");
          }}
        />
        <FormSegments
          label="금액 유형"
          options={EXPENSE_AMOUNT_TYPES}
          value={amountTypeCode}
          disabled={busy}
          onChange={(value) => {
            setAmountTypeCode(value);
            setError("");
          }}
        />
      </View>
      {amountTypeCode === "fixed" ? (
        <Field
          label="고정 월 금액 (원)"
          value={amount}
          onChangeText={(value) =>
            setAmount((previous) => formatAmountInput(value, previous))
          }
          placeholder="예: 17,000"
          numeric
          maxLength={13}
        />
      ) : (
        <Text style={s.caption}>
          관리비·전기요금처럼 매월 금액이 달라지는 항목이에요. 기본 금액 없이
          등록해요.
        </Text>
      )}
      {amountChanged && (
        <EffectiveDateField
          value={effectiveDate}
          onChange={setEffectiveDate}
          disabled={busy}
        />
      )}
      <ChargeDayField
        value={day}
        onChange={(value) => {
          setDay(value);
          setError("");
        }}
        disabled={busy}
      />
      <Text style={s.caption}>
        카드로 결제한다면 승인되는 날짜를 입력해 주세요. 해당 날짜가 없는 달에는
        마지막 날로 표시해요.
      </Text>
      <FormSelect
        label="결제수단"
        value={methodId}
        options={methodOptions}
        inlineLabel
        onChange={(value) => {
          setMethodId(value);
          setError("");
        }}
        disabled={busy}
      />
      {methods.length === 0 && (
        <View style={s.card}>
          <Text style={s.caption}>
            결제수단을 등록하면 어떤 통장이나 카드로 나가는지 함께 관리할 수
            있어요.
          </Text>
          <Button
            label="결제수단 등록하러 가기"
            secondary
            onPress={() => {
              onClose();
              router.navigate("/wallet");
            }}
          />
        </View>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy || (day.length > 0 && parseDay(day) === null)}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({ selections: { gap: 4 } });
