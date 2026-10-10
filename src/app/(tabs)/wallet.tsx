import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import type { MethodKind, PaymentMethod } from "../../data/models";
import { useMonthPin } from "../../hooks/use-month-pin";
import {
  methodLabel,
  money,
  monthlyTotal,
  relatedExpenses,
} from "../../utils/expenses";
import { ExpenseRow } from "../../components/expense-row";
import { MethodForm } from "../../components/method-form";
import { ProviderIcon } from "../../components/provider-icon";
import { PaymentMethodRow } from "../../components/payment-method-row";
import {
  Button,
  Choice,
  Empty,
  FormModal,
  Header,
  Screen,
  s,
} from "../../components/ui";

export default function WalletScreen() {
  const { methods, expenses, deleteMethod, reorderMethods, busy } =
    useMonthPin();
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const savingOrderRef = useRef(false);
  const [pendingOrder, setPendingOrder] = useState<PaymentMethod[] | null>(
    null,
  );
  const [kind, setKind] = useState<MethodKind>("bank");
  const [form, setForm] = useState<{ method?: PaymentMethod } | null>(null);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const visible = useMemo(
    () => methods.filter((method) => method.kind === kind),
    [methods, kind],
  );
  const displayed = pendingOrder ?? visible;
  const locked = busy || dragging || savingOrder;
  const related = selected ? relatedExpenses(selected, methods, expenses) : [];
  const linkedCards =
    selected?.kind === "bank"
      ? methods.filter(
          (method) => method.kind === "card" && method.bankId === selected.id,
        )
      : [];

  function changeKind(nextKind: MethodKind) {
    if (locked) return;
    setKind(nextKind);
    setReordering(false);
    setPendingOrder(null);
  }

  async function saveOrder(next: PaymentMethod[]) {
    if (busy || savingOrderRef.current) return;
    savingOrderRef.current = true;
    setSavingOrder(true);
    setPendingOrder(next);
    try {
      await reorderMethods(
        kind,
        next.map((method) => method.id),
      );
    } catch {
      Alert.alert("순서 변경 실패", "저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPendingOrder(null);
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  }

  function moveForAccessibility(index: number, direction: -1 | 1) {
    if (locked) return;
    const target = index + direction;
    if (target < 0 || target >= displayed.length) return;
    const next = [...displayed];
    [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next);
  }

  function remove(method: PaymentMethod) {
    Alert.alert(
      "결제수단 삭제",
      `${method.name}을 삭제할까요? 연결된 고정비는 유지되고, 결제수단 또는 출금 통장이 미지정으로 바뀌어요.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            void deleteMethod(method.id)
              .then(() => setSelected(null))
              .catch(() =>
                Alert.alert("삭제 실패", "잠시 후 다시 시도해 주세요."),
              );
          },
        },
      ],
    );
  }

  return (
    <>
      <Screen scrollable={false}>
        <DraggableFlatList
          key={kind}
          data={displayed}
          keyExtractor={(method) => `method-${method.id}`}
          containerStyle={s.flex}
          contentContainerStyle={[s.page, { gap: 0 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          activationDistance={6}
          autoscrollThreshold={72}
          autoscrollSpeed={160}
          onDragBegin={() => setDragging(true)}
          onDragEnd={({ data, from, to }) => {
            setDragging(false);
            if (from !== to) void saveOrder(data);
          }}
          renderItem={({ item: method, drag, isActive, getIndex }) => (
            <ScaleDecorator activeScale={1.02}>
              <PaymentMethodRow
                method={method}
                total={monthlyTotal(relatedExpenses(method, methods, expenses))}
                bank={methods.find((bank) => bank.id === method.bankId)}
                onPress={() => setSelected(method)}
                reorder={
                  reordering
                    ? {
                        active: isActive,
                        busy: busy || savingOrder || (dragging && !isActive),
                        onDrag: () => {
                          if (!locked && !savingOrderRef.current) drag();
                        },
                        canMoveUp: (getIndex() ?? 0) > 0,
                        canMoveDown:
                          (getIndex() ?? displayed.length - 1) <
                          displayed.length - 1,
                        onAccessibilityMove: (direction) => {
                          const index = getIndex();
                          if (index !== undefined)
                            moveForAccessibility(index, direction);
                        },
                      }
                    : undefined
                }
              />
            </ScaleDecorator>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            <View style={{ gap: 20, marginBottom: 20 }}>
              <Header
                title="결제수단"
                description="고정비가 나가는 통장과 카드"
                action={
                  <Button
                    label="+ 등록"
                    disabled={locked}
                    onPress={() => {
                      setReordering(false);
                      setForm({});
                    }}
                  />
                }
              />
              <View style={s.row}>
                <View style={s.flex}>
                  <Choice
                    label={`통장 ${methods.filter((method) => method.kind === "bank").length}`}
                    selected={kind === "bank"}
                    disabled={locked}
                    onPress={() => changeKind("bank")}
                  />
                </View>
                <View style={s.flex}>
                  <Choice
                    label={`카드 ${methods.filter((method) => method.kind === "card").length}`}
                    selected={kind === "card"}
                    disabled={locked}
                    onPress={() => changeKind("card")}
                  />
                </View>
              </View>
              {(visible.length > 1 || reordering) && (
                <View style={s.between}>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[s.caption, s.flex, { marginTop: 0 }]}
                  >
                    {reordering
                      ? savingOrder
                        ? "순서를 저장하고 있어요…"
                        : "오른쪽 손잡이를 잡고 이동하세요."
                      : `${kind === "bank" ? "통장" : "카드"} ${visible.length}개`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: locked }}
                    disabled={locked}
                    onPress={() => setReordering((value) => !value)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      justifyContent: "center",
                      opacity: pressed || locked ? 0.5 : 1,
                    })}
                  >
                    <Text style={s.textLink}>
                      {reordering ? "완료" : "순서 변경"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <Empty
              icon={kind === "bank" ? "business-outline" : "card-outline"}
              title={`등록된 ${kind === "bank" ? "통장이" : "카드가"} 없어요`}
              description={
                kind === "bank"
                  ? "은행을 선택하고 별명을 입력해 통장을 등록해 주세요."
                  : "카드사를 선택하고 카드 이름을 입력해 등록해 주세요."
              }
              action={
                <Button
                  label={kind === "bank" ? "통장 등록" : "카드 등록"}
                  disabled={locked}
                  onPress={() => setForm({})}
                />
              }
            />
          }
          ListFooterComponent={
            <Text style={[s.caption, { marginTop: 20 }]}>
              통장별 합계에는 해당 통장에서 대금을 내는 카드의 고정비도
              포함돼요. 홈의 전체 합계는 각 고정비를 한 번씩 계산해요.
            </Text>
          }
        />
      </Screen>
      {(form || selected) && (
        <FormModal
          title={
            form
              ? form.method
                ? "결제수단 수정"
                : "결제수단 등록"
              : "결제수단 상세"
          }
          onClose={() => {
            setForm(null);
            setSelected(null);
          }}
          busy={busy}
        >
          {form ? (
            <MethodForm
              key={form.method?.id ?? "new"}
              method={form.method}
              initialKind={kind}
              onClose={() => setForm(null)}
            />
          ) : (
            selected && (
              <>
                <View style={s.card}>
                  <View style={s.row}>
                    <ProviderIcon
                      code={selected.providerCode}
                      kind={selected.kind}
                    />
                    <Text style={s.body}>{selected.provider}</Text>
                  </View>
                  <Text style={s.title}>{selected.name}</Text>
                  <Text style={s.caption}>
                    연결된 월 고정비 · {related.length}개
                  </Text>
                  <Text style={s.title}>{money(monthlyTotal(related))}</Text>
                  {selected.kind === "card" && (
                    <>
                      <Text style={s.body}>
                        출금 통장:{" "}
                        {methodLabel(
                          methods.find((bank) => bank.id === selected.bankId),
                        )}
                      </Text>
                      <Text style={s.body}>
                        대금 출금일:{" "}
                        {selected.settlementDay
                          ? `매월 ${selected.settlementDay}일`
                          : "미지정"}
                      </Text>
                    </>
                  )}
                </View>
                {linkedCards.length > 0 && (
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>
                      이 통장에서 출금되는 카드
                    </Text>
                    {linkedCards.map((card) => (
                      <Text style={s.body} key={card.id}>
                        {methodLabel(card)} ·{" "}
                        {card.settlementDay
                          ? `${card.settlementDay}일 출금`
                          : "출금일 미지정"}
                      </Text>
                    ))}
                  </View>
                )}
                <View style={s.card}>
                  <Text style={s.sectionTitle}>연결된 고정비</Text>
                  {related.length ? (
                    related.map((expense) => (
                      <ExpenseRow key={expense.id} expense={expense} />
                    ))
                  ) : (
                    <Text style={s.caption}>아직 연결된 고정비가 없어요.</Text>
                  )}
                  <Text style={s.caption}>
                    등록한 고정비의 합계이며 실제 잔액이나 카드 청구 금액은
                    아니에요.
                  </Text>
                </View>
                <Button
                  label="수정"
                  disabled={busy}
                  onPress={() => {
                    setForm({ method: selected });
                    setSelected(null);
                  }}
                />
                <Button
                  label="삭제"
                  danger
                  disabled={busy}
                  onPress={() => remove(selected)}
                />
              </>
            )
          )}
        </FormModal>
      )}
    </>
  );
}
