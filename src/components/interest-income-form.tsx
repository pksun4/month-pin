import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { BANK_PROVIDERS, type BankProviderCode } from "../data/providers";
import type { InterestIncomeEntry } from "../data/models";
import { formatAmountInput, money } from "../utils/expenses";
import {
  MAX_ACCOUNT_ALIAS_LENGTH,
  parseInterestAmount,
} from "../utils/interest-income";
import { useMonthPin } from "../hooks/use-month-pin";
import { AppText as Text } from "./typography";
import { Button, colors, Field, FieldMessage, useFormNavigation } from "./ui";
import { FormSelect } from "./form-select";
import { ProviderIcon } from "./provider-icon";

type InterestRow = {
  key: number;
  id: number | null;
  providerCode: BankProviderCode | null;
  accountAlias: string;
  amount: string;
};
const emptyRow = (key: number): InterestRow => ({
  key,
  id: null,
  providerCode: null,
  accountAlias: "",
  amount: "",
});
const BANK_OPTIONS = BANK_PROVIDERS.map((bank) => ({
  code: bank.code,
  label: bank.name,
  icon: <ProviderIcon code={bank.code} size={18} />,
}));

export function InterestIncomeForm({
  year,
  month,
  entries,
  onClose,
}: {
  year: number;
  month: number;
  entries: InterestIncomeEntry[];
  onClose: () => void;
}) {
  const { busy, saveInterestIncomeMonth } = useMonthPin();
  const [rows, setRows] = useState<InterestRow[]>(() =>
    entries.length
      ? entries.map((entry, key) => ({
          key,
          id: entry.id,
          providerCode: entry.providerCode,
          accountAlias: entry.accountAlias,
          amount: formatAmountInput(String(entry.amount)),
        }))
      : [emptyRow(0)],
  );
  const nextKey = useRef(Math.max(entries.length, 1));
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef(false);
  const containers = useRef<Record<number, View | null>>({});
  const controls = useRef<Record<string, TextInput | View | null>>({});
  const pendingReveal = useRef<number | null>(null);
  const reveal = useFormNavigation();
  const disabled = busy || saving;
  const parsed = rows.map((row) => ({
    row,
    amount: parseInterestAmount(row.amount),
    errors: {
      providerCode: row.providerCode ? "" : "은행을 선택해 주세요.",
      accountAlias:
        row.accountAlias.trim().length <= MAX_ACCOUNT_ALIAS_LENGTH
          ? ""
          : "통장 별명은 40자 이내로 입력해 주세요.",
      amount:
        parseInterestAmount(row.amount) === null
          ? "0원부터 9,999,999,999원까지 입력해 주세요."
          : "",
    },
  }));
  const total = parsed.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const errorFor = (key: number, field: string, error: string) =>
    submitted || touched[`${key}.${field}`] ? error : "";
  function updateRow(
    key: number,
    change: Partial<Omit<InterestRow, "key" | "id">>,
  ) {
    if (disabled) return;
    setSaveError("");
    setRows((previous) =>
      previous.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }
  const touch = (key: number, field: string) =>
    setTouched((previous) => ({ ...previous, [`${key}.${field}`]: true }));
  async function save() {
    if (busy || savingRef.current) return;
    setSubmitted(true);
    setSaveError("");
    for (const entry of parsed) {
      const invalid = Object.entries(entry.errors).find(([, error]) => error);
      if (invalid) {
        const focus = () =>
          controls.current[`${entry.row.key}.${invalid[0]}`]?.focus();
        if (reveal) reveal(containers.current[entry.row.key] ?? null, focus);
        else focus();
        return;
      }
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveInterestIncomeMonth({
        year,
        month,
        entries: parsed.map(({ row, amount }) => ({
          id: row.id,
          providerCode: row.providerCode!,
          accountAlias: row.accountAlias.trim(),
          amount: amount!,
        })),
      });
      onClose();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <View style={styles.content}>
      {parsed.map(({ row, errors }, index) => (
        <View
          key={row.key}
          style={styles.entry}
          collapsable={false}
          ref={(node) => {
            containers.current[row.key] = node;
          }}
          onLayout={() => {
            if (pendingReveal.current === row.key) {
              pendingReveal.current = null;
              reveal?.(containers.current[row.key] ?? null);
            }
          }}
        >
          <FormSelect<BankProviderCode>
            label="은행"
            labelWidth={72}
            value={row.providerCode}
            placeholder="은행 선택"
            options={BANK_OPTIONS}
            required
            disabled={disabled}
            error={errorFor(row.key, "providerCode", errors.providerCode)}
            onBlur={() => touch(row.key, "providerCode")}
            controlRef={(node) => {
              controls.current[`${row.key}.providerCode`] = node;
            }}
            onChange={(providerCode) => updateRow(row.key, { providerCode })}
          />
          <Field
            label="통장 별명"
            labelWidth={72}
            value={row.accountAlias}
            placeholder="선택 입력"
            maxLength={MAX_ACCOUNT_ALIAS_LENGTH}
            disabled={disabled}
            error={errorFor(row.key, "accountAlias", errors.accountAlias)}
            onBlur={() => touch(row.key, "accountAlias")}
            controlRef={(node) => {
              controls.current[`${row.key}.accountAlias`] = node;
            }}
            onChangeText={(accountAlias) =>
              updateRow(row.key, { accountAlias })
            }
          />
          <Field
            label="이자 수입"
            labelWidth={72}
            unit="원"
            unitPlacement="inside"
            value={row.amount}
            placeholder="0"
            numeric
            maxLength={13}
            required
            disabled={disabled}
            error={errorFor(row.key, "amount", errors.amount)}
            onBlur={() => touch(row.key, "amount")}
            controlRef={(node) => {
              controls.current[`${row.key}.amount`] = node;
            }}
            onChangeText={(next) =>
              updateRow(row.key, {
                amount: formatAmountInput(next, row.amount),
              })
            }
          />
          <View style={styles.entryFooter}>
            <Button
              label="내역 삭제"
              size="small"
              danger
              disabled={disabled}
              accessibilityLabel={`${index + 1}번째 이자 내역 삭제`}
              accessibilityHint="이 내역을 입력 목록에서 제거해요. 저장하면 반영돼요."
              onPress={() => {
                if (disabled) return;
                setRows((previous) =>
                  previous.filter((entry) => entry.key !== row.key),
                );
                setSaveError("");
              }}
            />
          </View>
        </View>
      ))}
      <Button
        label="+ 이자 내역 추가"
        secondary
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          const key = nextKey.current++;
          pendingReveal.current = key;
          setRows((previous) => [...previous, emptyRow(key)]);
          setSaveError("");
        }}
      />
      <View
        style={styles.total}
        accessible
        accessibilityLabel={`합계 ${money(total)}`}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.columnLabel}>합계</Text>
        <Text style={styles.totalAmount}>{money(total)}</Text>
      </View>
      <FieldMessage error={saveError} />
      <Button
        label={saving ? "저장 중…" : "저장"}
        disabled={disabled}
        onPress={() => void save()}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  entry: {
    gap: 8,
    padding: 12,
    paddingBottom: 4,
    borderRadius: 14,
    backgroundColor: colors.bg,
    minWidth: 0,
  },
  columnLabel: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  entryFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: -4,
  },
  total: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  totalAmount: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.ink,
    marginLeft: "auto",
    flexShrink: 1,
  },
});
