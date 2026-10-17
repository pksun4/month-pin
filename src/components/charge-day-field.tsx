import { AppText as Text, AppTextInput as TextInput } from "./typography";
import { useState, type Ref } from "react";
import type { TextInput as NativeTextInput } from "react-native";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { parseDay } from "../utils/expenses";
import { colors, s, FieldLabel, FieldMessage } from "./ui";

export function ChargeDayField({
  value,
  onChange,
  disabled,
  label = "결제일",
  hint = "매월 · 1~31일",
  required,
  error,
  onBlur,
  controlRef,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
  controlRef?: Ref<NativeTextInput>;
}) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.4;
  const message =
    error ??
    ((value.length > 0 || touched) && parseDay(value) === null
      ? `${label}은 1~31일로 입력해 주세요.`
      : "");
  return (
    <View style={s.field}>
      <View style={[styles.row, stacked && styles.stacked]}>
        <FieldLabel
          label={label}
          required={required}
          style={[
            s.fieldLabel,
            styles.label,
            !stacked && { width: 96 * fontScale },
          ]}
        />
        <View style={styles.controls}>
          <View
            style={[
              s.compactInput,
              styles.inputContainer,
              { width: 132 * fontScale },
              focused && styles.focused,
              !!message && s.invalidInput,
              disabled && styles.dimmed,
            ]}
          >
            <TextInput
              ref={controlRef}
              containerStyle={styles.inputSlot}
              accessibilityLabel={`매월 ${label}`}
              accessibilityHint={message || "1일부터 31일까지 입력해 주세요."}
              accessibilityState={{ disabled }}
              value={value}
              onChangeText={(text) => onChange(text.replace(/\D/g, ""))}
              placeholder="25"
              placeholderTextColor={colors.muted}
              style={[styles.input, { height: 44 * fontScale }]}
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
                onBlur?.();
              }}
            />
            <View style={[styles.unitSlot, { height: 26 * fontScale }]}>
              <Text style={styles.unit}>일</Text>
            </View>
          </View>
        </View>
      </View>
      <FieldMessage error={message} hint={hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  label: { lineHeight: 22, includeFontPadding: false },
  inputContainer: { paddingVertical: 0, maxWidth: "100%" },
  inputSlot: { flex: 1, minWidth: 0 },
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
  focused: { borderColor: colors.blue },
  dimmed: { opacity: 0.6 },
});
