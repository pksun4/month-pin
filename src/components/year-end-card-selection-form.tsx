import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./typography";
import { Button, colors, FieldMessage, s } from "./ui";
import { ProviderIcon } from "./provider-icon";
import { useMonthPin } from "../hooks/use-month-pin";
import { groupCardMethods } from "../utils/expenses";

export function YearEndCardSelectionForm({
  year,
  selectedIds,
  onClose,
}: {
  year: number;
  selectedIds: readonly number[];
  onClose: () => void;
}) {
  const { methods, busy, saveYearEndTaxCards } = useMonthPin();
  const [ids, setIds] = useState([...selectedIds]);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const cards = methods.filter(
    (method) =>
      method.kind === "card" &&
      (method.cardTypeCode === "credit" || method.cardTypeCode === "debit"),
  );
  const groups = groupCardMethods(cards);
  async function save() {
    if (busy || saving.current) return;
    saving.current = true;
    setError("");
    try {
      await saveYearEndTaxCards(year, ids);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      saving.current = false;
    }
  }
  return (
    <>
      <Text style={s.body}>
        {year}년 연말정산에 포함할 카드를 선택해 주세요.
      </Text>
      <Text style={s.caption}>
        선택을 해제해도 이미 입력한 월별 금액은 유지돼요.
      </Text>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={s.fieldLabel} accessibilityRole="header">
            {group.title}
          </Text>
          {group.data.map((card) => {
            const checked = ids.includes(card.id);
            return (
              <Pressable
                key={card.id}
                accessibilityRole="checkbox"
                accessibilityLabel={`${card.provider} ${card.name}`}
                accessibilityState={{ checked, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  setIds((previous) =>
                    checked
                      ? previous.filter((id) => id !== card.id)
                      : [...previous, card.id],
                  );
                  setError("");
                }}
                style={({ pressed }) => [
                  styles.option,
                  checked && styles.selected,
                  (pressed || busy) && styles.dimmed,
                ]}
              >
                <ProviderIcon code={card.providerCode} />
                <View style={s.flex}>
                  <Text style={styles.name}>{card.name}</Text>
                  <Text style={styles.provider}>{card.provider}</Text>
                </View>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? colors.blue : colors.muted}
                  accessible={false}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
      {!cards.length && (
        <Text style={s.caption}>
          선택할 카드가 없어요. 결제수단에서 카드와 종류를 먼저 등록해 주세요.
        </Text>
      )}
      <FieldMessage error={error} />
      <Button
        label={busy ? "저장 중…" : "저장"}
        disabled={busy}
        onPress={() => void save()}
      />
    </>
  );
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  selected: { backgroundColor: colors.softBlue },
  name: { color: colors.ink, fontSize: 14, lineHeight: 22, fontWeight: "600" },
  provider: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  dimmed: { opacity: 0.5 },
});
