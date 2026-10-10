import { useState } from "react";
import { Alert, Text, View } from "react-native";
import type { Expense } from "../../data/models";
import { useMonthPin } from "../../hooks/use-month-pin";
import { methodLabel, money, monthlyTotal } from "../../utils/expenses";
import { ExpenseRow } from "../../components/expense-row";
import { ExpenseForm } from "../../components/expense-form";
import {
  Button,
  Empty,
  FormModal,
  Header,
  Screen,
  s,
} from "../../components/ui";

export default function ExpensesScreen() {
  const { expenses, methods, deleteExpense, busy } = useMonthPin();
  const [form, setForm] = useState<{ expense?: Expense } | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);

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
      <Screen>
        <Header
          title="고정비"
          description="매달 반복되는 지출을 관리해요"
          action={<Button label="+ 추가" onPress={() => setForm({})} />}
        />
        <View style={s.card}>
          <Text style={s.caption}>월 고정비 · {expenses.length}개</Text>
          <Text style={[s.title, { fontSize: 30 }]}>
            {money(monthlyTotal(expenses))}
          </Text>
        </View>
        {expenses.length ? (
          <View style={s.card}>
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                onPress={() => setSelected(expense)}
              />
            ))}
          </View>
        ) : (
          <Empty
            icon="receipt-outline"
            title="등록된 고정비가 없어요"
            description="오른쪽 위 추가 버튼으로 첫 항목을 등록해 주세요."
          />
        )}
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
              onClose={() => setForm(null)}
            />
          ) : (
            selected && (
              <>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>{selected.name}</Text>
                  <Text style={s.title}>{money(selected.amount)}</Text>
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
