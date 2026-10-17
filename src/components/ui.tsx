import { AppText as Text, AppTextInput as TextInput } from "./typography";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import type {
  StyleProp,
  TextStyle,
  TextInput as NativeTextInput,
} from "react-native";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMonthPin } from "../hooks/use-month-pin";

export const colors = {
  bg: "#F6F7FB",
  white: "#FFFFFF",
  ink: "#202438",
  muted: "#717789",
  blue: "#536DFE",
  softBlue: "#EBEEFF",
  orange: "#E67824",
  green: "#16835D",
  softOrange: "#FFF0E1",
  orangeInk: "#A54C13",
  line: "#E7EAF2",
  red: "#BE3445",
  softRed: "#FFF1F0",
};

const FormNavigationContext = createContext<
  ((field: View | null, focus?: () => void) => void) | null
>(null);

export function useFormNavigation() {
  return useContext(FormNavigationContext);
}

export function FieldLabel({
  label,
  required,
  style,
}: {
  label: string;
  required?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[s.fieldLabel, style]}
      accessibilityLabel={required ? `${label}, 필수` : label}
    >
      {label}
      {required && <Text style={s.requiredMark}> *</Text>}
    </Text>
  );
}

export function FieldMessage({
  error,
  hint,
}: {
  error?: string;
  hint?: string;
}) {
  if (error)
    return (
      <View
        style={s.fieldErrorRow}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name="alert-circle-outline"
          size={16}
          color={colors.red}
          accessible={false}
        />
        <Text style={s.fieldErrorText}>{error}</Text>
      </View>
    );
  return hint ? <Text style={s.fieldHint}>{hint}</Text> : null;
}
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

export function Screen({
  children,
  scrollable = true,
}: {
  children: ReactNode;
  scrollable?: boolean;
}) {
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
      ) : scrollable ? (
        <ScrollView
          contentContainerStyle={s.page}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function Header({
  title,
  description,
  action,
  titleLeading,
  titleStyle,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  titleLeading?: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={s.header}>
      <View style={s.flex}>
        <View style={s.headerTitle}>
          {titleLeading}
          <Text style={[s.title, s.flex, titleStyle]}>{title}</Text>
        </View>
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
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  function revealField(field: View | null, focus?: () => void) {
    requestAnimationFrame(() => {
      if (!field || !contentRef.current) {
        focus?.();
        return;
      }
      field.measureLayout(
        contentRef.current,
        (_x, y) => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - 12),
            animated: true,
          });
          focus?.();
        },
        () => focus?.(),
      );
    });
  }
  function close() {
    if (busy) return;
    Keyboard.dismiss();
    onClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.modalHeader}>
            <Text style={[s.sectionTitle, s.flex]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [
                s.modalCloseButton,
                (pressed || busy) && { opacity: 0.5 },
              ]}
            >
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
          </View>
          <KeyboardAvoidingView
            style={s.flex}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={s.page}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <FormNavigationContext.Provider value={revealField}>
                <View
                  ref={contentRef}
                  collapsable={false}
                  style={s.formContent}
                >
                  {children}
                </View>
              </FormNavigationContext.Provider>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
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
  required,
  error,
  hint,
  onBlur,
  controlRef,
  disabled = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  numeric?: boolean;
  maxLength?: number;
  required?: boolean;
  error?: string;
  hint?: string;
  onBlur?: () => void;
  controlRef?: Ref<NativeTextInput>;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <FieldLabel label={label} required={required} />
      <TextInput
        ref={controlRef}
        accessibilityLabel={required ? `${label}, 필수` : label}
        accessibilityHint={error || hint}
        accessibilityState={{ disabled }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[
          s.input,
          focused && { borderColor: colors.blue },
          !!error && s.invalidInput,
          disabled && { opacity: 0.6 },
        ]}
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        keyboardType={numeric ? "number-pad" : "default"}
        maxLength={maxLength}
        autoCorrect={false}
        returnKeyType="done"
      />
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

export const s = StyleSheet.create({
  formContent: { gap: 20 },
  requiredMark: { color: colors.red, fontSize: 12 },
  invalidInput: { borderColor: colors.red, backgroundColor: colors.softRed },
  fieldErrorRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  fieldErrorText: { flex: 1, color: colors.red, fontSize: 12, lineHeight: 18 },
  fieldHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
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
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
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
    gap: 12,
    flexShrink: 0,
  },
  modalCloseButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
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
  compactInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
  },
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
