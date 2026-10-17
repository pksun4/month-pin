import { AppText as Text } from "./typography";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CardBenefitMonth, LedgerEntry } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import { useLedgerMonth } from "../hooks/use-ledger-month";
import { useCardBenefitMonth } from "../hooks/use-card-benefit-month";
import { cardBenefitMonthSummary } from "../utils/card-benefits";
import { CardBenefitForm } from "./card-benefit-form";
import {
  daysInMonth,
  ledgerSummary,
  monthKey,
  moveMonth,
  parseMonth,
} from "../utils/ledger";
import { money } from "../utils/expenses";
import { RegisterButton } from "./list-controls";
import { ExpenseForm } from "./expense-form";
import { LedgerCalendar } from "./ledger-calendar";
import { LedgerEntryRow } from "./ledger-entry-row";
import { LedgerAmountForm } from "./ledger-amount-form";
import { Button, colors, Empty, FormModal, Header, Screen, s } from "./ui";

export function ExpenseCalendarView({
  active,
  viewSwitcher,
}: {
  active: boolean;
  viewSwitcher: ReactNode;
}) {
  const [month, setMonth] = useState(() => monthKey());
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [settling, setSettling] = useState<CardBenefitMonth | null>(null);
  const { busy } = useMonthPin();
  const ledger = useLedgerMonth(month, active);
  const cardBenefits = useCardBenefitMonth(month, active);
  const { entries } = ledger;
  const loading = ledger.loading || cardBenefits.loading;
  const error = ledger.error || cardBenefits.error;
  function retry() {
    ledger.retry();
    cardBenefits.retry();
  }
  const summary = useMemo(() => ledgerSummary(entries), [entries]);
  const benefitSummary = cardBenefitMonthSummary(cardBenefits.snapshot);
  const benefits = benefitSummary.total;
  const benefitLabel = benefitSummary.confirmed ? "확정 혜택" : "예상 혜택";
  const estimatedAmount = summary.total - benefits;
  const lastDay = daysInMonth(month);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.day === selectedDay),
    [entries, selectedDay],
  );
  const daySummary = ledgerSummary(selectedEntries);
  const { year, monthIndex } = parseMonth(month);
  function changeMonth(offset: number) {
    const next = moveMonth(month, offset);
    setMonth(next);
    setSelectedDay((day) => Math.min(day, daysInMonth(next)));
  }
  return (
    <>
      <Screen scrollable={false}>
        <FlatList
          data={loading || error ? [] : selectedEntries}
          keyExtractor={(entry) => String(entry.id)}
          style={s.flex}
          contentContainerStyle={[s.page, styles.page]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <Header
                title="고정비"
                description="매달 반복되는 지출을 관리해요"
                action={
                  <View style={styles.headerActions}>
                    {viewSwitcher}
                    <RegisterButton
                      accessibilityLabel="고정비 등록"
                      disabled={busy}
                      onPress={() => setAdding(true)}
                    />
                  </View>
                }
              />
              <View style={styles.monthBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이전 달"
                  disabled={busy || month === "1000-01"}
                  onPress={() => changeMonth(-1)}
                  style={styles.monthButton}
                >
                  <Ionicons name="chevron-back" size={22} color={colors.ink} />
                </Pressable>
                <Text style={styles.monthLabel}>
                  {year}년 {monthIndex + 1}월
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="다음 달"
                  disabled={busy || month === "9999-12"}
                  onPress={() => changeMonth(1)}
                  style={styles.monthButton}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={colors.ink}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="오늘로 이동"
                  disabled={busy}
                  onPress={() => {
                    const now = new Date();
                    setMonth(monthKey(now));
                    setSelectedDay(now.getDate());
                  }}
                  style={styles.todayButton}
                >
                  <Text style={styles.todayLabel}>오늘</Text>
                </Pressable>
              </View>
              {loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={s.caption}>월별 내역을 불러오고 있어요.</Text>
                </View>
              ) : error ? (
                <View style={s.card}>
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                  <Button label="다시 시도" secondary onPress={retry} />
                </View>
              ) : (
                <>
                  <View style={styles.summary}>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryLabelGroup}>
                        <Text style={styles.summaryLabel}>월 지출 합계</Text>
                        {summary.pending > 0 ? (
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingLabel}>
                              미입력 {summary.pending}건
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.count}>{summary.count}건</Text>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={styles.summaryValue}
                        accessibilityLabel={`월 지출 합계 ${money(summary.total)}, 전체 ${summary.count}건, 미입력 ${summary.pending}건`}
                      >
                        {money(summary.total)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{benefitLabel}</Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={styles.summaryValue}
                        accessibilityLabel={`${benefitLabel} ${money(benefits)} 차감`}
                      >
                        {benefits > 0 ? "−" : ""}
                        {money(benefits)}
                      </Text>
                    </View>
                    <View style={[styles.summaryRow, styles.estimateRow]}>
                      <Text style={styles.estimateLabel}>혜택 반영 예상액</Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={styles.estimateValue}
                        accessibilityLabel={`혜택 반영 예상액 ${money(estimatedAmount)}`}
                      >
                        {money(estimatedAmount)}
                      </Text>
                    </View>
                  </View>
                  <LedgerCalendar
                    month={month}
                    entries={entries}
                    selectedDay={selectedDay}
                    onSelect={setSelectedDay}
                    benefitsConfirmed={benefitSummary.confirmed}
                    benefitsPending={benefitSummary.pending > 0}
                  />
                  <View style={styles.dayHeader}>
                    <Text style={s.sectionTitle}>
                      {monthIndex + 1}월 {selectedDay}일
                    </Text>
                    <Text style={styles.dayTotal}>
                      {money(daySummary.total)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <LedgerEntryRow
              entry={item}
              disabled={busy}
              onPress={() => setEditing(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !loading && !error && selectedDay !== lastDay ? (
              <Empty
                icon="calendar-outline"
                title={
                  entries.length
                    ? "이 날짜에는 내역이 없어요"
                    : "등록된 고정비가 없어요"
                }
                description={
                  entries.length
                    ? "캘린더에서 다른 날짜를 선택해 주세요."
                    : "목록에서 고정비를 등록하면 해당 월부터 표시돼요."
                }
              />
            ) : null
          }
          ListFooterComponent={
            !loading && !error ? (
              <View>
                {selectedDay === lastDay && cardBenefits.snapshot && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`카드 혜택 정산, ${benefitSummary.confirmed ? "확정 금액 수정" : benefitSummary.variableCount ? `변동 카드 ${benefitSummary.pending}개 혜택 입력` : "변동 혜택 카드 없음"}`}
                    accessibilityState={{
                      disabled: busy || benefitSummary.variableCount === 0,
                    }}
                    disabled={busy || benefitSummary.variableCount === 0}
                    onPress={() => setSettling(cardBenefits.snapshot)}
                    style={({ pressed }) => [
                      styles.benefitSettlement,
                      pressed && { opacity: 0.65 },
                    ]}
                  >
                    <Ionicons
                      name="gift-outline"
                      size={22}
                      color={colors.blue}
                    />
                    <View style={s.flex}>
                      <Text style={styles.settlementTitle}>카드 혜택 정산</Text>
                      <Text style={styles.settlementCaption}>
                        {benefitSummary.confirmed
                          ? "이 달의 혜택을 확정했어요 · 수정 가능"
                          : benefitSummary.variableCount
                            ? `변동 카드 ${benefitSummary.pending}개 · 실제 혜택을 입력해 주세요`
                            : "변동 혜택 카드는 결제수단에서 등록해 주세요"}
                      </Text>
                    </View>
                    {benefitSummary.variableCount > 0 && (
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.muted}
                      />
                    )}
                  </Pressable>
                )}
                <Text style={styles.footer}>
                  고정 금액은 자동 반영돼요. 변동 항목은 실제 금액을 입력해
                  주세요. 미입력 금액은 합계에서 제외돼요.{"\n"}
                  {benefitSummary.confirmed
                    ? "카드 혜택은 이 달에 확정한 금액이에요."
                    : "예상 혜택은 이 달에 적용되는 카드 혜택 기준이에요. 말일의 혜택 정산에서 실제 금액을 확정해 주세요."}
                </Text>
              </View>
            ) : null
          }
        />
      </Screen>
      {settling && (
        <FormModal
          title="카드 혜택 정산"
          busy={busy}
          onClose={() => setSettling(null)}
        >
          <CardBenefitForm
            key={settling.month}
            snapshot={settling}
            onClose={() => setSettling(null)}
          />
        </FormModal>
      )}
      {adding && (
        <FormModal
          title="고정비 추가"
          busy={busy}
          onClose={() => setAdding(false)}
        >
          <ExpenseForm onClose={() => setAdding(false)} />
        </FormModal>
      )}
      {editing && (
        <FormModal
          title="변동 금액 입력"
          busy={busy}
          onClose={() => setEditing(null)}
        >
          <LedgerAmountForm
            key={editing.id}
            entry={editing}
            onClose={() => setEditing(null)}
          />
        </FormModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  page: { gap: 0, paddingTop: 16 },
  header: { gap: 12, marginBottom: 8 },
  monthBar: { flexDirection: "row", alignItems: "center", gap: 2 },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    fontWeight: "700",
  },
  todayButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  todayLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.blue,
    fontWeight: "600",
  },
  summary: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabelGroup: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  summaryValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  estimateRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 4,
    paddingTop: 8,
  },
  estimateLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  summaryLabel: { fontSize: 13, lineHeight: 20, color: colors.muted },
  count: { fontSize: 12, lineHeight: 20, color: colors.muted },
  pendingBadge: {
    backgroundColor: colors.softOrange,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingLabel: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.orangeInk,
  },
  estimateValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: colors.blue,
    fontVariant: ["tabular-nums"],
  },
  benefitSettlement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  settlementTitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    color: colors.ink,
  },
  settlementCaption: { fontSize: 12, lineHeight: 18, color: colors.muted },
  loading: { alignItems: "center", paddingVertical: 48 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 4,
  },
  dayTotal: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  separator: { height: 1, backgroundColor: colors.line },
  footer: { fontSize: 11, lineHeight: 18, color: colors.muted, paddingTop: 12 },
});
