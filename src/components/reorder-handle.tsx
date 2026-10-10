import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "./ui";

export interface ReorderControls {
  active: boolean;
  busy: boolean;
  onDrag: () => void;
  onAccessibilityMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function ReorderHandle({
  label,
  reorder,
}: {
  label: string;
  reorder: ReorderControls;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 순서 변경`}
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
        styles.handle,
        reorder.busy && { opacity: 0.4 },
        (pressed || reorder.active) && { backgroundColor: colors.softBlue },
      ]}
    >
      <Ionicons name="reorder-three-outline" size={26} color={colors.blue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
});
