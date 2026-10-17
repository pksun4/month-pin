import { AppText as Text } from "./typography";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { LedgerEntry } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { formatAmountInput } from "../utils/expenses";
import { parseLedgerAmount } from "../utils/ledger";
import { ButtonGroup, Field, s } from "./ui";

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
      <View style={styles.summary}>
        <Text style={s.sectionTitle}>{entry.name}</Text>
        <Text style={[s.caption, styles.date]}>
          {entry.month.replace("-", "년 ")}월 {entry.day}일
        </Text>
      </View>
      <Field
        label="실제 금액"
        inlineLabel
        unit="원"
        value={value}
        onChangeText={(text) =>
          setValue((previous) => formatAmountInput(text, previous))
        }
        placeholder="예: 125,000"
        numeric
        maxLength={11}
        disabled={busy}
        error={error ?? undefined}
        hint="이 달에만 반영돼요. 청구가 없으면 0원을 입력해 주세요."
      />
      <ButtonGroup
        actions={[
          ...(entry.amount !== null
            ? [
                {
                  code: "reset",
                  label: "미입력으로 변경",
                  secondary: true,
                  disabled: busy,
                  onPress: () => void save(null),
                },
              ]
            : []),
          {
            code: "save",
            label: busy ? "저장 중…" : "저장",
            disabled: busy,
            onPress: () => {
              const amount = parseLedgerAmount(value);
              if (amount === null) {
                setError("0원부터 999,999,999원까지 입력해 주세요.");
                return;
              }
              void save(amount);
            },
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 2 },
  date: { marginTop: 0, fontSize: 13, lineHeight: 20 },
});
