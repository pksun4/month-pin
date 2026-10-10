import { useCallback, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMonthPin } from "../../hooks/use-month-pin";
import { money, monthlyTotal, nextChargeDate } from "../../utils/expenses";
import { ExpenseRow } from "../../components/expense-row";
import { Button, colors, Empty, Header, Screen, s } from "../../components/ui";

export default function HomeScreen() {
  const { expenses, methods } = useMonthPin();
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") setNow(new Date());
      });
      return () => listener.remove();
    }, []),
  );
  const upcoming = expenses
    .map((expense) => ({
      expense,
      date: nextChargeDate(expense.chargeDay, now),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);

  return (
    <Screen>
      <Header title="MonthPin" description="매달 나가는 돈을 한눈에" />
      <View style={s.hero}>
        <View style={s.between}>
          <Text style={s.heroLabel}>
            {now.getMonth() + 1}월 · 월 고정비 합계
          </Text>
          <Ionicons name="pin-outline" size={24} color={colors.white} />
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={s.heroAmount}>
          {money(monthlyTotal(expenses))}
        </Text>
        <Text style={s.heroFooter}>
          고정비 {expenses.length}개 · 결제수단 {methods.length}개{"\n"}등록한
          항목의 월 예상 금액이에요.
        </Text>
      </View>
      <View style={s.between}>
        <Text style={s.sectionTitle}>다가오는 결제</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/expenses")}
        >
          <Text style={s.textLink}>전체 보기</Text>
        </Pressable>
      </View>
      {upcoming.length ? (
        <View style={s.card}>
          {upcoming.map(({ expense, date }) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              dateLabel={`${date.getMonth() + 1}/${date.getDate()} 예정`}
              onPress={() => router.navigate("/expenses")}
            />
          ))}
          <Text style={s.caption}>
            등록한 날짜 기준의 예상 일정이에요. 카드 대금 출금일은 결제수단에서
            확인할 수 있어요.
          </Text>
        </View>
      ) : (
        <Empty
          icon="receipt-outline"
          title="첫 고정비를 등록해 볼까요?"
          description="월세, 구독료, 통신비부터 하나씩 기록해 보세요."
          action={
            <Button
              label="고정비 등록하러 가기"
              onPress={() => router.navigate("/expenses")}
            />
          }
        />
      )}
      {!methods.length && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>어디에서 나가는 돈인가요?</Text>
          <Text style={s.caption}>
            통장과 카드를 등록하면 결제수단별로 고정비를 확인할 수 있어요.
          </Text>
          <Button
            secondary
            label="통장·카드 등록하러 가기"
            onPress={() => router.navigate("/wallet")}
          />
        </View>
      )}
    </Screen>
  );
}
