import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { LedgerEntry } from "../../data/models";
import { useMonthPin } from "../../hooks/use-month-pin";
import { useLedgerMonth } from "../../hooks/use-ledger-month";
import {
  daysInMonth,
  ledgerSummary,
  monthKey,
  moveMonth,
  parseMonth,
} from "../../utils/ledger";
import { money } from "../../utils/expenses";
import { LedgerCalendar } from "../../components/ledger-calendar";
import { LedgerEntryRow } from "../../components/ledger-entry-row";
import { LedgerAmountForm } from "../../components/ledger-amount-form";
import {
  Button,
  colors,
  Empty,
  FormModal,
  Header,
  Screen,
  s,
} from "../../components/ui";

export default function LedgerScreen() {
  const [month, setMonth] = useState(() => monthKey());
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const { busy } = useMonthPin();
  const { entries, loading, error, retry } = useLedgerMonth(month);
  const summary = useMemo(() => ledgerSummary(entries), [entries]);
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
                title="가계부"
                description="월별 지출을 확인하고 기록해요"
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
                    <View style={s.between}>
                      <Text style={styles.summaryLabel}>월 합계</Text>
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
                      style={styles.summaryAmount}
                    >
                      {money(summary.total)}
                    </Text>
                  </View>
                  <LedgerCalendar
                    month={month}
                    entries={entries}
                    selectedDay={selectedDay}
                    onSelect={setSelectedDay}
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
            !loading && !error ? (
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
                    : "고정비 메뉴에 항목을 등록하면 매월 가계부에 표시돼요."
                }
              />
            ) : null
          }
          ListFooterComponent={
            !loading && !error ? (
              <Text style={styles.footer}>
                고정 금액은 자동 반영돼요. 변동 항목을 눌러 이 달의 실제 금액을
                입력해 주세요.
              </Text>
            ) : null
          }
        />
      </Screen>
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
    padding: 14,
    gap: 4,
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
  summaryAmount: {
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
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
