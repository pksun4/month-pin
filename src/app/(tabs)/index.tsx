import { AppText as Text } from "../../components/typography";
import { useCallback, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
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
  const { width, fontScale } = useWindowDimensions();
  const heroAmount = loading
    ? "불러오는 중…"
    : error
      ? "확인 필요"
      : money(summary.total);
  // Web Text does not implement native auto-fit. Leave room for full currency
  // text on both platforms, while retaining native fitting as a final guard.
  const amountUnits = Array.from(heroAmount).reduce(
    (units, character) =>
      units +
      (/\d/.test(character) ? 0.64 : /[,\s]/.test(character) ? 0.32 : 1),
    0,
  );
  const amountFontSize = Math.min(
    36,
    // Page padding 22 × 2 and hero padding 20 × 2.
    Math.max(1, Math.min(width || 393, 640) - 84) / (amountUnits * fontScale),
  );
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
      <View style={styles.content}>
        <Header
          title="MonthPin"
          description="매달 나가는 돈을 한눈에"
          titleLeading={<BrandLogo />}
          titleStyle={styles.brandTitle}
        />
        <View style={[s.hero, styles.hero]}>
          <View style={s.between}>
            <Text style={[s.heroLabel, styles.heroLabel]}>
              {now.getMonth() + 1}월 고정비 합계
            </Text>
            <Ionicons
              name="pin-outline"
              size={24}
              color={colors.white}
              style={styles.heroIcon}
              accessible={false}
            />
          </View>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.5}
            style={[
              s.heroAmount,
              styles.heroAmount,
              { fontSize: amountFontSize },
            ]}
          >
            {heroAmount}
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
        <View style={styles.upcomingSection}>
          <View style={styles.sectionHeading}>
            <Text style={[s.sectionTitle, styles.sectionTitle]}>
              다가오는 결제
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.allPaymentsLink}
              onPress={() =>
                router.navigate({
                  pathname: "/expenses",
                  params: { view: "list" },
                })
              }
            >
              <Text style={[s.textLink, styles.linkText]}>전체 보기</Text>
            </Pressable>
          </View>
          {upcoming.length ? (
            <View style={[s.card, styles.upcomingCard]}>
              <View>
                {upcoming.map(({ expense, date }) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    dateLabel={`${date.getMonth() + 1}/${date.getDate()}`}
                    onPress={() => router.navigate("/expenses")}
                  />
                ))}
              </View>
              <Text style={[s.caption, styles.scheduleHint]}>
                등록한 날짜 기준의 예상 일정이에요. 카드 대금 출금일은
                결제수단에서 확인할 수 있어요.
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
        </View>
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, minWidth: 0 },
  hero: { padding: 20, gap: 10 },
  heroLabel: { flex: 1, minWidth: 0, lineHeight: 20 },
  heroIcon: { flexShrink: 0 },
  heroAmount: { maxWidth: "100%", minWidth: 0, fontVariant: ["tabular-nums"] },
  upcomingSection: { gap: 8, minWidth: 0 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: { flex: 1, minWidth: 0 },
  allPaymentsLink: {
    minHeight: 44,
    minWidth: 44,
    maxWidth: "40%",
    justifyContent: "center",
    alignItems: "flex-end",
  },
  linkText: { paddingVertical: 0, textAlign: "right" },
  upcomingCard: { padding: 16, gap: 8 },
  scheduleHint: { marginTop: 0, fontSize: 12, lineHeight: 20 },
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
});
