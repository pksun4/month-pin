import { AppText as Text } from "./typography";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { Expense } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { expenseAmountLabel, methodLabel } from "../utils/expenses";
import { getExpenseAmountType } from "../data/expense-types";
import { colors } from "./ui";
import { ProviderIcon } from "./provider-icon";
import { METHOD_KINDS } from "../data/method-types";
import { ReorderHandle, type ReorderControls } from "./reorder-handle";
import { formatMonth } from "../utils/ledger";
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
  const { width, fontScale } = useWindowDimensions();
  const stacked = !!dateLabel && width / fontScale < 300;
  const method = methods.find((item) => item.id === expense.methodId);
  const type = getExpenseAmountType(expense.amountTypeCode);
  const amountLabel = expenseAmountLabel(expense);
  const methodKindLabel = METHOD_KINDS.find(
    (item) => item.code === method?.kind,
  )?.label;
  const fullLabel = `${expense.name}, ${type?.label}, ${amountLabel}, ${dateLabel ?? `매월 ${expense.chargeDay}일`}, ${methodKindLabel ? `${methodKindLabel}, ` : ""}${methodLabel(method)}`;
  const date = dateLabel ? (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={[styles.calendarDate, { width: 44 * fontScale }]}
    >
      {dateLabel}
    </Text>
  ) : (
    <ExpenseDayBadge day={expense.chargeDay} />
  );
  const name = (
    <Text numberOfLines={stacked ? 2 : 1} style={styles.name}>
      {expense.name}
    </Text>
  );
  const amount = (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      style={[
        styles.amount,
        stacked && styles.stackedAmount,
        expense.amountTypeCode === "variable" && styles.variableAmount,
      ]}
    >
      {expense.amountTypeCode === "variable" ? "변동" : amountLabel}
    </Text>
  );
  const methodCaption = method ? "" : "결제수단 미지정";
  const metadata = [
    expense.endMonth ? `${formatMonth(expense.endMonth)}까지` : "",
    methodCaption,
  ]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <View style={styles.content}>
      <View style={styles.mainLine}>
        {date}
        <View style={styles.nameGroup}>
          {method && <ProviderIcon code={method.providerCode} size={18} />}
          {name}
        </View>
        {!stacked && amount}
      </View>
      {stacked && amount}
      {metadata ? (
        <View style={styles.methodLine}>
          <Text numberOfLines={1} style={styles.method}>
            {metadata}
          </Text>
        </View>
      ) : null}
    </View>
  );
  const rowStyle = [styles.row, !!metadata && styles.twoLineRow];
  if (reorder)
    return (
      <View style={[...rowStyle, reorder.active && styles.active]}>
        <View style={styles.editContent}>{content}</View>
        <ReorderHandle label={fullLabel} reorder={reorder} />
      </View>
    );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${fullLabel}, 상세보기`}
      onPress={onPress}
      style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={fullLabel} style={rowStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    minHeight: 44,
  },
  twoLineRow: { minHeight: 52 },
  editContent: { flex: 1, minWidth: 0 },
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
  methodLine: {
    alignSelf: "flex-end",
    maxWidth: "55%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  method: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400",
    color: colors.muted,
    textAlign: "right",
  },
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
  stackedAmount: { alignSelf: "flex-end", maxWidth: "100%" },
  variableAmount: { color: colors.muted, fontWeight: "500" },
});
