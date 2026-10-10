import { StyleSheet, Text, View } from "react-native";

export function ExpenseDayBadge({ day }: { day: number }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.badge}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={1.2}
        style={styles.label}
      >
        {String(day).padStart(2, "0")}일
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 34,
    height: 24,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#F0F1F4",
  },
  label: {
    color: "#555B69",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
    textAlign: "center",
  },
});
