import { forwardRef, useCallback, useRef, useState } from "react";
import { isLoaded } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Pressable,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
  type StyleProp,
  type TextProps,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors } from "./theme";

export const FONT_ASSETS = {
  "Pretendard-Regular": require("../../assets/fonts/Pretendard-Regular.otf"),
  "Pretendard-Medium": require("../../assets/fonts/Pretendard-Medium.otf"),
  "Pretendard-SemiBold": require("../../assets/fonts/Pretendard-SemiBold.otf"),
  "Pretendard-Bold": require("../../assets/fonts/Pretendard-Bold.otf"),
  "Pretendard-ExtraBold": require("../../assets/fonts/Pretendard-ExtraBold.otf"),
};

const BODY_FONT_FAMILIES: Record<string, string> = {
  normal: "Pretendard-Regular",
  "400": "Pretendard-Regular",
  "500": "Pretendard-Medium",
  "600": "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  "700": "Pretendard-Bold",
  "800": "Pretendard-ExtraBold",
};

export function bodyFontStyle(
  weight: TextStyle["fontWeight"] = "400",
): TextStyle | undefined {
  const fontFamily = BODY_FONT_FAMILIES[String(weight)] ?? "Pretendard-Regular";
  // Each static asset already contains its weight; avoid platform faux bold.
  return isLoaded(fontFamily)
    ? { fontFamily, fontWeight: "normal" }
    : undefined;
}

function fontForStyle(style: TextProps["style"]) {
  const flattened = StyleSheet.flatten(style);
  if (flattened?.fontFamily) return undefined;
  return bodyFontStyle(flattened?.fontWeight);
}

export const AppText = forwardRef<NativeText, TextProps>(function AppText(
  { style, ...props },
  ref,
) {
  return (
    <NativeText {...props} ref={ref} style={[style, fontForStyle(style)]} />
  );
});

export type AppTextInputProps = TextInputProps & {
  clearable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  suffix?: string;
};

export const AppTextInput = forwardRef<NativeTextInput, AppTextInputProps>(
  function AppTextInput(
    {
      style,
      containerStyle,
      multiline,
      clearable = !multiline,
      value,
      defaultValue,
      onChangeText,
      clearButtonMode,
      suffix,
      ...props
    },
    ref,
  ) {
    const inputRef = useRef<NativeTextInput | null>(null);
    const [draft, setDraft] = useState(defaultValue ?? "");
    const [suffixWidth, setSuffixWidth] = useState(0);
    const setInputRef = useCallback(
      (input: NativeTextInput | null) => {
        inputRef.current = input;
        const cleanup: unknown =
          typeof ref === "function" ? ref(input) : undefined;
        if (ref && typeof ref !== "function") ref.current = input;
        return () => {
          inputRef.current = null;
          if (typeof cleanup === "function") cleanup();
          else if (typeof ref === "function") ref(null);
          else if (ref) ref.current = null;
        };
      },
      [ref],
    );
    const canClear =
      clearable &&
      props.editable !== false &&
      !props.readOnly &&
      !props.accessibilityState?.disabled &&
      (value === undefined || !!onChangeText);
    const hasValue = (value ?? draft).length > 0;
    const flattened = StyleSheet.flatten(style);
    const endPadding =
      flattened?.paddingRight ??
      flattened?.paddingEnd ??
      flattened?.paddingHorizontal ??
      flattened?.padding ??
      0;
    const label = props.accessibilityLabel ?? props.placeholder ?? "입력 내용";
    const trailingSpace = canClear
      ? Math.max(Number(endPadding) || 0, 44)
      : Number(endPadding) || 0;

    return (
      <View style={[inputStyles.container, containerStyle]}>
        <NativeTextInput
          {...props}
          ref={setInputRef}
          value={value}
          defaultValue={defaultValue}
          multiline={multiline}
          clearButtonMode={clearable ? "never" : clearButtonMode}
          onChangeText={(next) => {
            if (value === undefined) setDraft(next);
            onChangeText?.(next);
          }}
          style={[
            inputStyles.input,
            style,
            (canClear || suffix) && {
              paddingRight:
                trailingSpace +
                (suffix
                  ? (suffixWidth ||
                      (Number(flattened?.fontSize) || 16) * suffix.length) + 4
                  : 0),
            },
            fontForStyle(style),
          ]}
        />
        {suffix && (
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={(event) => setSuffixWidth(event.nativeEvent.layout.width)}
            style={[inputStyles.suffix, { right: trailingSpace }]}
          >
            <AppText
              style={[
                inputStyles.suffixText,
                { fontSize: flattened?.fontSize ?? 16 },
              ]}
            >
              {suffix}
            </AppText>
          </View>
        )}
        {canClear && hasValue && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 지우기`}
            accessibilityHint="입력 내용을 모두 지우고 다시 입력해요."
            onPress={() => {
              if (value === undefined) {
                inputRef.current?.clear();
                setDraft("");
              }
              onChangeText?.("");
              inputRef.current?.focus();
            }}
            style={({ pressed }) => [
              inputStyles.clear,
              pressed && inputStyles.pressed,
            ]}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.muted}
              style={inputStyles.clearIcon}
              accessible={false}
            />
          </Pressable>
        )}
      </View>
    );
  },
);

const inputStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  input: { flex: 1, minWidth: 0 },
  suffix: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  suffixText: { color: colors.ink },
  clear: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // 터치 영역은 유지하고 아이콘만 입력값 쪽으로 4 이동합니다.
  clearIcon: { marginRight: 8 },
  pressed: { opacity: 0.5 },
});
