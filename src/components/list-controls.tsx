import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { money } from "../utils/expenses";
import { colors } from "./ui";

export function ListTabs<Code extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { code: Code; label: string }[];
  value: Code;
  onChange: (code: Code) => void;
  disabled?: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={styles.tabs}
    >
      {options.map((option) => (
        <Pressable
          key={option.code}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.code, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.code)}
          style={({ pressed }) => [
            styles.tab,
            value === option.code && styles.activeTab,
            (pressed || disabled) && styles.dimmed,
          ]}
        >
          <Text
            style={[
              styles.tabLabel,
              value === option.code && styles.activeTabLabel,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ListSummary({
  countLabel,
  amount,
}: {
  countLabel: string;
  amount: number;
}) {
  return (
    <View style={styles.summary}>
      <Text style={styles.count}>{countLabel}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.summaryAmount}>
        고정 합계 {money(amount)}
      </Text>
    </View>
  );
}

export function RegisterButton({
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.registerTouch,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <View style={styles.registerButton}>
        <Ionicons name="add" size={14} color={colors.blue} />
        <Text style={styles.registerLabel}>등록</Text>
      </View>
    </Pressable>
  );
}

export function ListToolbar({
  hint,
  children,
}: {
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.toolbar}>
      {hint && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.count, styles.hint]}
        >
          {hint}
        </Text>
      )}
      {children}
    </View>
  );
}

export function ListReorderButton({
  active,
  onPress,
  disabled = false,
}: {
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? "순서 변경 완료" : "순서 변경"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.reorderAction,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {active ? (
        <Text style={styles.reorderLabel}>완료</Text>
      ) : (
        <Ionicons
          name="swap-vertical-outline"
          size={18}
          color={colors.muted}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
    </Pressable>
  );
}

export const listStyles = StyleSheet.create({
  page: { gap: 0, paddingTop: 16 },
  header: { gap: 12, marginBottom: 12 },
  footer: { gap: 6, paddingTop: 12 },
  footerText: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 4 },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  activeTab: { backgroundColor: colors.softBlue },
  tabLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.muted,
  },
  activeTabLabel: { color: colors.blue, fontWeight: "700" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: colors.white,
  },
  count: { fontSize: 13, lineHeight: 20, color: colors.muted },
  summaryAmount: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },
  registerTouch: {
    minHeight: 44,
    minWidth: 44,
    flexShrink: 0,
    justifyContent: "center",
  },
  registerButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.softBlue,
  },
  registerLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.blue,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 0,
  },
  hint: { flex: 1 },
  reorderAction: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  reorderLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.blue,
  },
  dimmed: { opacity: 0.5 },
});
