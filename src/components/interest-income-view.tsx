import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useMonthPin } from "../hooks/use-month-pin";
import { useInterestIncomeYear } from "../hooks/use-interest-income-year";
import type { InterestIncomeEntry } from "../data/models";
import { money } from "../utils/expenses";
import { AppText as Text } from "./typography";
import { Button, colors, FormModal, s } from "./ui";
import { InterestIncomeForm } from "./interest-income-form";
import { InterestIncomeRow } from "./interest-income-row";
import { YearSelector } from "./year-selector";
import { settlementMonthStyles as monthStyles } from "./settlement-month-styles";

export function InterestIncomeView({
  year,
  onYearChange,
  active,
}: {
  year: number;
  onYearChange: (year: number) => void;
  active: boolean;
}) {
  const { busy } = useMonthPin();
  const { snapshot, loading, error, retry } = useInterestIncomeYear(
    year,
    active,
  );
  const disabled = busy || loading || !!error || !snapshot || !active;
  const annualTotal = snapshot
    ? snapshot.entries.reduce((sum, entry) => sum + entry.amount, 0)
    : null;
  const entries = snapshot
    ? [...snapshot.entries].sort(
        (a, b) => a.month - b.month || a.sortOrder - b.sortOrder || a.id - b.id,
      )
    : [];
  const [selection, setSelection] = useState<{
    year: number;
    month: number;
    entries: InterestIncomeEntry[];
  } | null>(null);
  if (selection && (selection.year !== year || !active)) setSelection(null);
  return (
    <>
      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.page, styles.page]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summary} accessibilityState={{ busy: loading }}>
          <Text style={styles.summaryLabel}>연간 이자 수입</Text>
          <Text
            style={styles.summaryAmount}
            accessibilityLabel={`${year}년 연간 이자 수입 ${annualTotal === null ? "조회 전" : money(annualTotal)}`}
          >
            {annualTotal === null ? "—" : money(annualTotal)}
          </Text>
        </View>
        {error && (
          <View style={s.card}>
            <Text style={s.error} accessibilityRole="alert">
              {error}
            </Text>
            <Button label="다시 시도" secondary onPress={retry} />
          </View>
        )}
        <View style={monthStyles.section}>
          <YearSelector year={year} onChange={onYearChange} disabled={busy} />
          <View style={monthStyles.grid}>
            {Array.from({ length: 4 }, (_, row) => (
              <View key={row} style={monthStyles.row}>
                {Array.from({ length: 3 }, (_, column) => {
                  const month = row * 3 + column + 1;
                  const monthEntries = entries.filter(
                    (entry) => entry.month === month,
                  );
                  const total = monthEntries.reduce(
                    (sum, entry) => sum + entry.amount,
                    0,
                  );
                  return (
                    <Pressable
                      key={month}
                      style={monthStyles.cell}
                      accessibilityRole="button"
                      accessibilityLabel={`${year}년 ${month}월 이자 수입 ${!snapshot ? "조회 전" : monthEntries.length ? `${money(total)}, 수정` : "미입력, 입력"}`}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={() => {
                        if (disabled) return;
                        setSelection({ year, month, entries: monthEntries });
                      }}
                    >
                      <Text style={monthStyles.label}>{month}월</Text>
                      <Text
                        style={[
                          monthStyles.amount,
                          monthEntries.length > 0 && styles.monthEntered,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {monthEntries.length ? money(total) : "-"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
        <View style={styles.entries} accessibilityState={{ busy: loading }}>
          <Text style={s.sectionTitle}>이자 내역</Text>
          {entries.length ? (
            <View>
              {entries.map((entry) => (
                <InterestIncomeRow
                  key={entry.id}
                  entry={entry}
                  dateLabel={`${entry.month}월`}
                  disabled={disabled}
                  onPress={() => {
                    if (disabled) return;
                    setSelection({
                      year,
                      month: entry.month,
                      entries: entries.filter(
                        (item) => item.month === entry.month,
                      ),
                    });
                  }}
                />
              ))}
            </View>
          ) : (
            <Text style={s.caption}>
              {loading
                ? "내역을 불러오고 있어요."
                : error
                  ? "내역을 불러오지 못했어요."
                  : "등록한 이자 내역이 없어요."}
            </Text>
          )}
        </View>
      </ScrollView>
      {selection && selection.year === year && active && (
        <FormModal
          title={`${year}년 ${selection.month}월 이자 수입`}
          presentation="dialog"
          busy={busy}
          onClose={() => setSelection(null)}
        >
          <InterestIncomeForm
            key={`${year}-${selection.month}`}
            year={year}
            month={selection.month}
            entries={selection.entries}
            onClose={() => setSelection(null)}
          />
        </FormModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 20, paddingBottom: 12, gap: 16 },
  summary: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 4,
    backgroundColor: colors.white,
  },
  summaryLabel: { fontSize: 12, lineHeight: 20, color: colors.muted },
  entries: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  monthEntered: { color: colors.ink, fontWeight: "700" },
  summaryAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.blue,
    fontVariant: ["tabular-nums"],
  },
});
