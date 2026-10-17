import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { InterestIncomeEntry } from "../data/models";
import { getProvider } from "../data/providers";
import { money } from "../utils/expenses";
import { ProviderIcon } from "./provider-icon";
import { AppText as Text } from "./typography";
import { colors } from "./ui";

export function InterestIncomeRow({
  entry,
  dateLabel,
  disabled,
  onPress,
}: {
  entry: InterestIncomeEntry;
  dateLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 300;
  const provider = getProvider(entry.providerCode);
  const name = entry.accountAlias.trim() || provider?.name || "통장";
  const amount = (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      style={[styles.amount, stacked && styles.stackedAmount]}
    >
      {money(entry.amount)}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel}, ${name}${provider && provider.name !== name ? `, ${provider.name}` : ""}, ${money(entry.amount)}, 월 내역 수정`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.mainLine}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.date, { width: 44 * fontScale }]}
        >
          {dateLabel}
        </Text>
        <View style={styles.nameGroup}>
          <ProviderIcon code={entry.providerCode} size={18} />
          <Text numberOfLines={stacked ? 2 : 1} style={styles.name}>
            {name}
          </Text>
        </View>
        {!stacked && amount}
      </View>
      {stacked && amount}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, paddingVertical: 4, justifyContent: "center", gap: 2 },
  mainLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  date: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  nameGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  amount: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
    maxWidth: "42%",
    flexShrink: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stackedAmount: { alignSelf: "flex-end", maxWidth: "100%" },
});
