import { AppText as Text } from "./typography";
import type { Ref } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { colors, s, FieldLabel, FieldMessage } from "./ui";

export function FormSegments<Code extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  required,
  error,
  onBlur,
  controlRef,
}: {
  label: string;
  options: readonly { code: Code; label: string }[];
  value: Code | null;
  onChange: (value: Code) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
  controlRef?: Ref<View>;
}) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.4;
  return (
    <View style={s.field}>
      <View style={[styles.row, stacked && styles.stacked]}>
        <FieldLabel
          label={label}
          required={required}
          style={!stacked ? { width: 68 * fontScale } : undefined}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={[
            styles.options,
            stacked && styles.fullWidth,
            !!error && styles.invalid,
          ]}
        >
          {options.map((option, index) => {
            const selected = option.code === value;
            return (
              <Pressable
                ref={
                  index ===
                  Math.max(
                    0,
                    options.findIndex((item) => item.code === value),
                  )
                    ? controlRef
                    : undefined
                }
                key={option.code}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                onBlur={onBlur}
                onPress={() => onChange(option.code)}
                style={({ pressed }) => [
                  styles.touch,
                  (pressed || disabled) && styles.dimmed,
                ]}
              >
                <View style={[styles.segment, selected && styles.selected]}>
                  <Text style={[styles.text, selected && styles.selectedText]}>
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FieldMessage error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  options: { flex: 1, flexDirection: "row", gap: 4 },
  fullWidth: { flex: 0 },
  invalid: {
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 10,
    backgroundColor: colors.softRed,
  },
  touch: { flex: 1, minWidth: 44, minHeight: 44, justifyContent: "center" },
  segment: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  selected: { backgroundColor: colors.softBlue },
  text: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: "500",
  },
  selectedText: { color: colors.blue, fontWeight: "700" },
  dimmed: { opacity: 0.6 },
});
