import { StyleSheet, View } from "react-native";
import { AppText as Text } from "./typography";
import { colors } from "./ui";

// Labels show each band's upper limit; rates apply only to that slice of income.
const INCOME_TAX_BANDS = [
  { label: "1,400만 이하", range: "1,400만 원 이하", percent: 6 },
  {
    label: "5,000만 이하",
    range: "1,400만 원 초과 5,000만 원 이하",
    percent: 15,
  },
  {
    label: "8,800만 이하",
    range: "5,000만 원 초과 8,800만 원 이하",
    percent: 24,
  },
  {
    label: "1.5억 이하",
    range: "8,800만 원 초과 1억 5,000만 원 이하",
    percent: 35,
  },
  { label: "3억 이하", range: "1억 5,000만 원 초과 3억 원 이하", percent: 38 },
  { label: "5억 이하", range: "3억 원 초과 5억 원 이하", percent: 40 },
  { label: "10억 이하", range: "5억 원 초과 10억 원 이하", percent: 42 },
  { label: "10억 초과", range: "10억 원 초과", percent: 45 },
] as const;

const GENERAL_RATES = [
  { code: "debit", label: "체크카드", percent: 30 },
  { code: "cash_receipt", label: "현금영수증", percent: 30 },
  { code: "credit", label: "신용카드", percent: 15 },
] as const;

export function YearEndTaxGuide() {
  return (
    <View style={styles.content}>
      <View style={styles.section}>
        <View style={styles.heading}>
          <Text style={styles.title}>1. 내 소득세율은?</Text>
          <Text style={styles.caption}>2026년 기준</Text>
        </View>
        <Text style={styles.body}>
          연봉에서 비과세·각종 공제를 뺀{" "}
          <Text style={styles.strong}>‘세금 매길 소득(과세표준)’</Text>으로
          정해져요.
        </Text>
        <View style={styles.bands}>
          {[INCOME_TAX_BANDS.slice(0, 4), INCOME_TAX_BANDS.slice(4)].map(
            (column, index) => (
              <View key={index} style={styles.bandColumn}>
                {column.map((band) => (
                  <View
                    key={band.percent}
                    style={styles.band}
                    accessible
                    accessibilityLabel={`과세표준 ${band.range} 구간의 소득세율 ${band.percent}%`}
                  >
                    <Text style={styles.bandLabel}>{band.label}</Text>
                    <Text style={styles.bandRate}>{band.percent}%</Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
        <Text style={styles.caption}>
          전체에 한 세율을 곱하지 않고, 구간별 금액에 나눠 적용해요.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>2. 결제수단별 소득공제율</Text>
        <Text style={styles.body}>
          세 수단의 공제 대상 사용액 합계가{" "}
          <Text style={styles.strong}>총급여의 25%</Text>를 넘으면, 초과분부터
          계산해요.
        </Text>
        <View style={styles.rates}>
          {GENERAL_RATES.map((rate) => (
            <View
              key={rate.code}
              style={styles.rateRow}
              accessible
              accessibilityLabel={`${rate.label} 소득공제율 ${rate.percent}%`}
            >
              <Text style={styles.body}>{rate.label}</Text>
              <Text style={styles.rateValue}>{rate.percent}%</Text>
            </View>
          ))}
        </View>
        <Text style={styles.caption}>
          일반 사용분 기준 · 전통시장·대중교통 등은 별도예요.
        </Text>
      </View>

      <View style={styles.example}>
        <Text style={styles.title}>3. 현금영수증으로 100만 원을 더 쓰면?</Text>
        <Text style={styles.body}>
          100만 원 × 30% = 세금 매길 소득에서 30만 원 제외
        </Text>
        <Text style={styles.exampleResult}>
          내 소득세율이 15%라면 소득세는 4만 5천 원 줄어요.
        </Text>
        <Text style={styles.caption}>
          30만 원을 돌려받는 뜻은 아니에요. 25% 기준을 넘겼고, 공제 한도가 남아
          있으며 다른 조건은 같다고 가정한 예시예요.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.footer}>
          지방소득세(소득세의 10%)는 별도로 정산해요.
        </Text>
        <Text style={styles.footer}>
          환급은 미리 낸 세금보다 최종 세금이 적을 때 그 차액을 받는 거예요.
          실제 금액은 다른 공제·한도에 따라 달라져요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  section: { gap: 6 },
  heading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  title: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  strong: { fontWeight: "600" },
  caption: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  bands: {
    flexDirection: "row",
    columnGap: 10,
  },
  bandColumn: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 10,
  },
  band: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 4,
  },
  bandLabel: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  bandRate: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  rates: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 26,
    paddingVertical: 2,
  },
  rateValue: {
    color: colors.blue,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  example: {
    backgroundColor: colors.softBlue,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  exampleResult: {
    color: colors.blue,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
