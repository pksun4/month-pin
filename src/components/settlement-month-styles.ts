import { StyleSheet } from "react-native";
import { colors } from "./theme";

export const settlementMonthStyles = StyleSheet.create({
  section: { gap: 8 },
  grid: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 11,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  amount: {
    maxWidth: "100%",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
});
