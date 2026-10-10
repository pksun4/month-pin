import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MethodKind } from "../data/models";
import {
  BANK_PROVIDERS,
  CARD_PROVIDERS,
  getProvider,
  type ProviderCode,
} from "../data/providers";
import { ProviderIcon } from "./provider-icon";
import { colors, s } from "./ui";

export function ProviderSelect({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: MethodKind;
  value: ProviderCode | null;
  onChange: (value: ProviderCode) => void;
  disabled?: boolean;
}) {
  const options = kind === "bank" ? BANK_PROVIDERS : CARD_PROVIDERS;
  const selected = getProvider(value);
  const label = kind === "bank" ? "은행" : "카드사";
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 선택, ${selected?.name ?? "미선택"}`}
        accessibilityHint="누르면 선택 목록을 열거나 닫아요."
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setExpanded((open) => !open);
        }}
        style={({ pressed }) => [
          s.input,
          styles.trigger,
          expanded && styles.active,
          (pressed || disabled) && { opacity: 0.6 },
        ]}
      >
        <ProviderIcon code={value} kind={kind} />
        <Text style={[styles.value, !selected && { color: colors.muted }]}>
          {selected?.name ??
            `${kind === "bank" ? "은행을" : "카드사를"} 선택해 주세요`}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
      {expanded && !disabled && (
        <View accessibilityRole="radiogroup" style={styles.menu}>
          {options.map((provider) => (
            <Pressable
              key={provider.code}
              accessibilityRole="radio"
              accessibilityLabel={provider.name}
              accessibilityState={{ checked: value === provider.code }}
              onPress={() => {
                onChange(provider.code);
                setExpanded(false);
              }}
              style={({ pressed }) => [
                styles.option,
                value === provider.code && styles.selected,
                pressed && { opacity: 0.6 },
              ]}
            >
              <ProviderIcon code={provider.code} kind={kind} />
              <Text
                style={[
                  s.body,
                  s.flex,
                  value === provider.code && styles.selectedText,
                ]}
              >
                {provider.name}
              </Text>
              {value === provider.code && (
                <Ionicons name="checkmark" size={20} color={colors.blue} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  active: { borderColor: colors.blue },
  value: { flex: 1, fontSize: 16, color: colors.ink },
  menu: {
    padding: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.white,
    gap: 4,
  },
  option: {
    minHeight: 56,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
  },
  selected: { backgroundColor: colors.softBlue },
  selectedText: { color: colors.blue, fontWeight: "600" },
});
