import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { PaymentMethod } from "../data/models";
import {
  cardTypeLabel,
  cardWithdrawalLabel,
  methodLabel,
  money,
} from "../utils/expenses";
import { ProviderIcon } from "./provider-icon";
import { colors, s } from "./ui";
import { ReorderHandle, type ReorderControls } from "./reorder-handle";

export function PaymentMethodRow({
  method,
  total,
  bank,
  onPress,
  reorder,
}: {
  method: PaymentMethod;
  total: number;
  bank?: PaymentMethod;
  onPress: () => void;
  reorder?: ReorderControls;
}) {
  const withdrawal = cardWithdrawalLabel(method, bank);
  const providerLabel =
    method.kind === "card"
      ? `${method.provider} · ${cardTypeLabel(method)}`
      : method.provider;
  return (
    <View style={[styles.card, reorder?.active && styles.active]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${methodLabel(method)}, 고정 금액 합계 ${money(total)}${method.kind === "card" ? `, ${cardTypeLabel(method)}, ${withdrawal}` : ""}, 상세보기`}
        disabled={Boolean(reorder)}
        accessible={!reorder}
        onPress={onPress}
        style={({ pressed }) => [styles.content, pressed && { opacity: 0.65 }]}
      >
        <View style={styles.main}>
          <ProviderIcon code={method.providerCode} size={40} />
          <View style={s.flex}>
            <Text numberOfLines={1} style={styles.name}>
              {method.name}
            </Text>
            <Text numberOfLines={1} style={styles.provider}>
              {providerLabel}
            </Text>
          </View>
          {!reorder && (
            <>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>고정 합계</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={styles.amount}
                >
                  {money(total)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </>
          )}
        </View>
        {method.kind === "card" && (
          <Text numberOfLines={1} style={styles.withdrawal}>
            {withdrawal}
          </Text>
        )}
      </Pressable>
      {reorder && (
        <ReorderHandle label={methodLabel(method)} reorder={reorder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  content: { flex: 1, gap: 6 },
  main: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.ink },
  provider: { fontSize: 12, lineHeight: 18, color: colors.muted },
  total: { alignItems: "flex-end", maxWidth: "45%", flexShrink: 1 },
  totalLabel: { fontSize: 11, lineHeight: 16, color: colors.muted },
  amount: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    fontWeight: "700",
  },
  withdrawal: { fontSize: 12, lineHeight: 18, color: colors.muted },
  active: {
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
