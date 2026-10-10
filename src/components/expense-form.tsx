import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { Expense } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { methodLabel, parseAmount, parseDay } from "../utils/expenses";
import { Button, Choice, Field, s } from "./ui";

export function ExpenseForm({
  expense,
  onClose,
}: {
  expense?: Expense;
  onClose: () => void;
}) {
  const { methods, saveExpense, busy } = useMonthPin();
  const [name, setName] = useState(expense?.name ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [day, setDay] = useState(expense ? String(expense.chargeDay) : "");
  const [methodId, setMethodId] = useState<number | null>(
    expense?.methodId ?? null,
  );
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    const parsedAmount = parseAmount(amount);
    const parsedDay = parseDay(day);
    if (!name.trim()) {
      setError("고정비 이름을 입력해 주세요.");
      return;
    }
    if (parsedAmount === null) {
      setError("금액은 1원부터 999,999,999원까지 입력해 주세요.");
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
      <Field
        label="월 금액 (원)"
        value={amount}
        onChangeText={setAmount}
        placeholder="예: 17,000"
        numeric
        maxLength={13}
      />
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
        {methods.map((method) => (
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
