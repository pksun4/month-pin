import { AppText as Text } from "./typography";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ReorderableList } from "./reorderable-list";
import type { Expense } from "../data/models";
import { useMonthPin } from "../hooks/use-month-pin";
import {
  expenseAmountLabel,
  filterExpenses,
  mergeExpenseOrder,
  methodLabel,
  monthlyTotal,
  sortExpenses,
} from "../utils/expenses";
import {
  EXPENSE_SORT_OPTIONS,
  EXPENSE_STATUS_OPTIONS,
  type ExpenseStatusCode,
  EXPENSE_CATEGORY_FILTERS,
  getExpenseCategory,
  getExpenseAmountType,
  type ExpenseSortCode,
  type ExpenseCategoryFilterCode,
} from "../data/expense-types";
import { ExpenseRow } from "./expense-row";
import { ExpenseEndForm } from "./expense-end-form";
import { formatMonth } from "../utils/ledger";
import { ExpenseForm } from "./expense-form";
import { SelectPopover } from "./select-popover";
import {
  ListTabs,
  ListSummary,
  ListToolbar,
  ListReorderButton,
  RegisterButton,
  listStyles,
} from "./list-controls";
import { Button, colors, Empty, FormModal, Header, Screen, s } from "./ui";

export function ExpenseListView({
  active,
  viewSwitcher,
}: {
  active: boolean;
  viewSwitcher: ReactNode;
}) {
  const {
    expenses,
    endedExpenses,
    methods,
    reorderExpenses,
    deleteExpense,
    busy,
  } = useMonthPin();
  const [form, setForm] = useState<{
    expense?: Expense;
    renewal?: Expense;
  } | null>(null);
  const [ending, setEnding] = useState<Expense | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [status, setStatus] = useState<ExpenseStatusCode>("active");
  const sourceExpenses = status === "ended" ? endedExpenses : expenses;
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
    () => filterExpenses(sourceExpenses, categoryCode),
    [sourceExpenses, categoryCode],
  );
  const categoryLabel = EXPENSE_CATEGORY_FILTERS.find(
    (category) => category.code === categoryCode,
  )?.label;
  const uncategorizedCount = sourceExpenses.filter(
    (expense) => expense.categoryCode === null,
  ).length;
  const sortedExpenses = useMemo(
    () => sortExpenses(filteredExpenses, sortCode),
    [filteredExpenses, sortCode],
  );
  const displayed = pendingOrder ?? sortedExpenses;

  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      return () => {
        setReordering(false);
        setDragging(false);
      };
    }, [active]),
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

  function remove(expense: Expense) {
    Alert.alert(
      "고정비 삭제",
      `${expense.name}을 고정비 목록에서 삭제할까요? 기존 캘린더 기록과 직접 입력한 실제 금액은 유지돼요.${expense.endMonth === null ? " 다음 달부터 자동 내역을 제외해요." : ""}`,
      [
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
      ],
    );
  }

  function moveForAccessibility(index: number, direction: -1 | 1) {
    if (locked) return;
    const target = index + direction;
    if (target < 0 || target >= displayed.length) return;
    const next = [...displayed];
    [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next);
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
                  <View style={styles.headerActions}>
                    {viewSwitcher}
                    <RegisterButton
                      accessibilityLabel="고정비 등록"
                      disabled={locked}
                      onPress={() => {
                        setReordering(false);
                        setForm({});
                      }}
                    />
                  </View>
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
                  countLabel={`${status === "ended" ? "종료 · " : ""}${categoryLabel} ${filteredExpenses.length}개`}
                  amount={
                    status === "ended"
                      ? undefined
                      : monthlyTotal(filteredExpenses)
                  }
                />
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
                    <>
                      <SelectPopover
                        label="고정비 상태"
                        options={EXPENSE_STATUS_OPTIONS}
                        value={status}
                        onChange={(value) => {
                          setStatus(value);
                          setReordering(false);
                        }}
                        disabled={locked}
                      />
                      <View style={s.flex} />
                    </>
                  )}
                  {!reordering && filteredExpenses.length > 0 && (
                    <SelectPopover
                      label="정렬 선택"
                      options={EXPENSE_SORT_OPTIONS}
                      value={sortCode}
                      onChange={setSortCode}
                      disabled={locked}
                      alignment="end"
                    />
                  )}
                  {status === "active" &&
                    (filteredExpenses.length > 1 || reordering) && (
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
                status === "ended"
                  ? "종료한 고정비가 없어요"
                  : categoryCode === "all"
                    ? "등록된 고정비가 없어요"
                    : `${categoryLabel} 항목이 없어요`
              }
              description={
                status === "ended"
                  ? "종료한 항목은 여기에서 다시 등록하거나 삭제할 수 있어요."
                  : categoryCode === "all"
                    ? "오른쪽 위 등록 버튼으로 첫 항목을 등록해 주세요."
                    : `추가하거나 기존 항목의 분류를 ${categoryLabel}(으)로 바꿔 주세요.`
              }
            />
          }
          ListFooterComponent={
            <View style={listStyles.footer}>
              {status === "active" &&
                categoryCode === "all" &&
                uncategorizedCount > 0 && (
                  <Text style={listStyles.footerText}>
                    분류가 없는 {uncategorizedCount}개 항목은 수정 화면에서
                    생활·구독을 선택해 주세요.
                  </Text>
                )}
              {status === "ended" && (
                <Text style={listStyles.footerText}>
                  종료한 고정비는 월 합계에서 제외돼요. 기존 캘린더 기록은
                  마지막 반영 월까지 유지해요.
                </Text>
              )}
              {status === "active" &&
                filteredExpenses.some(
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
      {(form || selected || ending) && (
        <FormModal
          title={
            ending
              ? "고정비 종료"
              : form
                ? form.expense
                  ? "고정비 수정"
                  : form.renewal
                    ? "고정비 재등록"
                    : "고정비 추가"
                : "고정비 상세"
          }
          onClose={() => {
            setForm(null);
            setSelected(null);
            setEnding(null);
          }}
          busy={busy}
        >
          {ending ? (
            <ExpenseEndForm expense={ending} onClose={() => setEnding(null)} />
          ) : form ? (
            <ExpenseForm
              key={form.expense?.id ?? `new-${form.renewal?.id ?? "blank"}`}
              expense={form.expense}
              renewal={form.renewal}
              initialCategoryCode={
                categoryCode === "all" ? undefined : categoryCode
              }
              onClose={() => {
                setForm(null);
                if (form.renewal) setStatus("active");
              }}
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
                  {selected.startMonth !== "1000-01" && (
                    <Text style={s.caption}>
                      {formatMonth(selected.startMonth)}부터 반영
                    </Text>
                  )}
                  {selected.endMonth && (
                    <Text style={s.caption}>
                      {formatMonth(selected.endMonth)}까지 반영 · 종료
                    </Text>
                  )}
                  <Text style={s.body}>
                    {methodLabel(
                      methods.find((method) => method.id === selected.methodId),
                    )}
                  </Text>
                </View>
                {selected.endMonth === null ? (
                  <>
                    <Button
                      label="수정"
                      onPress={() => {
                        setForm({ expense: selected });
                        setSelected(null);
                      }}
                      disabled={busy}
                    />
                    <Button
                      label="종료"
                      secondary
                      onPress={() => {
                        setEnding(selected);
                        setSelected(null);
                      }}
                      disabled={busy}
                    />
                  </>
                ) : (
                  <Button
                    label={
                      selected.categoryCode === "subscription"
                        ? "재구독"
                        : "다시 등록"
                    }
                    onPress={() => {
                      setForm({ renewal: selected });
                      setSelected(null);
                    }}
                    disabled={busy || selected.endMonth === "9999-12"}
                  />
                )}
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  compactHeader: { marginBottom: 4 },
  listControls: { gap: 4 },
  listItem: { backgroundColor: colors.white, paddingHorizontal: 12 },
  separator: { height: 1, backgroundColor: colors.line },
});
