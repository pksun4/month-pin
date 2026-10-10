import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { PaymentMethod } from "../data/models";
import { methodLabel, money } from "../utils/expenses";
import { ProviderIcon } from "./provider-icon";
import { colors, s } from "./ui";

interface DragHandle {
  active: boolean;
  busy: boolean;
  onDrag: () => void;
  onAccessibilityMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

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
  reorder?: DragHandle;
}) {
  const withdrawal = `${bank ? bank.name : "출금 통장 미지정"} · ${method.settlementDay ? `${method.settlementDay}일 출금` : "출금일 미지정"}`;
  return (
    <View style={[styles.card, reorder?.active && styles.active]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${methodLabel(method)}, 월 고정비 ${money(total)}${method.kind === "card" ? `, ${withdrawal}` : ""}, 상세보기`}
        disabled={Boolean(reorder)}
        accessible={!reorder}
        onPress={onPress}
        style={({ pressed }) => [styles.content, pressed && { opacity: 0.65 }]}
      >
        <View style={styles.main}>
          <ProviderIcon
            code={method.providerCode}
            kind={method.kind}
            size={40}
          />
          <View style={s.flex}>
            <Text numberOfLines={1} style={styles.name}>
              {method.name}
            </Text>
            <Text numberOfLines={1} style={styles.provider}>
              {method.provider}
            </Text>
          </View>
          {!reorder && (
            <>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>월 고정비</Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${methodLabel(method)} 순서 변경`}
          accessibilityHint="손잡이를 잡고 위아래로 이동하세요. 화면 읽기 기능에서는 이동 동작을 선택하세요."
          accessibilityState={{ disabled: reorder.busy }}
          accessibilityActions={[
            ...(reorder.canMoveUp
              ? [{ name: "decrement", label: "위로 이동" }]
              : []),
            ...(reorder.canMoveDown
              ? [{ name: "increment", label: "아래로 이동" }]
              : []),
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (reorder.busy) return;
            if (nativeEvent.actionName === "decrement")
              reorder.onAccessibilityMove(-1);
            if (nativeEvent.actionName === "increment")
              reorder.onAccessibilityMove(1);
          }}
          disabled={reorder.busy}
          onPressIn={reorder.onDrag}
          style={({ pressed }) => [
            styles.dragHandle,
            reorder.busy && { opacity: 0.4 },
            (pressed || reorder.active) && { backgroundColor: colors.softBlue },
          ]}
        >
          <Ionicons
            name="reorder-three-outline"
            size={26}
            color={colors.blue}
          />
        </Pressable>
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
  dragHandle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
});
