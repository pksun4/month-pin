import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMonthPin } from "../hooks/use-month-pin";

export const colors = {
  bg: "#F6F7FB",
  white: "#FFFFFF",
  ink: "#202438",
  muted: "#717789",
  blue: "#536DFE",
  softBlue: "#EBEEFF",
  line: "#E7EAF2",
  red: "#BE3445",
};
export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Button({
  label,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && s.danger,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && { color: colors.blue },
          danger && { color: colors.red },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useMonthPin();
  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.blue} />
          <Text style={s.caption}>데이터를 불러오고 있어요.</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.caption}>{error}</Text>
          <Button
            label="다시 시도"
            onPress={() => {
              void refresh().catch(() => {});
            }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.page}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export function Header({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.header}>
      <View style={s.flex}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.caption}>{description}</Text>
      </View>
      {action}
    </View>
  );
}

export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.blue} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={[s.caption, s.centerText]}>{description}</Text>
      {action}
    </View>
  );
}

export function FormModal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={s.screen}>
        <View style={s.modalHeader}>
          <Text style={s.sectionTitle}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            disabled={busy}
            onPress={onClose}
            style={s.iconButton}
          >
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={s.page}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
  maxLength = 40,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  numeric?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={s.input}
        keyboardType={numeric ? "number-pad" : "default"}
        maxLength={maxLength}
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        selected && s.choiceActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        color={selected ? colors.blue : colors.muted}
        size={20}
      />
      <Text style={[s.body, s.flex, selected && { color: colors.blue }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  page: {
    padding: 22,
    paddingBottom: 36,
    gap: 20,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    marginBottom: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  caption: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 6 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  hero: {
    backgroundColor: colors.blue,
    borderRadius: 24,
    padding: 24,
    gap: 12,
  },
  heroLabel: { color: "#E9ECFF", fontSize: 14 },
  heroAmount: {
    color: colors.white,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
  },
  heroFooter: { color: "#E9ECFF", fontSize: 13, lineHeight: 21 },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.blue,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: { backgroundColor: colors.softBlue },
  danger: { backgroundColor: "#FFF0F2" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  textLink: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  centerText: { textAlign: "center" },
  empty: {
    backgroundColor: colors.white,
    padding: 26,
    borderRadius: 20,
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    height: 56,
    width: 56,
    borderRadius: 18,
    backgroundColor: colors.softBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalHeader: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  input: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 15,
    fontSize: 16,
    color: colors.ink,
    minHeight: 52,
  },
  choice: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    borderRadius: 13,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 50,
  },
  choiceActive: { borderColor: colors.blue, backgroundColor: colors.softBlue },
  choices: { gap: 8 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  badge: {
    color: colors.blue,
    backgroundColor: colors.softBlue,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 12,
    overflow: "hidden",
  },
});
