import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { dateKey, moveMonth, parseMonth } from "../utils/ledger";
import { LedgerCalendar } from "./ledger-calendar";
import { colors, s } from "./ui";

export function EffectiveDateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (date: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const minimumDate = dateKey();
  const { year, monthIndex } = parseMonth(month);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>변경 적용일</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`변경 적용일 ${value}, 날짜 선택`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          setMonth(value.slice(0, 7));
          setOpen((previous) => !previous);
        }}
        style={styles.input}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.muted} />
        <Text style={[s.body, s.flex]}>
          {value.replace(/-/g, ". ")}
          {value === minimumDate ? " · 오늘" : ""}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>
      {open && (
        <View>
          <View style={styles.monthBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              disabled={disabled || month <= minimumDate.slice(0, 7)}
              onPress={() => setMonth(moveMonth(month, -1))}
              style={styles.button}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={
                  month <= minimumDate.slice(0, 7) ? colors.line : colors.ink
                }
              />
            </Pressable>
            <Text style={[s.body, styles.month]}>
              {year}년 {monthIndex + 1}월
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              disabled={disabled || month === "9999-12"}
              onPress={() => setMonth(moveMonth(month, 1))}
              style={styles.button}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <LedgerCalendar
            month={month}
            entries={[]}
            selectedDay={
              value.slice(0, 7) === month ? Number(value.slice(8)) : 0
            }
            minimumDate={minimumDate}
            showLegend={false}
            onSelect={(day) => {
              if (disabled) return;
              onChange(`${month}-${String(day).padStart(2, "0")}`);
              setOpen(false);
            }}
          />
        </View>
      )}
      <Text style={s.caption}>
        선택한 날짜부터 새 금액을 반영해요. 이전 내역과 직접 입력한 변동 금액은
        유지돼요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
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
  monthBar: { flexDirection: "row", alignItems: "center" },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  month: { flex: 1, textAlign: "center", fontWeight: "600" },
});
