import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AppText as Text } from "./typography";
import { Button, colors, s } from "./ui";
import type { AnnualMonthSummary, AnnualSummary } from "../data/models";
import { useAnnualSummary } from "../hooks/use-annual-summary";
import { annualTotals, monthsOfYear } from "../utils/annual-summary";
import { money } from "../utils/expenses";
import { YearSelector } from "./year-selector";
import { useMonthPin } from "../hooks/use-month-pin";

export function AnnualSummaryView({
  year,
  onYearChange,
  active,
}: {
  year: number;
  onYearChange: (year: number) => void;
  active: boolean;
}) {
  const { snapshot, loading, error, retry } = useAnnualSummary(year, active);
  const { busy } = useMonthPin();
  const yearSelector = (
    <YearSelector year={year} onChange={onYearChange} disabled={busy} />
  );
  return (
    <ScrollView
      style={s.flex}
      contentContainerStyle={[s.page, styles.page]}
      showsVerticalScrollIndicator={false}
    >
      <AnnualSummaryContent
        snapshot={snapshot}
        year={year}
        loading={loading}
        yearSelector={yearSelector}
        status={
          error ? (
            <View style={s.card}>
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
              <Button label="다시 시도" secondary onPress={retry} />
            </View>
          ) : null
        }
      />
    </ScrollView>
  );
}

function AnnualSummaryContent({
  snapshot,
  year,
  loading,
  yearSelector,
  status,
}: {
  snapshot: AnnualSummary | null;
  year: number;
  loading: boolean;
  yearSelector: ReactNode;
  status: ReactNode;
}) {
  const total = snapshot ? annualTotals(snapshot) : null;
  return (
    <>
      <View style={styles.summary} accessibilityState={{ busy: loading }}>
        <SummaryRow
          label="연간 지출 합계"
          amount={total?.expenseTotal ?? null}
        />
        <SummaryRow
          label="카드 혜택"
          amount={total?.benefitTotal ?? null}
          deduction
        />
        <SummaryRow
          label="혜택 반영 예상액"
          amount={total?.estimatedTotal ?? null}
          emphasized
        />
      </View>
      {status}
      <View style={styles.monthSection}>
        {yearSelector}
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
          {monthsOfYear(year).map((monthKey) => (
            <AnnualMonthRow
              key={monthKey}
              monthKey={monthKey}
              month={
                snapshot?.months.find((item) => item.month === monthKey) ?? null
              }
            />
          ))}
        </View>
      </View>
      {total &&
        (total.pendingExpenses > 0 || total.pendingBenefitMonths > 0) && (
          <View style={styles.notes}>
            {total.pendingExpenses > 0 && (
              <Text style={styles.expensePending}>
                금액 미입력 {total.pendingExpenses}건 · 합계 제외
              </Text>
            )}
            {total.pendingBenefitMonths > 0 && (
              <Text style={styles.benefitPending}>
                혜택 미확정 {total.pendingBenefitMonths}개월 · 예상액 포함
              </Text>
            )}
          </View>
        )}
    </>
  );
}

function SummaryRow({
  label,
  amount,
  emphasized = false,
  deduction = false,
}: {
  label: string;
  amount: number | null;
  emphasized?: boolean;
  deduction?: boolean;
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
        accessibilityLabel={
          amount === null
            ? `${label} 조회 전`
            : deduction
              ? `${label} ${money(amount)} 차감`
              : undefined
        }
      >
        {deduction && amount !== null && amount > 0 ? "−" : ""}
        {amount === null ? "—" : money(amount)}
      </Text>
    </View>
  );
}

function AnnualMonthRow({
  month,
  monthKey,
}: {
  month: AnnualMonthSummary | null;
  monthKey: string;
}) {
  const label = `${Number(monthKey.slice(5))}월`;
  return (
    <View
      accessible
      accessibilityLabel={
        month
          ? `${label}, 지출 합계 ${month?.expenseCount ? money(month.expenseTotal) : "내역 없음"}, 변동비 미입력 ${month.pendingExpenses}건, 카드 혜택 ${month.benefitCount ? `${money(month.benefitTotal)} 차감` : "내역 없음"}, 혜택 미확정 ${month.pendingBenefits}개`
          : `${label}, 조회 전`
      }
      style={styles.monthRow}
    >
      <Text style={[styles.monthName, styles.monthColumn]}>{label}</Text>
      <View style={styles.amountColumn}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
          {month?.expenseCount ? money(month.expenseTotal) : "—"}
        </Text>
        {!!month && month.pendingExpenses > 0 && (
          <Text style={styles.expensePending}>
            미입력 {month.pendingExpenses}건
          </Text>
        )}
      </View>
      <View style={styles.amountColumn}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>
          {month?.benefitCount
            ? `${month.benefitTotal > 0 ? "−" : ""}${money(month.benefitTotal)}`
            : "—"}
        </Text>
        {!!month && month.pendingBenefits > 0 && (
          <Text style={styles.benefitPending}>예상 포함</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 20, gap: 16 },
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
