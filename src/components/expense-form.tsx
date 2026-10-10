import { AppText as Text } from "./typography";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
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
import { MonthField } from "./month-field";
import { FormSegments } from "./form-segments";
import { FormSelect } from "./form-select";
import { ChargeDayField } from "./charge-day-field";
import { ProviderIcon } from "./provider-icon";
import { METHOD_KINDS } from "../data/method-types";
import { monthKey, isValidMonth, moveMonth } from "../utils/ledger";

export function ExpenseForm({
  expense,
  renewal,
  onClose,
  initialCategoryCode,
}: {
  expense?: Expense;
  renewal?: Expense;
  onClose: () => void;
  initialCategoryCode?: ExpenseCategoryCode;
}) {
  const initial = expense ?? renewal;
  const { methods, saveExpense, busy } = useMonthPin();
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryCode, setCategoryCode] = useState<ExpenseCategoryCode | null>(
    initial ? initial.categoryCode : (initialCategoryCode ?? null),
  );
  const [amountTypeCode, setAmountTypeCode] = useState<ExpenseAmountTypeCode>(
    initial?.amountTypeCode ?? "fixed",
  );
  const [amount, setAmount] = useState(
    initial?.amount != null ? formatAmountInput(String(initial.amount)) : "",
  );
  const [day, setDay] = useState(initial ? String(initial.chargeDay) : "");
  const [methodId, setMethodId] = useState<number | null>(
    initial?.methodId ?? null,
  );
  const [error, setError] = useState("");
  const [effectiveMonth, setEffectiveMonth] = useState(() => monthKey());
  const [startMonth, setStartMonth] = useState(
    () =>
      expense?.startMonth ??
      (renewal?.endMonth &&
      renewal.endMonth >= monthKey() &&
      renewal.endMonth !== "9999-12"
        ? moveMonth(renewal.endMonth, 1)
        : monthKey()),
  );
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
      (!isValidMonth(effectiveMonth) || effectiveMonth < monthKey())
    ) {
      setError("변경 적용 월은 이번 달 이후로 선택해 주세요.");
      return;
    }
    if (!isValidMonth(startMonth)) {
      setError("시작 월을 다시 확인해 주세요.");
      return;
    }
    if (renewal?.endMonth && startMonth <= renewal.endMonth) {
      setError("새 시작 월은 이전 마지막 반영 월보다 이후로 선택해 주세요.");
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
          startMonth,
        },
        expense?.id,
        amountChanged ? effectiveMonth : undefined,
        renewal?.id,
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
      {renewal && (
        <Text style={s.caption}>
          이전 항목의 정보를 가져왔어요. 새 기간으로 등록하며 기존 기록은
          유지해요.
        </Text>
      )}
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
      <MonthField
        label="시작 월"
        minimumMonth={
          renewal?.endMonth && renewal.endMonth !== "9999-12"
            ? moveMonth(renewal.endMonth, 1)
            : undefined
        }
        value={startMonth}
        displayValue={
          expense && startMonth === "1000-01" ? "기존 전체 기간" : undefined
        }
        onChange={setStartMonth}
        disabled={busy}
        hint={
          expense
            ? "시작 월 이전의 자동 내역은 정리하고, 직접 입력한 실제 금액은 유지해요."
            : "선택한 월부터 결제일에 표시해요. 이번 달 결제일이 지났어도 반영돼요."
        }
      />
      {amountChanged && (
        <MonthField
          label="변경 적용 월"
          minimumMonth={monthKey()}
          hint="선택한 월부터 새 금액을 반영해요. 이전 달과 직접 입력한 실제 금액은 유지돼요."
          value={effectiveMonth}
          onChange={setEffectiveMonth}
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
