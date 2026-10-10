import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LedgerEntry } from "../data/models";
import { calendarDays, dailyLedger, monthKey } from "../utils/ledger";
import { money } from "../utils/expenses";
import { colors } from "./ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function LedgerCalendar({
  month,
  entries,
  selectedDay,
  onSelect,
  minimumDate,
  showLegend = true,
}: {
  month: string;
  entries: readonly LedgerEntry[];
  selectedDay: number;
  onSelect: (day: number) => void;
  minimumDate?: string;
  showLegend?: boolean;
}) {
  const days = calendarDays(month);
  const totals = dailyLedger(entries);
  const now = new Date();
  const today = monthKey(now) === month ? now.getDate() : null;
  return (
    <View style={styles.calendar}>
      <View style={styles.week}>
        {WEEKDAYS.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.weekday,
              index === 0 && styles.sunday,
              index === 6 && styles.saturday,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
      {Array.from({ length: days.length / 7 }, (_, week) => (
        <View key={week} style={styles.week}>
          {days.slice(week * 7, week * 7 + 7).map((day, column) => {
            if (day === null) return <View key={column} style={styles.blank} />;
            const summary = totals.get(day);
            const selected = day === selectedDay;
            const disabled =
              !!minimumDate &&
              `${month}-${String(day).padStart(2, "0")}` < minimumDate;
            return (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityLabel={`${month.replace("-", "년 ")}월 ${day}일${day === today ? ", 오늘" : ""}, ${summary?.count ?? 0}건, ${money(summary?.total ?? 0)}${summary?.pending ? `, 금액 미입력 ${summary.pending}건` : ""}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onSelect(day)}
                style={({ pressed }) => [
                  styles.cell,
                  disabled && styles.disabled,
                  selected && styles.selected,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.2}
                  style={[
                    styles.day,
                    column === 0 && styles.sunday,
                    column === 6 && styles.saturday,
                    day === today && styles.today,
                    selected && styles.selectedText,
                  ]}
                >
                  {day}
                </Text>
                {summary && summary.count > summary.pending && (
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    maxFontSizeMultiplier={1.2}
                    style={[styles.amount, selected && styles.selectedText]}
                  >
                    {summary.total.toLocaleString("ko-KR")}
                  </Text>
                )}
                {!!summary?.pending && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </View>
      ))}
      {showLegend && (
        <View style={styles.legend}>
          <Text style={styles.legendText}>날짜별 합계 · 원</Text>
          <View style={styles.legendItem}>
            <View style={styles.dot} />
            <Text style={styles.legendText}>금액 미입력</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  week: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 20,
    color: colors.muted,
    paddingBottom: 4,
  },
  blank: { flex: 1, height: 64 },
  cell: {
    flex: 1,
    minWidth: 0,
    height: 64,
    paddingHorizontal: 1,
    paddingTop: 5,
    alignItems: "center",
    borderRadius: 9,
  },
  selected: { backgroundColor: colors.softBlue },
  disabled: { opacity: 0.3 },
  day: { fontSize: 13, lineHeight: 20, fontWeight: "500", color: colors.ink },
  sunday: { color: colors.red },
  saturday: { color: colors.blue },
  today: { fontWeight: "800", textDecorationLine: "underline" },
  selectedText: { color: colors.blue, fontWeight: "700" },
  amount: {
    width: "100%",
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.orange,
    marginTop: 3,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: colors.muted, fontSize: 10, lineHeight: 16 },
});
