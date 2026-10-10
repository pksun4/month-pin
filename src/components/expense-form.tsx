import { useRef, useState } from "react";
import { Text, View } from "react-native";
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
  methodLabel,
  parseAmount,
  parseDay,
  paymentMethodsByKind,
} from "../utils/expenses";
import { Button, Choice, Field, s } from "./ui";

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
  const submitting = useRef(false);
  const orderedMethods = paymentMethodsByKind(methods);

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
      <Field
        label="고정비 이름"
        value={name}
        onChangeText={setName}
        placeholder="예: 월세, 넷플릭스, 휴대폰 요금"
        maxLength={60}
      />
      <View style={s.field}>
        <Text style={s.fieldLabel}>분류</Text>
        <View accessibilityRole="radiogroup" style={s.row}>
          {EXPENSE_CATEGORIES.map((category) => (
            <View key={category.code} style={s.flex}>
              <Choice
                label={category.label}
                selected={categoryCode === category.code}
                disabled={busy}
                onPress={() => {
                  setCategoryCode(category.code);
                  setError("");
                }}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>금액 유형</Text>
        <View accessibilityRole="radiogroup" style={s.row}>
          {EXPENSE_AMOUNT_TYPES.map((type) => (
            <View key={type.code} style={s.flex}>
              <Choice
                label={type.label}
                selected={amountTypeCode === type.code}
                disabled={busy}
                onPress={() => {
                  setAmountTypeCode(type.code);
                  setError("");
                }}
              />
            </View>
          ))}
        </View>
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
      <Field
        label="매월 결제일"
        value={day}
        onChangeText={setDay}
        placeholder="1 ~ 31"
        numeric
        maxLength={2}
      />
      <Text style={s.caption}>
        카드로 결제한다면 승인되는 날짜를 입력해 주세요. 해당 날짜가 없는 달에는
        마지막 날로 표시해요.
      </Text>
      <View style={s.choices}>
        <Text style={s.fieldLabel}>결제수단</Text>
        <Choice
          label="미지정"
          selected={methodId === null}
          onPress={() => setMethodId(null)}
        />
        {orderedMethods.map((method) => (
          <Choice
            key={method.id}
            label={`${method.kind === "bank" ? "통장" : "카드"} · ${methodLabel(method)}`}
            selected={methodId === method.id}
            onPress={() => setMethodId(method.id)}
          />
        ))}
      </View>
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
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}
