import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ReorderableList } from "../../components/reorderable-list";
import type { Expense } from "../../data/models";
import { useMonthPin } from "../../hooks/use-month-pin";
import {
  expenseAmountLabel,
  filterExpenses,
  mergeExpenseOrder,
  methodLabel,
  monthlyTotal,
  sortExpenses,
} from "../../utils/expenses";
import {
  EXPENSE_SORT_OPTIONS,
  EXPENSE_CATEGORY_FILTERS,
  getExpenseCategory,
  getExpenseAmountType,
  type ExpenseSortCode,
  type ExpenseCategoryFilterCode,
} from "../../data/expense-types";
import { ExpenseRow } from "../../components/expense-row";
import { ExpenseForm } from "../../components/expense-form";
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
  colors,
  Empty,
  FormModal,
  Header,
  Screen,
  s,
} from "../../components/ui";

export default function ExpensesScreen() {
  const { expenses, methods, deleteExpense, reorderExpenses, busy } =
    useMonthPin();
  const [form, setForm] = useState<{ expense?: Expense } | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [sortCode, setSortCode] = useState<ExpenseSortCode>("charge_day");
  const [categoryCode, setCategoryCode] =
    useState<ExpenseCategoryFilterCode>("all");
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const savingOrderRef = useRef(false);
  const [pendingOrder, setPendingOrder] = useState<Expense[] | null>(null);
  const locked = busy || dragging || savingOrder;
  const filteredExpenses = useMemo(
    () => filterExpenses(expenses, categoryCode),
    [expenses, categoryCode],
  );
  const categoryLabel = EXPENSE_CATEGORY_FILTERS.find(
    (category) => category.code === categoryCode,
  )?.label;
  const uncategorizedCount = expenses.filter(
    (expense) => expense.categoryCode === null,
  ).length;
  const sortedExpenses = useMemo(
    () => sortExpenses(filteredExpenses, sortCode),
    [filteredExpenses, sortCode],
  );
  const displayed = pendingOrder ?? sortedExpenses;

  useFocusEffect(
    useCallback(() => {
      return () => {
        setReordering(false);
        setDragging(false);
      };
    }, []),
  );

  async function saveOrder(next: Expense[]) {
    if (busy || savingOrderRef.current) return;
    savingOrderRef.current = true;
    setSavingOrder(true);
    setPendingOrder(next);
    try {
      await reorderExpenses(
        mergeExpenseOrder(expenses, next).map((expense) => expense.id),
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

  function remove(expense: Expense) {
    Alert.alert("고정비 삭제", `${expense.name}을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          void deleteExpense(expense.id)
            .then(() => setSelected(null))
            .catch(() =>
              Alert.alert("삭제 실패", "잠시 후 다시 시도해 주세요."),
            );
        },
      },
    ]);
  }

  return (
    <>
      <Screen scrollable={false}>
        <ReorderableList
          reordering={reordering}
          data={displayed}
          extraData={methods}
          keyExtractor={(expense) => `expense-${expense.id}`}
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
          ListHeaderComponent={
            <View style={[listStyles.header, styles.compactHeader]}>
              <Header
                title="고정비"
                description="매달 반복되는 지출을 관리해요"
                action={
                  <RegisterButton
                    accessibilityLabel="고정비 등록"
                    disabled={locked}
                    onPress={() => {
                      setReordering(false);
                      setForm({});
                    }}
                  />
                }
              />
              <ListTabs
                label="고정비 분류"
                options={EXPENSE_CATEGORY_FILTERS}
                value={categoryCode}
                disabled={locked}
                onChange={(code) => {
                  setCategoryCode(code);
                  setReordering(false);
                }}
              />
              <View style={styles.listControls}>
                <ListSummary
                  countLabel={`${categoryLabel} ${filteredExpenses.length}개`}
                  amount={monthlyTotal(filteredExpenses)}
                />
                {filteredExpenses.length > 0 && (
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
                        label="정렬 선택"
                        options={EXPENSE_SORT_OPTIONS}
                        value={sortCode}
                        onChange={setSortCode}
                        disabled={locked}
                        alignment="end"
                      />
                    )}
                    {(filteredExpenses.length > 1 || reordering) && (
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
            </View>
          }
          renderItem={({ item: expense, drag, isActive, getIndex }) => (
            <View style={styles.listItem}>
              <ExpenseRow
                expense={expense}
                onPress={() => setSelected(expense)}
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
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Empty
              icon="receipt-outline"
              title={
                categoryCode === "all"
                  ? "등록된 고정비가 없어요"
                  : `${categoryLabel} 항목이 없어요`
              }
              description={
                categoryCode === "all"
                  ? "오른쪽 위 등록 버튼으로 첫 항목을 등록해 주세요."
                  : `추가하거나 기존 항목의 분류를 ${categoryLabel}(으)로 바꿔 주세요.`
              }
            />
          }
          ListFooterComponent={
            <View style={listStyles.footer}>
              {categoryCode === "all" && uncategorizedCount > 0 && (
                <Text style={listStyles.footerText}>
                  분류가 없는 {uncategorizedCount}개 항목은 수정 화면에서
                  생활·구독을 선택해 주세요.
                </Text>
              )}
              {filteredExpenses.some(
                (expense) => expense.amountTypeCode === "variable",
              ) && (
                <Text style={listStyles.footerText}>
                  변동 항목은 금액 없이 등록되며 고정 합계에 포함되지 않아요.
                </Text>
              )}
            </View>
          }
        />
      </Screen>
      {(form || selected) && (
        <FormModal
          title={
            form
              ? form.expense
                ? "고정비 수정"
                : "고정비 추가"
              : "고정비 상세"
          }
          onClose={() => {
            setForm(null);
            setSelected(null);
          }}
          busy={busy}
        >
          {form ? (
            <ExpenseForm
              key={form.expense?.id ?? "new"}
              expense={form.expense}
              initialCategoryCode={
                categoryCode === "all" ? undefined : categoryCode
              }
              onClose={() => setForm(null)}
            />
          ) : (
            selected && (
              <>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>{selected.name}</Text>
                  <Text style={s.body}>
                    분류 ·{" "}
                    {getExpenseCategory(selected.categoryCode)?.label ??
                      "미분류"}
                  </Text>
                  <Text style={s.body}>
                    금액 유형 ·{" "}
                    {getExpenseAmountType(selected.amountTypeCode)?.label}
                  </Text>
                  <Text style={s.title}>{expenseAmountLabel(selected)}</Text>
                  {selected.amountTypeCode === "variable" && (
                    <Text style={s.caption}>
                      매월 실제 청구액이 달라지는 항목이에요. 기본 금액은
                      저장하지 않아요.
                    </Text>
                  )}
                  <Text style={s.caption}>
                    매월 {selected.chargeDay}일 결제
                  </Text>
                  <Text style={s.body}>
                    {methodLabel(
                      methods.find((method) => method.id === selected.methodId),
                    )}
                  </Text>
                </View>
                <Button
                  label="수정"
                  onPress={() => {
                    setForm({ expense: selected });
                    setSelected(null);
                  }}
                  disabled={busy}
                />
                <Button
                  label="삭제"
                  danger
                  onPress={() => remove(selected)}
                  disabled={busy}
                />
              </>
            )
          )}
        </FormModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  compactHeader: { marginBottom: 4 },
  listControls: { gap: 4 },
  listItem: { backgroundColor: colors.white, paddingHorizontal: 12 },
  separator: { height: 1, backgroundColor: colors.line },
});
