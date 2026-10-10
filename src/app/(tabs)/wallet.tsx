import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import {
  Button,
  Choice,
  colors,
  Empty,
  FormModal,
  Header,
  Screen,
  s,
} from "../../components/ui";

export default function WalletScreen() {
  const { methods, expenses, deleteMethod, busy } = useMonthPin();
  const [kind, setKind] = useState<MethodKind>("bank");
  const [form, setForm] = useState<{ method?: PaymentMethod } | null>(null);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const visible = methods.filter((method) => method.kind === kind);
  const related = selected ? relatedExpenses(selected, methods, expenses) : [];
  const linkedCards =
    selected?.kind === "bank"
      ? methods.filter(
          (method) => method.kind === "card" && method.bankId === selected.id,
        )
      : [];

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
      <Screen>
        <Header
          title="결제수단"
          description="고정비가 나가는 통장과 카드"
          action={<Button label="+ 등록" onPress={() => setForm({})} />}
        />
        <View style={s.row}>
          <View style={s.flex}>
            <Choice
              label={`통장 ${methods.filter((method) => method.kind === "bank").length}`}
              selected={kind === "bank"}
              onPress={() => setKind("bank")}
            />
          </View>
          <View style={s.flex}>
            <Choice
              label={`카드 ${methods.filter((method) => method.kind === "card").length}`}
              selected={kind === "card"}
              onPress={() => setKind("card")}
            />
          </View>
        </View>
        {visible.map((method) => (
          <Pressable
            key={method.id}
            accessibilityRole="button"
            accessibilityLabel={`${methodLabel(method)} 상세보기`}
            onPress={() => setSelected(method)}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.65 }]}
          >
            <View style={s.between}>
              <View style={[s.row, s.flex]}>
                <View style={[s.emptyIcon, { marginBottom: 0 }]}>
                  <Ionicons
                    name={kind === "bank" ? "business-outline" : "card-outline"}
                    size={26}
                    color={colors.blue}
                  />
                </View>
                <View style={s.flex}>
                  <Text style={s.caption}>{method.provider}</Text>
                  <Text style={s.sectionTitle}>{method.name}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </View>
            <View style={s.divider} />
            <View style={s.between}>
              <Text style={s.caption}>연결된 월 고정비</Text>
              <Text style={[s.body, { fontWeight: "700" }]}>
                {money(
                  monthlyTotal(relatedExpenses(method, methods, expenses)),
                )}
              </Text>
            </View>
            {kind === "card" && (
              <Text style={s.caption}>
                출금 통장:{" "}
                {methodLabel(methods.find((bank) => bank.id === method.bankId))}
                {"\n"}대금 출금일:{" "}
                {method.settlementDay
                  ? `매월 ${method.settlementDay}일`
                  : "미지정"}
              </Text>
            )}
          </Pressable>
        ))}
        {!visible.length && (
          <Empty
            icon={kind === "bank" ? "business-outline" : "card-outline"}
            title={`등록된 ${kind === "bank" ? "통장이" : "카드가"} 없어요`}
            description={
              kind === "bank"
                ? "은행과 별명을 입력해 통장을 등록해 주세요."
                : "카드사와 카드 이름을 입력해 등록해 주세요."
            }
            action={
              <Button
                label={kind === "bank" ? "통장 등록" : "카드 등록"}
                onPress={() => setForm({})}
              />
            }
          />
        )}
        <Text style={s.caption}>
          통장별 합계에는 해당 통장에서 대금을 내는 카드의 고정비도 포함돼요.
          홈의 전체 합계는 각 고정비를 한 번씩 계산해요.
        </Text>
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
                  <Text style={s.caption}>{selected.provider}</Text>
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
