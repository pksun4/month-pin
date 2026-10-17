import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./typography";
import { Button, colors, FormModal, s } from "./ui";
import { YearEndSalaryForm } from "./year-end-salary-form";
import { YearEndTaxGuide } from "./year-end-tax-guide";
import { YearEndSpendingForm } from "./year-end-spending-form";
import { YearEndCardSelectionForm } from "./year-end-card-selection-form";
import { YearSelector } from "./year-selector";
import { CompactActionButton } from "./list-controls";
import { useYearEndTax } from "../hooks/use-year-end-tax";
import { useMonthPin } from "../hooks/use-month-pin";
import type {
  YearEndTaxSettings,
  TaxCardSpending,
  YearEndTaxCard,
} from "../data/models";
import type { TaxSpendingAmounts } from "../data/tax-spending-types";
import {
  cardSpendingTarget,
  remainingTaxTarget,
  taxEntryTotal,
} from "../utils/year-end-tax";
import { money } from "../utils/expenses";

type TaxModal =
  | { code: "salary"; settings: YearEndTaxSettings }
  | { code: "deduction_guide" }
  | { code: "cards"; year: number; selectedIds: number[] }
  | {
      code: "spending";
      year: number;
      month: number;
      amounts: TaxSpendingAmounts | null;
      cards: TaxCardSpending[];
      selectedCards: YearEndTaxCard[];
      confirmed: boolean;
    }
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
  const [modalState, setModalState] = useState<{
    year: number;
    value: TaxModal;
  }>({ year, value: null });
  // Reset only the editor state when the year changes, keeping the page mounted.
  if (modalState.year !== year) {
    setModalState({ year, value: null });
  }
  const modal = modalState.year === year ? modalState.value : null;
  const setModal = (value: TaxModal) => setModalState({ year, value });
  const target = snapshot ? cardSpendingTarget(snapshot.grossSalary) : null;
  const remaining = snapshot
    ? remainingTaxTarget(snapshot.grossSalary, snapshot.months)
    : null;
  const monthDisabled = busy || loading || !!error || !snapshot || !active;
  const salaryActionLabel =
    snapshot?.grossSalary == null ? "연봉 입력" : "연봉 수정";
  return (
    <>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.page, styles.page]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.target} accessibilityState={{ busy: loading }}>
          <View style={styles.targetMetrics}>
            <View style={styles.targetMetric}>
              <Text style={styles.targetLabel}>목표금액</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={styles.targetAmount}
                accessibilityLabel={`목표금액 ${!snapshot ? (loading ? "조회 중" : "조회 전") : target === null ? "총급여 입력 전" : money(target)}`}
              >
                {target === null ? "—" : money(target)}
              </Text>
            </View>
            <View style={styles.targetMetric}>
              <Text style={styles.targetLabel}>잔여금액</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.targetAmount, styles.remainingAmount]}
                accessibilityLabel={`잔여금액 ${!snapshot ? (loading ? "조회 중" : "조회 전") : remaining === null ? "총급여 입력 전" : `${money(remaining)}, 입력한 월 기준`}`}
              >
                {remaining === null ? "—" : money(remaining)}
              </Text>
            </View>
          </View>
          <View style={styles.targetFooter}>
            <Pressable
              accessibilityRole="button"
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
                총급여의 25%
              </Text>
              <View style={styles.helpLabelRow}>
                <Text style={[s.caption, styles.targetHintText]}>
                  사용금액 소득공제 기준
                </Text>
                <Ionicons
                  name="help-circle-outline"
                  size={14}
                  color={colors.muted}
                  style={styles.helpIcon}
                  accessible={false}
                />
              </View>
            </Pressable>
            <View style={styles.salaryAction}>
              <CompactActionButton
                label={salaryActionLabel}
                size="small"
                icon={snapshot?.grossSalary == null ? "add" : "create-outline"}
                accessibilityLabel={`${year}년 ${salaryActionLabel}`}
                disabled={monthDisabled}
                onPress={() => {
                  if (monthDisabled || !snapshot) return;
                  setModal({ code: "salary", settings: snapshot });
                }}
              />
            </View>
          </View>
        </View>
        {error && (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
            <Button label="다시 시도" secondary onPress={retry} />
          </View>
        )}
        <View style={styles.monthSection}>
          <YearSelector
            year={year}
            onChange={onYearChange}
            disabled={busy}
            action={
              <CompactActionButton
                label={`카드 선택 · ${snapshot ? `${snapshot.selectedCards?.length ?? 0}개` : "—"}`}
                icon="card-outline"
                size="small"
                secondary
                accessibilityLabel={`${year}년 연말정산 카드 선택, ${snapshot ? `${snapshot.selectedCards?.length ?? 0}개 선택됨` : "조회 전"}`}
                disabled={monthDisabled}
                onPress={() => {
                  if (monthDisabled) return;
                  setModal({
                    code: "cards",
                    year,
                    selectedIds: (snapshot?.selectedCards ?? []).map(
                      (card) => card.methodId,
                    ),
                  });
                }}
              />
            }
          />
          <View style={styles.months}>
            {Array.from({ length: 4 }, (_, row) => (
              <View key={row} style={styles.monthRow}>
                {Array.from({ length: 3 }, (_, column) => {
                  const month = row * 3 + column + 1;
                  const entry = snapshot?.months.find(
                    (item) => item.month === month,
                  );
                  const amount = entry ? taxEntryTotal(entry) : null;
                  const confirmed = entry?.confirmed === true;
                  return (
                    <Pressable
                      key={month}
                      accessibilityRole="button"
                      accessibilityLabel={`${year}년 ${month}월 사용금액 ${!snapshot ? "조회 전" : amount === null ? "미입력, 입력" : `${money(amount)}, ${confirmed ? "확정, " : ""}수정`}`}
                      accessibilityState={{ disabled: monthDisabled }}
                      disabled={monthDisabled}
                      onPress={() => {
                        if (monthDisabled) return;
                        setModal({
                          code: "spending",
                          year,
                          month,
                          amounts: entry?.amounts ?? null,
                          cards: entry?.cards ?? [],
                          selectedCards: snapshot?.selectedCards ?? [],
                          confirmed,
                        });
                      }}
                      style={({ pressed }) => [
                        styles.monthCell,
                        confirmed && styles.monthConfirmed,
                        (pressed || busy) && styles.dimmed,
                      ]}
                    >
                      <Text style={styles.monthLabel}>{month}월</Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={[
                          styles.monthAmount,
                          amount !== null && styles.monthEntered,
                        ]}
                      >
                        {amount === null ? "-" : money(amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {modal?.code === "cards" && active && modal.year === year && (
        <FormModal
          title={`${year}년 연말정산 카드`}
          presentation="dialog"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <YearEndCardSelectionForm
            year={year}
            selectedIds={modal.selectedIds}
            onClose={() => setModal(null)}
          />
        </FormModal>
      )}
      {modal?.code === "spending" && active && modal.year === year && (
        <FormModal
          title={`${year}년 ${modal.month}월 사용금액`}
          presentation="full_screen"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <YearEndSpendingForm
            key={`${year}-${modal.month}`}
            year={year}
            month={modal.month}
            amounts={modal.amounts}
            cards={modal.cards}
            selectedCards={modal.selectedCards}
            confirmed={modal.confirmed}
            onClose={() => setModal(null)}
          />
        </FormModal>
      )}
      {modal?.code === "salary" && active && modal.settings.year === year && (
        <FormModal
          title={`${year}년 총급여`}
          presentation="dialog"
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
          presentation="full_screen"
          onClose={() => setModal(null)}
        >
          <YearEndTaxGuide />
        </FormModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 20, paddingBottom: 12, gap: 16 },
  target: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  helpIcon: { lineHeight: 18, flexShrink: 0 },
  helpButton: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  helpLabelRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  targetFooter: {
    flexDirection: "row",
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
  salaryAction: { flexShrink: 0 },
  monthSection: { gap: 8 },
  months: { gap: 8 },
  monthRow: { flexDirection: "row", gap: 8 },
  monthCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 11,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  monthConfirmed: { borderColor: colors.blueLine },
  monthAmount: {
    maxWidth: "100%",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  monthEntered: { color: colors.ink, fontWeight: "700" },
  dimmed: { opacity: 0.6 },
});
