import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  EXPENSE_VIEW_OPTIONS,
  type ExpenseViewCode,
} from "../data/expense-types";
import { colors } from "./ui";

export function ExpenseViewButton({
  value,
  onChange,
  disabled,
}: {
  value: ExpenseViewCode;
  onChange: (value: ExpenseViewCode) => void;
  disabled: boolean;
}) {
  const next = EXPENSE_VIEW_OPTIONS.find((option) => option.code !== value)!;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${next.label}로 보기`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(next.code)}
      style={({ pressed }) => [
        styles.touch,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <View style={styles.icon}>
        <Ionicons name={next.icon} size={20} color={colors.blue} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  touch: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.softBlue,
  },
});
