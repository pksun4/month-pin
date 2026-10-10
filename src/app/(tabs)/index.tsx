import { AppText as Text } from "../../components/typography";
import { useCallback, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { isLoaded } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMonthPin } from "../../hooks/use-month-pin";
import { money, nextChargeDate } from "../../utils/expenses";
import { ledgerSummary, monthKey } from "../../utils/ledger";
import { useLedgerMonth } from "../../hooks/use-ledger-month";
import { ExpenseRow } from "../../components/expense-row";
import { BrandLogo } from "../../components/brand-logo";
import { Button, colors, Empty, Header, Screen, s } from "../../components/ui";

export default function HomeScreen() {
  const { expenses, methods } = useMonthPin();
  const [now, setNow] = useState(() => new Date());
  const { entries, loading, error, retry } = useLedgerMonth(monthKey(now));
  const summary = ledgerSummary(entries);
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout>;
      function updateDate() {
        const current = new Date();
        setNow(current);
        clearTimeout(timer);
        const midnight = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + 1,
        );
        timer = setTimeout(
          updateDate,
          midnight.getTime() - current.getTime() + 50,
        );
      }
      updateDate();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") updateDate();
      });
      return () => {
        clearTimeout(timer);
        listener.remove();
      };
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
      <Header
        title="MonthPin"
        description="매달 나가는 돈을 한눈에"
        titleLeading={<BrandLogo />}
        titleStyle={[
          styles.brandTitle,
          isLoaded("Quicksand-Bold") && styles.brandFont,
        ]}
      />
      <View style={s.hero}>
        <View style={s.between}>
          <Text style={s.heroLabel}>{now.getMonth() + 1}월 고정비 합계</Text>
          <Ionicons name="pin-outline" size={24} color={colors.white} />
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={s.heroAmount}>
          {loading
            ? "불러오는 중…"
            : error
              ? "확인 필요"
              : money(summary.total)}
        </Text>
        <Text style={s.heroFooter}>
          {loading || error
            ? "이번 달 캘린더 내역으로 계산해요."
            : `반영 ${summary.count}건 · 결제수단 ${methods.length}개\n고정 금액 + 입력한 변동 금액`}
        </Text>
        {!loading && !error && summary.pending > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingLabel}>
              미입력 {summary.pending}건 · 합계에서 제외
            </Text>
          </View>
        )}
        {error && (
          <>
            <Text accessibilityRole="alert" style={s.heroFooter}>
              {error}
            </Text>
            <Button label="다시 시도" secondary onPress={retry} />
          </>
        )}
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
              dateLabel={`${date.getMonth() + 1}/${date.getDate()}`}
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

const styles = StyleSheet.create({
  pendingBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.softOrange,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.orangeInk,
  },
  brandTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  brandFont: {
    fontFamily: "Quicksand-Bold",
    fontWeight: "normal",
  },
});
