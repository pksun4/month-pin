import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Expense } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { expenseAmountLabel, methodLabel } from "../utils/expenses";
import { getExpenseAmountType } from "../data/expense-types";
import { colors } from "./ui";
import { ProviderIcon } from "./provider-icon";
import { METHOD_KINDS } from "../data/method-types";
import { ReorderHandle, type ReorderControls } from "./reorder-handle";
import { ExpenseDayBadge } from "./expense-day-badge";

export function ExpenseRow({
  expense,
  dateLabel,
  onPress,
  reorder,
}: {
  expense: Expense;
  dateLabel?: string;
  onPress?: () => void;
  reorder?: ReorderControls;
}) {
  const { methods } = useMonthPin();
  const method = methods.find((item) => item.id === expense.methodId);
  const type = getExpenseAmountType(expense.amountTypeCode);
  const amountLabel = expenseAmountLabel(expense);
  const methodKindLabel = METHOD_KINDS.find(
    (item) => item.code === method?.kind,
  )?.label;
  const fullLabel = `${expense.name}, ${type?.label}, ${amountLabel}, ${dateLabel ?? `매월 ${expense.chargeDay}일`}, ${methodKindLabel ? `${methodKindLabel}, ` : ""}${methodLabel(method)}`;
  const content = (
    <>
      {dateLabel ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={styles.calendarDate}
        >
          {dateLabel}
        </Text>
      ) : (
        <ExpenseDayBadge day={expense.chargeDay} />
      )}
      <View style={styles.description}>
        <View style={styles.mainLine}>
          <Text numberOfLines={1} style={styles.name}>
            {expense.name}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[
              styles.amount,
              expense.amountTypeCode === "variable" && styles.variableAmount,
            ]}
          >
            {expense.amountTypeCode === "variable" ? "변동" : amountLabel}
          </Text>
        </View>
        <View style={styles.methodLine}>
          {method && <ProviderIcon code={method.providerCode} size={18} />}
          <Text numberOfLines={1} style={styles.method}>
            {method ? (
              <>
                <Text style={styles.methodKind}>{methodKindLabel}</Text>
                {` · ${method.provider}`}
              </>
            ) : (
              "결제수단 미지정"
            )}
          </Text>
        </View>
      </View>
    </>
  );
  if (reorder)
    return (
      <View style={[styles.row, reorder.active && styles.active]}>
        <View style={styles.editContent}>{content}</View>
        <ReorderHandle label={fullLabel} reorder={reorder} />
      </View>
    );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${fullLabel}, 상세보기`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={fullLabel} style={styles.row}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    minHeight: 48,
  },
  editContent: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  active: {
    backgroundColor: colors.white,
    borderRadius: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  calendarDate: {
    width: 44,
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  description: { flex: 1, minWidth: 0 },
  mainLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  methodLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  method: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  methodKind: { fontWeight: "600", color: "#555B69" },
  amount: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
    maxWidth: "42%",
    flexShrink: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  variableAmount: { color: colors.muted, fontWeight: "500" },
});
