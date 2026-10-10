import { useRef, useState } from "react";
import type { Expense } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatMonth, monthKey } from "../utils/ledger";
import { AppText as Text } from "./typography";
import { MonthField } from "./month-field";
import { Button, s } from "./ui";

export function ExpenseEndForm({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const { endExpense, busy } = useMonthPin();
  const [endMonth, setEndMonth] = useState(() => monthKey());
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      await endExpense(expense.id, endMonth);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "종료하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      submitting.current = false;
    }
  }
  return (
    <>
      <Text style={s.sectionTitle}>{expense.name}</Text>
      <MonthField
        label="마지막 반영 월"
        value={endMonth}
        onChange={setEndMonth}
        disabled={busy}
        minimumMonth={monthKey()}
        hint="선택한 월까지 표시하고 다음 달부터 자동 내역을 제외해요."
      />
      <Text style={s.caption}>
        종료하면 목록의 ‘종료’ 상태에서 확인할 수 있어요.{" "}
        {formatMonth(endMonth)}까지의 캘린더 내역과 직접 입력한 실제 금액은
        유지돼요.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label={busy ? "저장 중…" : "고정비 종료"}
        danger
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
    </>
  );
}
