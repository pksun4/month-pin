import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./typography";
import { formatMonth, monthKey, parseMonth } from "../utils/ledger";
import { colors, FieldLabel, FieldMessage, s } from "./ui";

export function MonthField({
  label,
  value,
  onChange,
  disabled,
  minimumMonth = "1000-01",
  hint,
  displayValue,
}: {
  label: string;
  value: string;
  onChange: (month: string) => void;
  disabled: boolean;
  minimumMonth?: string;
  hint?: string;
  displayValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const pickerYear = () => parseMonth(displayValue ? monthKey() : value).year;
  const [year, setYear] = useState(pickerYear);
  const minimumYear = parseMonth(minimumMonth).year;
  return (
    <View style={s.field}>
      <View style={s.inlineField}>
        <View style={[s.inlineFieldLabel, { flexBasis: 96 * fontScale }]}>
          <FieldLabel label={label} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${displayValue ?? formatMonth(value)}, 월 선택`}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() => {
            setYear(pickerYear());
            setOpen((previous) => !previous);
          }}
          style={[styles.input, { flexBasis: 180 * fontScale }]}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.muted} />
          <Text style={[s.body, s.flex]}>
            {displayValue ?? formatMonth(value)}
            {value === monthKey() ? " · 이번 달" : ""}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.muted}
          />
        </Pressable>
      </View>
      {open && (
        <View style={styles.picker}>
          <View style={styles.yearBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 해"
              accessibilityState={{ disabled: disabled || year <= minimumYear }}
              disabled={disabled || year <= minimumYear}
              onPress={() => setYear(year - 1)}
              style={styles.arrow}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={year <= minimumYear ? colors.line : colors.ink}
              />
            </Pressable>
            <Text style={[s.body, styles.year]}>{year}년</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 해"
              accessibilityState={{ disabled: disabled || year >= 9999 }}
              disabled={disabled || year >= 9999}
              onPress={() => setYear(year + 1)}
              style={styles.arrow}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={year >= 9999 ? colors.line : colors.ink}
              />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${year}-${String(index + 1).padStart(2, "0")}`;
              const unavailable = disabled || month < minimumMonth;
              const selected = month === value;
              return (
                <Pressable
                  key={month}
                  accessibilityRole="button"
                  accessibilityLabel={`${year}년 ${index + 1}월`}
                  accessibilityState={{ selected, disabled: unavailable }}
                  disabled={unavailable}
                  onPress={() => {
                    onChange(month);
                    setOpen(false);
                  }}
                  style={[
                    styles.month,
                    selected && styles.selected,
                    unavailable && styles.dimmed,
                  ]}
                >
                  <Text style={[s.body, selected && styles.selectedText]}>
                    {index + 1}월
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <FieldMessage hint={hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  picker: { backgroundColor: colors.white, borderRadius: 10, padding: 4 },
  yearBar: { flexDirection: "row", alignItems: "center" },
  arrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  year: { flex: 1, textAlign: "center", fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  month: {
    width: "25%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  selected: { backgroundColor: colors.softBlue },
  selectedText: { color: colors.blue, fontWeight: "700" },
  dimmed: { opacity: 0.3 },
});
