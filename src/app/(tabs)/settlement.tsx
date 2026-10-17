import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AnnualSummaryView } from "../../components/annual-summary-view";
import { InterestIncomeView } from "../../components/interest-income-view";
import { YearEndTaxView } from "../../components/year-end-tax-view";
import { ListTabs } from "../../components/list-controls";
import { Header, Screen, s } from "../../components/ui";
import {
  SETTLEMENT_VIEWS,
  type SettlementViewCode,
} from "../../data/settlement-types";

export default function SettlementScreen() {
  const [view, setView] = useState<SettlementViewCode>("annual_summary");
  const [year, setYear] = useState(() => new Date().getFullYear());
  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <Header title="결산" description="한 해의 지출과 수입을 돌아봐요" />
        <ListTabs
          label="결산 보기"
          options={SETTLEMENT_VIEWS}
          value={view}
          onChange={setView}
        />
      </View>
      <View
        style={[s.flex, view !== "annual_summary" && styles.hidden]}
        accessibilityElementsHidden={view !== "annual_summary"}
        importantForAccessibility={
          view === "annual_summary" ? "auto" : "no-hide-descendants"
        }
      >
        <AnnualSummaryView
          year={year}
          onYearChange={setYear}
          active={view === "annual_summary"}
        />
      </View>
      <View
        style={[s.flex, view !== "interest_income" && styles.hidden]}
        accessibilityElementsHidden={view !== "interest_income"}
        importantForAccessibility={
          view === "interest_income" ? "auto" : "no-hide-descendants"
        }
      >
        <InterestIncomeView
          year={year}
          onYearChange={setYear}
          active={view === "interest_income"}
        />
      </View>
      <View
        style={[s.flex, view !== "year_end_tax" && styles.hidden]}
        accessibilityElementsHidden={view !== "year_end_tax"}
        importantForAccessibility={
          view === "year_end_tax" ? "auto" : "no-hide-descendants"
        }
      >
        <YearEndTaxView
          year={year}
          onYearChange={setYear}
          active={view === "year_end_tax"}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 12,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  hidden: { display: "none" },
});
