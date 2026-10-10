import { AppText as Text } from "../../components/typography";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ReorderableList } from "../../components/reorderable-list";
import type { MethodKind, PaymentMethod } from "../../data/models";
import {
  METHOD_KINDS,
  METHOD_SORT_OPTIONS,
  type MethodSortCode,
} from "../../data/method-types";
import { useMonthPin } from "../../hooks/use-month-pin";
import {
  methodLabel,
  cardTypeLabel,
  money,
  monthlyTotal,
  paymentMethodsTotal,
  relatedExpenses,
  sortPaymentMethods,
} from "../../utils/expenses";
import { ExpenseRow } from "../../components/expense-row";
import { MethodForm } from "../../components/method-form";
import { ProviderIcon } from "../../components/provider-icon";
import { PaymentMethodRow } from "../../components/payment-method-row";
import { SelectPopover } from "../../components/select-popover";
import {
  ListTabs,
  ListSummary,
  ListToolbar,
  ListReorderButton,
  RegisterButton,
  listStyles,
} from "../../components/list-controls";
import {
  Button,
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
  const [sortCode, setSortCode] = useState<MethodSortCode>("provider");
  const [form, setForm] = useState<{ method?: PaymentMethod } | null>(null);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const visible = useMemo(
    () => methods.filter((method) => method.kind === kind),
    [methods, kind],
  );
  const sortedMethods = useMemo(
    () => sortPaymentMethods(visible, sortCode, methods, expenses),
    [visible, sortCode, methods, expenses],
  );
  const displayed = pendingOrder ?? sortedMethods;
  const locked = busy || dragging || savingOrder;
  const kindLabel = METHOD_KINDS.find((option) => option.code === kind)?.label;
  const summaryTotal = useMemo(
    () => paymentMethodsTotal(visible, methods, expenses),
    [visible, methods, expenses],
  );
  const related = selected ? relatedExpenses(selected, methods, expenses) : [];
  const linkedCards =
    selected?.kind === "bank"
      ? methods.filter(
          (method) => method.kind === "card" && method.bankId === selected.id,
        )
      : [];

  useFocusEffect(
    useCallback(() => {
      return () => {
        setReordering(false);
        setDragging(false);
      };
    }, []),
  );

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
        <ReorderableList
          key={kind}
          reordering={reordering}
          data={displayed}
          keyExtractor={(method) => `method-${method.id}`}
          containerStyle={s.flex}
          contentContainerStyle={[s.page, listStyles.page]}
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
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            <View style={listStyles.header}>
              <Header
                title="결제수단"
                description="고정비가 나가는 통장과 카드"
                action={
                  <RegisterButton
                    accessibilityLabel="결제수단 등록"
                    disabled={locked}
                    onPress={() => {
                      setReordering(false);
                      setForm({});
                    }}
                  />
                }
              />
              <ListTabs
                label="결제수단 종류"
                options={METHOD_KINDS}
                value={kind}
                onChange={changeKind}
                disabled={locked}
              />
              <ListSummary
                countLabel={`${kindLabel} ${visible.length}개`}
                amount={summaryTotal}
              />
              {visible.length > 0 && (
                <ListToolbar
                  hint={
                    reordering
                      ? savingOrder
                        ? "순서를 저장하고 있어요…"
                        : "손잡이를 잡고 이동하세요."
                      : undefined
                  }
                >
                  {!reordering && (
                    <SelectPopover
                      label="결제수단 정렬 선택"
                      options={METHOD_SORT_OPTIONS}
                      value={sortCode}
                      onChange={setSortCode}
                      disabled={locked}
                      alignment="end"
                    />
                  )}
                  {(visible.length > 1 || reordering) && (
                    <ListReorderButton
                      active={reordering}
                      disabled={locked}
                      onPress={() => {
                        if (!reordering) setSortCode("custom");
                        setReordering((value) => !value);
                      }}
                    />
                  )}
                </ListToolbar>
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
            <View style={listStyles.footer}>
              <Text style={listStyles.footerText}>
                {kind === "bank"
                  ? "통장별 합계에는 해당 통장에서 대금을 내는 카드의 고정비도 포함돼요."
                  : "카드 합계에는 카드로 결제하는 고정비만 포함돼요."}{" "}
                고정 금액만 합산하며 변동 항목은 제외돼요.
              </Text>
            </View>
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
                    <ProviderIcon code={selected.providerCode} />
                    <Text style={s.body}>{selected.provider}</Text>
                  </View>
                  <Text style={s.title}>{selected.name}</Text>
                  <Text style={s.caption}>
                    연결된 월 고정비 · {related.length}개
                  </Text>
                  <Text style={s.title}>{money(monthlyTotal(related))}</Text>
                  <Text style={s.caption}>
                    고정 금액 합계이며 변동 항목은 제외돼요.
                  </Text>
                  {selected.kind === "card" && (
                    <>
                      <Text style={s.body}>
                        카드 종류: {cardTypeLabel(selected)}
                      </Text>
                      <Text style={s.body}>
                        {selected.cardTypeCode === "debit"
                          ? "연결 통장"
                          : "출금 통장"}
                        :{" "}
                        {methodLabel(
                          methods.find((bank) => bank.id === selected.bankId),
                        )}
                      </Text>
                      {selected.cardTypeCode !== "debit" && (
                        <Text style={s.body}>
                          대금 출금일:{" "}
                          {selected.settlementDay
                            ? `매월 ${selected.settlementDay}일`
                            : "미지정"}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                {linkedCards.length > 0 && (
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>이 통장에 연결된 카드</Text>
                    {linkedCards.map((card) => (
                      <Text style={s.body} key={card.id}>
                        {methodLabel(card)} · {cardTypeLabel(card)}
                        {card.cardTypeCode !== "debit" &&
                          ` · ${card.settlementDay ? `${card.settlementDay}일 출금` : "출금일 미지정"}`}
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
