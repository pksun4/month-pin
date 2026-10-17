import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./typography";
import { Button, colors, FormModal, s } from "./ui";
import { YearEndSalaryForm } from "./year-end-salary-form";
import { YearEndTaxGuide } from "./year-end-tax-guide";
import { YearSelector } from "./year-selector";
import { CompactActionButton } from "./list-controls";
import { useYearEndTax } from "../hooks/use-year-end-tax";
import { useMonthPin } from "../hooks/use-month-pin";
import type { YearEndTaxSettings } from "../data/models";
import { cardSpendingTarget } from "../utils/year-end-tax";
import { money } from "../utils/expenses";

type TaxModal =
  | { code: "salary"; settings: YearEndTaxSettings }
  | { code: "deduction_guide" }
  | null;

export function YearEndTaxView({
  year,
  onYearChange,
  active,
}: {
  year: number;
  onYearChange: (year: number) => void;
  active: boolean;
}) {
  const { snapshot, loading, error, retry } = useYearEndTax(year, active);
  const { busy } = useMonthPin();
  const [modal, setModal] = useState<TaxModal>(null);
  const target = snapshot ? cardSpendingTarget(snapshot.grossSalary) : null;
  const salaryActionLabel =
    snapshot?.grossSalary === null ? "연봉 입력" : "연봉 수정";
  return (
    <>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.page, styles.page]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.blue} />
            <Text style={s.caption}>연말정산 정보를 불러오고 있어요.</Text>
          </View>
        ) : error ? (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
            <Button label="다시 시도" secondary onPress={retry} />
          </View>
        ) : snapshot ? (
          <View style={styles.target}>
            <View style={styles.targetMetrics}>
              <View style={styles.targetMetric}>
                <Text style={styles.targetLabel}>목표금액</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={styles.targetAmount}
                  accessibilityLabel={`목표금액 ${target === null ? "총급여 입력 전" : money(target)}`}
                >
                  {target === null ? "—" : money(target)}
                </Text>
              </View>
              <View style={styles.targetMetric}>
                <Text style={styles.targetLabel}>잔여금액</Text>
                <Text
                  style={[styles.targetAmount, styles.remainingAmount]}
                  accessibilityLabel={`잔여금액 ${target === null ? "총급여 입력 전" : "사용금액 집계 전"}`}
                >
                  —
                </Text>
              </View>
            </View>
            {target === null && (
              <Text style={styles.explanation}>
                총급여를 입력하면 목표금액을 계산해요.
              </Text>
            )}
            <View style={styles.targetFooter}>
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                accessibilityLabel="사용금액 소득공제율 안내"
                accessibilityHint="결제수단별 기본 공제율과 계산 기준을 확인해요."
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => setModal({ code: "deduction_guide" })}
                style={({ pressed }) => [
                  styles.helpButton,
                  (pressed || busy) && styles.dimmed,
                ]}
              >
                <Text style={[s.caption, styles.targetHintText]}>
                  총급여의 25% · 사용금액 소득공제 기준
                </Text>
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.helpIcon}
                  accessible={false}
                />
              </Pressable>
              <View style={styles.salaryAction}>
                <CompactActionButton
                  label={salaryActionLabel}
                  icon={
                    snapshot.grossSalary === null ? "add" : "create-outline"
                  }
                  accessibilityLabel={`${year}년 ${salaryActionLabel}`}
                  disabled={busy}
                  onPress={() =>
                    setModal({ code: "salary", settings: snapshot })
                  }
                />
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.monthSection}>
          <YearSelector year={year} onChange={onYearChange} disabled={busy} />
          <View style={styles.months}>
            {Array.from({ length: 4 }, (_, row) => (
              <View key={row} style={styles.monthRow}>
                {Array.from({ length: 3 }, (_, column) => {
                  const month = row * 3 + column + 1;
                  return (
                    <View
                      key={month}
                      accessible
                      accessibilityLabel={`${year}년 ${month}월 사용금액 집계 전`}
                      style={styles.monthCell}
                    >
                      <Text style={styles.monthLabel}>{month}월</Text>
                      <Text style={styles.monthAmount}>—</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {modal?.code === "salary" && active && modal.settings.year === year && (
        <FormModal
          title={`${year}년 총급여`}
          busy={busy}
          onClose={() => setModal(null)}
        >
          <YearEndSalaryForm
            settings={modal.settings}
            onClose={() => setModal(null)}
          />
        </FormModal>
      )}
      {modal?.code === "deduction_guide" && active && (
        <FormModal
          title="사용금액 소득공제 안내"
          onClose={() => setModal(null)}
        >
          <YearEndTaxGuide />
        </FormModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 12, gap: 16 },
  loading: { alignItems: "center", paddingVertical: 48, gap: 12 },
  target: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.white,
  },
  targetMetrics: { flexDirection: "row", gap: 16 },
  targetMetric: { flex: 1, minWidth: 0, gap: 4 },
  targetLabel: { fontSize: 12, lineHeight: 20, color: colors.muted },
  remainingAmount: { color: colors.muted },
  targetHintText: {
    flexShrink: 1,
    marginTop: 0,
    fontSize: 12,
    lineHeight: 18,
  },
  helpIcon: { lineHeight: 18 },
  explanation: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  helpButton: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  targetFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
  },
  targetAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.blue,
    fontVariant: ["tabular-nums"],
  },
  salaryAction: { marginLeft: "auto" },
  monthSection: { gap: 12 },
  months: { gap: 8 },
  monthRow: { flexDirection: "row", gap: 8 },
  monthCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  monthLabel: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  monthAmount: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  dimmed: { opacity: 0.6 },
});
