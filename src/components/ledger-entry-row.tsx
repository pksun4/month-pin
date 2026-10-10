import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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
    <>
      <View style={styles.description}>
        <Text numberOfLines={1} style={styles.name}>
          {entry.name}
        </Text>
        <View style={styles.methodLine}>
          {entry.methodKind && (
            <ProviderIcon code={entry.providerCode} size={18} />
          )}
          <Text numberOfLines={1} style={styles.method}>
            {kind
              ? `${kind} · ${entry.providerName ?? entry.methodName}`
              : "결제수단 미지정"}
          </Text>
        </View>
      </View>
      <View style={styles.value}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.amount, entry.amount === null && styles.input]}
        >
          {amountLabel}
        </Text>
        <Text style={styles.note}>
          {variable
            ? entry.amount === null
              ? "변동 금액"
              : "수정 가능"
            : "자동 반영"}
        </Text>
      </View>
      {variable && (
        <Ionicons name="create-outline" size={16} color={colors.blue} />
      )}
    </>
  );
  return variable ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} style={styles.row}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  description: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.ink },
  methodLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  method: { flex: 1, fontSize: 11, lineHeight: 18, color: colors.muted },
  value: { maxWidth: "43%", alignItems: "flex-end", flexShrink: 1 },
  amount: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    fontWeight: "700",
  },
  input: { color: colors.blue, fontSize: 13 },
  note: { fontSize: 10, lineHeight: 16, color: colors.muted },
});
