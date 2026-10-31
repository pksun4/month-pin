import {
  type ScrollViewInstance,
  type ViewInstance,
  type StyleProp,
  type TextStyle,
  type TextInputInstance as NativeTextInput,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
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
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  safeAreaPadding,
} from "./safe-area";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMonthPin } from "../hooks/use-month-pin";
import { colors } from "./theme";

export { colors } from "./theme";

const FormNavigationContext = createContext<
  ((field: ViewInstance | null, focus?: () => void) => void) | null
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

export type ButtonProps = {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  size?: "regular" | "small";
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  inGroup = false,
  size = "regular",
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps & { inGroup?: boolean }) {
  const labelContent = (
    <Text
      style={[
        s.buttonText,
        size === "small" && s.smallButtonText,
        secondary && { color: colors.muted },
        danger && { color: colors.red },
      ]}
    >
      {label}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        size === "small" ? s.smallButtonTouch : s.button,
        size !== "small" && secondary && s.secondary,
        size !== "small" && danger && s.danger,
        inGroup && s.groupedButton,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {size === "small" ? (
        <View
          style={[s.smallButton, secondary && s.secondary, danger && s.danger]}
        >
          {labelContent}
        </View>
      ) : (
        labelContent
      )}
    </Pressable>
  );
}

export function ButtonGroup({
  actions,
}: {
  actions: readonly (ButtonProps & { code: string })[];
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={s.buttonGroup}>
      {actions.map(({ code, ...action }) => (
        <View
          key={code}
          style={[s.buttonGroupItem, { flexBasis: 80 * fontScale }]}
        >
          <Button {...action} inGroup />
        </View>
      ))}
    </View>
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
      <Text style={[s.sectionTitle, s.centerText]}>{title}</Text>
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
  presentation = "full_screen",
  contentLayout = "form",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  presentation?: "full_screen" | "dialog";
  contentLayout?: "form" | "card";
}) {
  // Keep the native presentation stable when a detail dialog expands into a form.
  const [transparent] = useState(() => presentation === "dialog");
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<ViewInstance>(null);
  function revealField(field: ViewInstance | null, focus?: () => void) {
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
    <Modal
      animationType={transparent ? "fade" : "slide"}
      transparent={transparent}
      onRequestClose={close}
    >
      <SafeAreaProvider>
        {presentation === "dialog" ? (
          <DialogContent
            title={title}
            busy={busy}
            onClose={close}
            contentLayout={contentLayout}
            scrollRef={scrollRef}
            contentRef={contentRef}
            revealField={revealField}
          >
            {children}
          </DialogContent>
        ) : (
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
        )}
      </SafeAreaProvider>
    </Modal>
  );
}

function DialogContent({
  title,
  children,
  onClose,
  busy,
  contentLayout,
  scrollRef,
  contentRef,
  revealField,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  contentLayout: "form" | "card";
  scrollRef: Ref<ScrollViewInstance>;
  contentRef: Ref<ViewInstance>;
  revealField: (field: ViewInstance | null, focus?: () => void) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <View style={s.flex}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} 닫기`}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, s.dialogBackdrop]}
      />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        pointerEvents="box-none"
      >
        <View
          style={[s.dialogOverlay, safeAreaPadding(insets, 22)]}
          pointerEvents="box-none"
        >
          <View
            accessibilityViewIsModal
            accessibilityLabel={title}
            onAccessibilityEscape={onClose}
            style={[
              s.dialog,
              {
                maxHeight: Math.max(
                  0,
                  Math.min(
                    height * 0.8,
                    height - insets.top - insets.bottom - 44,
                  ),
                ),
              },
            ]}
          >
            <View style={[s.modalHeader, s.dialogHeader]}>
              <Text style={[s.sectionTitle, s.flex]}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닫기"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onClose}
                style={({ pressed }) => [
                  s.modalCloseButton,
                  (pressed || busy) && { opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="close"
                  size={26}
                  color={colors.ink}
                  accessible={false}
                />
              </Pressable>
            </View>
            <ScrollView
              ref={scrollRef}
              style={s.dialogScroll}
              contentContainerStyle={s.dialogContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <FormNavigationContext.Provider value={revealField}>
                <View
                  ref={contentRef}
                  collapsable={false}
                  style={[
                    s.formContent,
                    contentLayout === "form" && s.dialogFormContent,
                  ]}
                >
                  {children}
                </View>
              </FormNavigationContext.Provider>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Field({
  label,
  labelLeading,
  inlineLabel = true,
  labelWidth = 96,
  unit,
  unitPlacement = "outside",
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
  labelLeading?: ReactNode;
  inlineLabel?: boolean;
  labelWidth?: number;
  unit?: string;
  unitPlacement?: "inside" | "outside";
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
  const { fontScale } = useWindowDimensions();
  const inline = inlineLabel;
  const inputLabel = `${label}${unit ? ` (${unit})` : ""}${required ? ", 필수" : ""}`;
  return (
    <View style={s.field}>
      <View style={inline ? s.inlineField : s.field}>
        <View
          style={
            inline
              ? [s.inlineFieldLabel, { flexBasis: labelWidth * fontScale }]
              : undefined
          }
        >
          {labelLeading ? (
            <View style={[s.row, inline && s.inlineFieldLabelRow]}>
              {labelLeading}
              <View style={s.flex}>
                <FieldLabel label={label} required={required} />
              </View>
            </View>
          ) : (
            <FieldLabel label={label} required={required} />
          )}
        </View>
        <View
          style={[
            s.fieldControl,
            inline && [s.inlineFieldControl, { flexBasis: 180 * fontScale }],
          ]}
        >
          <TextInput
            ref={controlRef}
            containerStyle={s.flex}
            suffix={unitPlacement === "inside" ? unit : undefined}
            accessibilityLabel={inputLabel}
            accessibilityHint={error || hint}
            accessibilityState={{ disabled }}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={[
              s.input,
              inline && s.inlineFieldInput,
              inline && numeric && s.inlineAmountInput,
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
          {unit && unitPlacement === "outside" && (
            <Text style={s.fieldLabel}>{unit}</Text>
          )}
        </View>
      </View>
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
    backgroundColor: colors.softBlue,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: { backgroundColor: colors.line },
  danger: { backgroundColor: colors.softRed },
  groupedButton: { flexGrow: 1 },
  buttonGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  buttonGroupItem: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 80,
    maxWidth: "100%",
  },
  buttonText: { color: colors.blue, fontSize: 15, fontWeight: "700" },
  smallButtonTouch: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.softBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
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
  dialogOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogBackdrop: {
    backgroundColor: "rgba(32, 36, 56, 0.25)",
  },
  dialog: {
    width: "100%",
    maxWidth: 596,
    alignSelf: "center",
    flexShrink: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: "hidden",
  },
  dialogHeader: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogContent: { width: "100%" },
  dialogFormContent: { padding: 20 },
  field: { gap: 8 },
  inlineField: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 8,
  },
  inlineFieldLabel: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  inlineFieldLabelRow: { gap: 6 },
  fieldControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  inlineFieldControl: { flexGrow: 1, flexShrink: 1 },
  inlineFieldInput: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  inlineAmountInput: { textAlign: "right", fontVariant: ["tabular-nums"] },
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
