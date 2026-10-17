import { AppText as Text, AppTextInput as TextInput } from "./typography";
import { useState, type ReactNode, type Ref } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, s, FieldLabel, FieldMessage } from "./ui";

interface SelectOption<Code> {
  code: Code;
  label: string;
  description?: string;
  group?: string;
  icon?: ReactNode;
}
type SelectRow<Code> =
  | { key: string; heading: string }
  | { key: string; option: SelectOption<Code> };

export function FormSelect<Code extends string | number | null>({
  label,
  options,
  value,
  onChange,
  placeholder = "선택해 주세요",
  disabled = false,
  inlineLabel = false,
  required,
  error,
  hint,
  onBlur,
  controlRef,
}: {
  label: string;
  options: readonly SelectOption<Code>[];
  value: Code | null;
  onChange: (value: Code) => void;
  placeholder?: string;
  disabled?: boolean;
  inlineLabel?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  onBlur?: () => void;
  controlRef?: Ref<View>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { fontScale } = useWindowDimensions();
  const inline = inlineLabel && fontScale <= 1.4;
  if (disabled && open) setOpen(false);
  const selected = options.find((option) => option.code === value);
  const search = query.trim().toLocaleLowerCase("ko-KR");
  const filtered = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`
      .toLocaleLowerCase("ko-KR")
      .includes(search),
  );
  const rows: SelectRow<Code>[] = [];
  let previousGroup: string | undefined;
  for (const option of filtered) {
    if (option.group && option.group !== previousGroup)
      rows.push({ key: `group-${option.group}`, heading: option.group });
    rows.push({ key: `option-${option.code ?? "none"}`, option });
    previousGroup = option.group;
  }
  function close() {
    Keyboard.dismiss();
    setOpen(false);
    onBlur?.();
  }
  return (
    <View style={s.field}>
      <View style={inline ? styles.inline : s.field}>
        <FieldLabel
          label={label}
          required={required}
          style={inline ? { width: 68 * fontScale } : undefined}
        />
        <Pressable
          ref={controlRef}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${selected?.label ?? placeholder}${selected?.description ? `, ${selected.description}` : ""}`}
          accessibilityHint={error || "선택 목록을 열어 검색할 수 있어요."}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() => {
            Keyboard.dismiss();
            setQuery("");
            setOpen(true);
          }}
          style={({ pressed }) => [
            s.compactInput,
            inline && styles.inlineTrigger,
            !!error && s.invalidInput,
            (pressed || disabled) && styles.dimmed,
          ]}
        >
          {selected?.icon}
          <Text
            numberOfLines={1}
            style={[styles.value, !selected && styles.placeholder]}
          >
            {selected?.label ?? placeholder}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.muted}
          />
        </Pressable>
      </View>
      <FieldMessage error={error} hint={hint} />
      <Modal
        visible={open && !disabled}
        transparent
        animationType="fade"
        onRequestClose={close}
        supportedOrientations={["portrait", "landscape"]}
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.overlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label} 선택 닫기`}
              style={StyleSheet.absoluteFill}
              onPress={close}
            />
            <KeyboardAvoidingView
              pointerEvents="box-none"
              style={styles.avoidKeyboard}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <View
                accessibilityViewIsModal
                accessibilityLabel={`${label} 선택`}
                onAccessibilityEscape={close}
                style={styles.dialog}
              >
                <View style={styles.header}>
                  <Text style={[s.sectionTitle, s.flex]}>{label} 선택</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 선택 닫기`}
                    onPress={close}
                    style={styles.close}
                  >
                    <Ionicons name="close" size={22} color={colors.ink} />
                  </Pressable>
                </View>
                <View style={styles.search}>
                  <Ionicons
                    name="search-outline"
                    size={18}
                    color={colors.muted}
                  />
                  <TextInput
                    containerStyle={s.flex}
                    accessibilityLabel={`${label} 검색`}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="이름이나 금융기관으로 검색"
                    placeholderTextColor={colors.muted}
                    style={styles.searchInput}
                    maxLength={80}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="done"
                  />
                </View>
                <FlatList
                  data={rows}
                  keyExtractor={(row) => row.key}
                  style={styles.list}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`${label} 선택 목록`}
                  contentContainerStyle={styles.options}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  ListEmptyComponent={
                    <Text style={styles.empty}>검색 결과가 없어요.</Text>
                  }
                  renderItem={({ item }) => {
                    if ("heading" in item)
                      return <Text style={styles.group}>{item.heading}</Text>;
                    const { option } = item;
                    const checked = option.code === value;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityLabel={`${option.label}${option.description ? `, ${option.description}` : ""}`}
                        accessibilityState={{ checked }}
                        onPress={() => {
                          onChange(option.code);
                          close();
                        }}
                        style={({ pressed }) => [
                          styles.option,
                          checked && styles.selected,
                          pressed && styles.dimmed,
                        ]}
                      >
                        {option.icon}
                        <View style={s.flex}>
                          <Text
                            style={[
                              styles.optionLabel,
                              checked && styles.selectedText,
                            ]}
                          >
                            {option.label}
                          </Text>
                          {option.description && (
                            <Text style={styles.description}>
                              {option.description}
                            </Text>
                          )}
                        </View>
                        <View style={styles.check}>
                          {checked && (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={colors.blue}
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  }}
                />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  inlineTrigger: { flex: 1 },
  value: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 22 },
  placeholder: { color: colors.muted },
  overlay: { flex: 1, backgroundColor: "rgba(32, 36, 56, 0.25)" },
  avoidKeyboard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  dialog: {
    width: "100%",
    maxWidth: 596,
    maxHeight: "80%",
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    flexShrink: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
  },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 44 },
  options: { gap: 2 },
  group: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  option: {
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
  },
  selected: { backgroundColor: colors.softBlue },
  optionLabel: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  selectedText: { color: colors.blue, fontWeight: "600" },
  description: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  check: { width: 18, alignItems: "center" },
  empty: {
    padding: 20,
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
  },
  dimmed: { opacity: 0.6 },
});
