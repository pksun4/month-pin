import { AppText as Text } from "./typography";
import { Pressable, StyleSheet, View } from "react-native";
import type { LedgerEntry } from "../data/models";
import { METHOD_KINDS } from "../data/method-types";
import { getExpenseAmountType } from "../data/expense-types";
import { money } from "../utils/expenses";
import { ProviderIcon } from "./provider-icon";
import { colors } from "./ui";

export function LedgerEntryRow({
  entry,
  onPress,
  disabled,
}: {
  entry: LedgerEntry;
  onPress: () => void;
  disabled: boolean;
}) {
  const variable = entry.amountTypeCode === "variable";
  const kind = METHOD_KINDS.find(
    (item) => item.code === entry.methodKind,
  )?.label;
  const amountLabel = entry.amount === null ? "금액 입력" : money(entry.amount);
  const label = `${entry.name}, ${getExpenseAmountType(entry.amountTypeCode)?.label}, ${amountLabel}, ${kind ?? "결제수단 미지정"}${entry.providerName ? `, ${entry.providerName}` : ""}${variable ? ", 금액 수정" : ", 자동 반영"}`;
  const content = (
    <View style={styles.content}>
      <View style={styles.mainLine}>
        <View style={styles.nameGroup}>
          {entry.methodKind && (
            <ProviderIcon code={entry.providerCode} size={18} />
          )}
          <Text numberOfLines={1} style={styles.name}>
            {entry.name}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[
            styles.amount,
            variable && styles.variableAmount,
            entry.amount === null && styles.input,
          ]}
        >
          {amountLabel}
        </Text>
      </View>
      {!entry.methodKind && (
        <Text numberOfLines={1} style={styles.methodNotice}>
          결제수단 미지정
        </Text>
      )}
    </View>
  );
  const rowStyle = [styles.row, !entry.methodKind && styles.twoLineRow];
  return variable ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="이 달의 실제 금액을 입력하거나 수정해요."
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ...rowStyle,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} style={rowStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  twoLineRow: { minHeight: 52 },
  content: { flex: 1, minWidth: 0, gap: 2 },
  mainLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  methodNotice: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "right",
  },
  amount: {
    maxWidth: "43%",
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  variableAmount: { color: colors.blue },
  input: { color: colors.blue, fontSize: 13 },
});
