import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./typography";
import { colors } from "./ui";

export function YearSelector({
  year,
  onChange,
  disabled = false,
  action,
}: {
  year: number;
  onChange: (year: number) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  const previousDisabled = disabled || year === 1000;
  const nextDisabled = disabled || year === 9999;
  const currentYear = new Date().getFullYear();
  return (
    <View style={styles.bar}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 연도"
          accessibilityState={{ disabled: previousDisabled }}
          disabled={previousDisabled}
          onPress={() => onChange(year - 1)}
          style={({ pressed }) => [
            styles.button,
            (pressed || previousDisabled) && styles.dimmed,
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.label} accessibilityRole="header">
          {year}년
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 연도"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={() => onChange(year + 1)}
          style={({ pressed }) => [
            styles.button,
            (pressed || nextDisabled) && styles.dimmed,
          ]}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.ink} />
        </Pressable>
      </View>
      {year !== currentYear && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${currentYear}년으로 돌아가기`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onChange(currentYear)}
          style={({ pressed }) => [
            styles.current,
            (pressed || disabled) && styles.dimmed,
          ]}
        >
          <View style={styles.currentBadge}>
            <Ionicons
              name="return-up-back"
              size={14}
              color={colors.blue}
              accessible={false}
            />
            <Text style={styles.currentLabel}>{currentYear}년</Text>
          </View>
        </Pressable>
      )}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
  },
  navigation: { flexDirection: "row", alignItems: "center", gap: 1 },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: colors.ink },
  current: {
    minWidth: 44,
    minHeight: 44,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
  },
  currentLabel: {
    color: colors.blue,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  action: { marginLeft: "auto", maxWidth: "100%" },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.softBlue,
  },
  dimmed: { opacity: 0.5 },
});
