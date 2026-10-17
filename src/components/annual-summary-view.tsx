import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { AppText as Text } from "./typography";
import { Button, colors, Empty, s } from "./ui";
import type { AnnualMonthSummary, AnnualSummary } from "../data/models";
import { useAnnualSummary } from "../hooks/use-annual-summary";
import { annualTotals } from "../utils/annual-summary";
import { money } from "../utils/expenses";

export function AnnualSummaryView({
  year,
  active,
}: {
  year: number;
  active: boolean;
}) {
  const { snapshot, loading, error, retry } = useAnnualSummary(year, active);
  return (
    <ScrollView
      style={s.flex}
      contentContainerStyle={[s.page, styles.page]}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.blue} />
          <Text style={s.caption}>연간 요약을 불러오고 있어요.</Text>
        </View>
      ) : error ? (
        <View style={s.card}>
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
          <Button label="다시 시도" secondary onPress={retry} />
        </View>
      ) : snapshot ? (
        <AnnualSummaryContent snapshot={snapshot} />
      ) : null}
    </ScrollView>
  );
}

function AnnualSummaryContent({ snapshot }: { snapshot: AnnualSummary }) {
  const total = annualTotals(snapshot);
  if (total.expenseCount === 0 && total.benefitCount === 0)
    return (
      <Empty
        icon="bar-chart-outline"
        title={`${snapshot.year}년 내역이 없어요`}
        description="고정비와 카드 혜택을 등록하면 한 해의 흐름을 모아볼 수 있어요."
      />
    );
  return (
    <>
      <View style={styles.summary}>
        <SummaryRow label="연간 지출 합계" amount={total.expenseTotal} />
        <SummaryRow label="카드 혜택" amount={total.benefitTotal} />
        <SummaryRow
          label="혜택 반영 예상액"
          amount={total.estimatedTotal}
          emphasized
        />
      </View>
      <View style={styles.notes}>
        <Text style={s.caption}>
          1~12월 캘린더 기준 · 예정된 고정 지출도 포함해요.
        </Text>
        <Text style={s.caption}>
          카드 혜택은 확정한 금액과 미확정 예상 금액을 더해요.
        </Text>
        {total.pendingExpenses > 0 && (
          <Text style={styles.expensePending}>
            변동비 미입력 {total.pendingExpenses}건 · 지출 합계에서 제외
          </Text>
        )}
        {total.pendingBenefitMonths > 0 && (
          <Text style={styles.benefitPending}>
            혜택 미확정 {total.pendingBenefitMonths}개월 · 예상 금액 반영
          </Text>
        )}
      </View>
      <View style={styles.monthSection}>
        <Text style={s.sectionTitle} accessibilityRole="header">
          월별 요약
        </Text>
        <View style={styles.months}>
          <View style={styles.tableHeader}>
            <Text style={[styles.columnLabel, styles.monthColumn]}>월</Text>
            <Text style={[styles.columnLabel, styles.amountColumn]}>
              지출 합계
            </Text>
            <Text style={[styles.columnLabel, styles.amountColumn]}>
              카드 혜택
            </Text>
          </View>
          {snapshot.months.map((month) => (
            <AnnualMonthRow key={month.month} month={month} />
          ))}
        </View>
      </View>
    </>
  );
}

function SummaryRow({
  label,
  amount,
  emphasized = false,
}: {
  label: string;
  amount: number;
  emphasized?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, emphasized && styles.estimateRow]}>
      <Text style={[styles.summaryLabel, emphasized && styles.estimateLabel]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.summaryValue, emphasized && styles.estimateValue]}
      >
        {money(amount)}
      </Text>
    </View>
  );
}

function AnnualMonthRow({ month }: { month: AnnualMonthSummary }) {
  const label = `${Number(month.month.slice(5))}월`;
  return (
    <View
      accessible
      accessibilityLabel={`${label}, 지출 합계 ${money(month.expenseTotal)}, 변동비 미입력 ${month.pendingExpenses}건, 카드 혜택 ${money(month.benefitTotal)}, 혜택 미확정 ${month.pendingBenefits}개`}
      style={styles.monthRow}
    >
      <Text style={[styles.monthName, styles.monthColumn]}>{label}</Text>
      <View style={styles.amountColumn}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
          {month.expenseCount ? money(month.expenseTotal) : "—"}
        </Text>
        {month.pendingExpenses > 0 && (
          <Text style={styles.expensePending}>
            미입력 {month.pendingExpenses}건
          </Text>
        )}
      </View>
      <View style={styles.amountColumn}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
          {month.benefitCount ? money(month.benefitTotal) : "—"}
        </Text>
        {month.pendingBenefits > 0 && (
          <Text style={styles.benefitPending}>예상 포함</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 12, gap: 16 },
  loading: { alignItems: "center", paddingVertical: 48, gap: 12 },
  summary: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "right",
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  estimateRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 2,
    paddingTop: 8,
  },
  estimateLabel: { color: colors.ink, fontWeight: "600" },
  estimateValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: colors.blue,
  },
  notes: { gap: 4 },
  expensePending: { fontSize: 11, lineHeight: 18, color: colors.orangeInk },
  benefitPending: { fontSize: 11, lineHeight: 18, color: colors.green },
  monthSection: { gap: 12 },
  months: {
    backgroundColor: colors.white,
    borderRadius: 14,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  columnLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right",
  },
  monthColumn: { width: 32, flexShrink: 0, textAlign: "left" },
  amountColumn: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  monthName: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  amount: {
    maxWidth: "100%",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
});
