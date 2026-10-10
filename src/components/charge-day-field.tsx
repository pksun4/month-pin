import { AppText as Text, AppTextInput as TextInput } from "./typography";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { parseDay } from "../utils/expenses";
import { colors, s } from "./ui";

export function ChargeDayField({
  value,
  onChange,
  disabled,
  label = "결제일",
  optional = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label?: string;
  optional?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.4;
  const invalid =
    (value.length > 0 || (touched && !optional)) && parseDay(value) === null;
  return (
    <View style={s.field}>
      <View style={[styles.row, stacked && styles.stacked]}>
        <Text
          style={[
            s.fieldLabel,
            styles.label,
            !stacked && { width: 68 * fontScale },
          ]}
        >
          {label}
        </Text>
        <View style={styles.controls}>
          <View
            style={[
              s.compactInput,
              { width: 88 * fontScale },
              focused && styles.focused,
              invalid && styles.invalid,
              disabled && styles.dimmed,
            ]}
          >
            <TextInput
              accessibilityLabel={`매월 ${label}`}
              accessibilityHint={
                optional
                  ? "선택 입력이에요. 입력한다면 1일부터 31일까지 입력해 주세요."
                  : "1일부터 31일까지 입력해 주세요."
              }
              accessibilityState={{ disabled }}
              value={value}
              onChangeText={(text) => onChange(text.replace(/\D/g, ""))}
              placeholder="25"
              placeholderTextColor={colors.muted}
              style={[styles.input, { height: 26 * fontScale }]}
              keyboardType="number-pad"
              maxLength={2}
              editable={!disabled}
              selectTextOnFocus
              autoCorrect={false}
              underlineColorAndroid="transparent"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setTouched(true);
              }}
            />
            <View style={[styles.unitSlot, { height: 26 * fontScale }]}>
              <Text style={styles.unit}>일</Text>
            </View>
          </View>
          <Text style={styles.hint}>
            {optional ? "1~31일 · 선택" : "매월 · 1~31일"}
          </Text>
        </View>
      </View>
      {invalid && (
        <Text accessibilityRole="alert" style={styles.error}>
          {label}은 1일부터 31일까지 입력해 주세요.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  label: { lineHeight: 22, includeFontPadding: false },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    color: colors.ink,
    fontSize: 14,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  unitSlot: { justifyContent: "center" },
  unit: {
    color: colors.muted,
    fontSize: 14,
    includeFontPadding: false,
  },
  hint: { flexShrink: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  focused: { borderColor: colors.blue },
  invalid: { borderColor: colors.red },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
  dimmed: { opacity: 0.6 },
});
