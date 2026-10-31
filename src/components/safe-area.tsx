import { forwardRef, type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaProvider as NativeSafeAreaProvider,
  SafeAreaView as NativeSafeAreaView,
  type Edge,
  type EdgeInsets,
} from "react-native-safe-area-context";

export { useSafeAreaInsets } from "react-native-safe-area-context";

const edges: Edge[] = ["top", "right", "bottom", "left"];

export function safeAreaPadding(insets: EdgeInsets, extra = 0): ViewStyle {
  return Object.fromEntries(
    edges.map((edge) => [
      `padding${edge[0].toUpperCase()}${edge.slice(1)}`,
      Platform.OS === "web"
        ? `calc(${extra}px + env(safe-area-inset-${edge}, 0px))`
        : extra + insets[edge],
    ]),
  ) as ViewStyle;
}

export function SafeAreaProvider({ children }: { children: ReactNode }) {
  // Router 58 supplies zero web insets; browser CSS owns web safe-area spacing.
  return Platform.OS === "web" ? (
    children
  ) : (
    <NativeSafeAreaProvider>{children}</NativeSafeAreaProvider>
  );
}

export const SafeAreaView = forwardRef<
  ViewInstance,
  ViewProps & { edges?: readonly Edge[] }
>(function SafeAreaView({ style, edges: included = edges, ...props }, ref) {
  if (Platform.OS !== "web")
    return (
      <NativeSafeAreaView {...props} ref={ref} edges={included} style={style} />
    );
  const flat = StyleSheet.flatten(style) ?? {};
  const padding = Object.fromEntries(
    included.map((edge) => {
      const key = `padding${edge[0].toUpperCase()}${edge.slice(1)}` as
        "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft";
      const base =
        flat[key] ??
        (edge === "top" || edge === "bottom"
          ? flat.paddingVertical
          : flat.paddingHorizontal) ??
        flat.padding ??
        0;
      const cssBase = typeof base === "number" ? `${base}px` : base;
      return [key, `calc(${cssBase} + env(safe-area-inset-${edge}, 0px))`];
    }),
  ) as ViewStyle;
  return <View {...props} ref={ref} style={[style, padding]} />;
});
