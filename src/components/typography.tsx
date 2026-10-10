import { forwardRef } from "react";
import { isLoaded } from "expo-font";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";

export const FONT_ASSETS = {
  "Quicksand-Bold": require("../../assets/fonts/Quicksand-Bold.ttf"),
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

export const AppTextInput = forwardRef<NativeTextInput, TextInputProps>(
  function AppTextInput({ style, ...props }, ref) {
    return (
      <NativeTextInput
        {...props}
        ref={ref}
        style={[style, fontForStyle(style)]}
      />
    );
  },
);
