import { AppText as Text } from "./typography";
import { useState } from "react";

import type { LedgerEntry } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatAmountInput } from "../utils/expenses";
import { parseLedgerAmount } from "../utils/ledger";
import { Button, Field, s } from "./ui";

export function LedgerAmountForm({
  entry,
  onClose,
}: {
  entry: LedgerEntry;
  onClose: () => void;
}) {
  const { saveLedgerAmount, busy } = useMonthPin();
  const [value, setValue] = useState(
    entry.amount === null ? "" : formatAmountInput(String(entry.amount)),
  );
  const [error, setError] = useState<string | null>(null);
  async function save(amount: number | null) {
    try {
      setError(null);
      await saveLedgerAmount(entry.id, amount);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    }
  }
  return (
    <>
      <Text style={s.title}>{entry.name}</Text>
      <Text style={s.body}>
        {entry.month.replace("-", "년 ")}월 {entry.day}일
      </Text>
      <Text style={s.caption}>
        이 달의 실제 금액을 입력해 주세요. 다른 달의 금액은 바뀌지 않아요.
      </Text>
      <Field
        label="실제 금액 (원)"
        value={value}
        onChangeText={(text) =>
          setValue((previous) => formatAmountInput(text, previous))
        }
        placeholder="예: 125,000"
        numeric
        maxLength={11}
      />
      <Text style={s.caption}>청구 금액이 없으면 0원을 입력할 수 있어요.</Text>
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy}
        onPress={() => {
          const amount = parseLedgerAmount(value);
          if (amount === null) {
            setError("0원부터 999,999,999원까지 입력해 주세요.");
            return;
          }
          void save(amount);
        }}
      />
      {entry.amount !== null && (
        <Button
          label="미입력으로 변경"
          secondary
          disabled={busy}
          onPress={() => void save(null)}
        />
      )}
    </>
  );
}
