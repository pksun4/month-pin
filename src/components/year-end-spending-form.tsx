import { useRef, useState } from "react";
import { StyleSheet, type TextInput, View } from "react-native";
import { AppText as Text } from "./typography";
import {
  ButtonGroup,
  colors,
  Field,
  FieldMessage,
  s,
  useFormNavigation,
} from "./ui";
import { ProviderIcon } from "./provider-icon";
import type { TaxCardSpending, YearEndTaxCard } from "../data/models";
import { CARD_TYPES, getCardType } from "../data/method-types";
import { matchLegacyProvider } from "../data/providers";
import { taxSpendingFields } from "../utils/tax-spending-fields";
import { useMonthPin } from "../hooks/use-month-pin";
import { type TaxSpendingAmounts } from "../data/tax-spending-types";
import { parseTaxSpendingAmount } from "../utils/year-end-tax";
import { formatAmountInput, money } from "../utils/expenses";

export function YearEndSpendingForm({
  year,
  month,
  amounts,
  cards = [],
  selectedCards = [],
  confirmed = false,
  onClose,
}: {
  year: number;
  month: number;
  amounts: TaxSpendingAmounts | null;
  cards?: TaxCardSpending[];
  selectedCards?: YearEndTaxCard[];
  confirmed?: boolean;
  onClose: () => void;
}) {
  const { busy, saveYearEndTaxMonth } = useMonthPin();
  const [fields] = useState(() =>
    taxSpendingFields(amounts, selectedCards, cards),
  );
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.initialValue === null || field.initialValue === 0
            ? ""
            : formatAmountInput(String(field.initialValue)),
        ]),
      ) as Record<string, string>,
  );
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savingAction, setSavingAction] = useState<"save" | "confirm" | null>(
    null,
  );
  const inputRefs = useRef<Partial<Record<string, TextInput | null>>>({});
  const containerRefs = useRef<Partial<Record<string, View | null>>>({});
  const savingRef = useRef(false);
  const reveal = useFormNavigation();
  const parsed = Object.fromEntries(
    fields.map((field) => [
      field.key,
      parseTaxSpendingAmount(values[field.key]),
    ]),
  ) as Record<string, number | null>;
  const groups = (["general", ...CARD_TYPES.map((type) => type.code)] as const)
    .map((code) => ({
      code,
      fields: fields.filter((field) => field.group === code),
    }))
    .filter((group) => group.fields.length > 0);
  const firstInvalid = fields.find((field) => parsed[field.key] === null);
  const total = firstInvalid
    ? null
    : fields.reduce((sum, field) => sum + (parsed[field.key] ?? 0), 0);

  const disabled = busy || savingAction !== null;

  async function save(confirmMonth = false) {
    if (busy || savingRef.current) return;
    setSubmitted(true);
    setSaveError("");
    if (firstInvalid) {
      const { key } = firstInvalid;
      const focus = () => inputRefs.current[key]?.focus();
      if (reveal) reveal(containerRefs.current[key] ?? null, focus);
      else focus();
      return;
    }
    savingRef.current = true;
    setSavingAction(confirmMonth ? "confirm" : "save");
    try {
      const nextAmounts: TaxSpendingAmounts = {
        cash_receipt: 0,
        local_card: 0,
        debit_card: 0,
        credit_card: 0,
      };
      const nextCards: TaxCardSpending[] = [];
      for (const field of fields) {
        const amount = parsed[field.key]!;
        if (field.code) nextAmounts[field.code] = amount;
        else if (field.card) nextCards.push({ ...field.card, amount });
      }
      await saveYearEndTaxMonth({
        year,
        month,
        amounts: nextAmounts,
        cards: nextCards,
        confirmed: confirmed || confirmMonth,
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
      setSavingAction(null);
    }
  }

  return (
    <View style={styles.content}>
      {groups.map((group) => (
        <View key={group.code} style={styles.spendingGroup}>
          <Text
            style={[s.sectionTitle, styles.groupTitle]}
            accessibilityRole="header"
          >
            {group.code === "general"
              ? "현금·지역카드"
              : getCardType(group.code)?.label}
          </Text>
          <View style={styles.spendingFields}>
            {group.fields.map((method) => (
              <View
                key={method.key}
                collapsable={false}
                ref={(node) => {
                  containerRefs.current[method.key] = node;
                }}
              >
                <Field
                  label={method.label}
                  inlineLabel
                  unit="원"
                  labelLeading={
                    method.card ? (
                      <ProviderIcon
                        size={24}
                        code={
                          (
                            matchLegacyProvider(
                              "card",
                              method.card.providerName,
                            ) ??
                            matchLegacyProvider(
                              "bank",
                              method.card.providerName,
                            )
                          )?.code ?? null
                        }
                      />
                    ) : undefined
                  }
                  value={values[method.key]}
                  onChangeText={(next) => {
                    setValues((previous) => ({
                      ...previous,
                      [method.key]: formatAmountInput(
                        next,
                        previous[method.key],
                      ),
                    }));
                    setSaveError("");
                  }}
                  onBlur={() =>
                    setTouched((previous) => ({
                      ...previous,
                      [method.key]: true,
                    }))
                  }
                  placeholder="0"
                  numeric
                  maxLength={13}
                  disabled={disabled}
                  hint={method.hint}
                  error={
                    (submitted || touched[method.key]) &&
                    parsed[method.key] === null
                      ? "0원부터 9,999,999,999원까지 입력해 주세요."
                      : ""
                  }
                  controlRef={(node) => {
                    inputRefs.current[method.key] = node;
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <View
          style={styles.totalRow}
          accessible
          accessibilityLabel={`합계 ${total === null ? "—" : money(total)}`}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalAmount}>
            {total === null ? "—" : money(total)}
          </Text>
        </View>
        <FieldMessage error={saveError} />
        <ButtonGroup
          actions={[
            {
              code: "save",
              label: savingAction === "save" ? "저장 중…" : "저장",
              secondary: !confirmed,
              disabled,
              onPress: () => void save(),
            },
            ...(!confirmed
              ? [
                  {
                    code: "confirm",
                    label: savingAction === "confirm" ? "확정 중…" : "확정",
                    disabled,
                    onPress: () => void save(true),
                  },
                ]
              : []),
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  spendingGroup: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  groupTitle: { fontSize: 16, lineHeight: 22 },
  spendingFields: { gap: 12 },
  footer: { marginTop: 4, gap: 12 },
  totalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  totalLabel: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  totalAmount: {
    marginLeft: "auto",
    color: colors.ink,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
