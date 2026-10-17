import { useState } from "react";
import { View } from "react-native";
import { ExpenseListView } from "../../components/expense-list-view";
import { ExpenseCalendarView } from "../../components/expense-calendar-view";
import { ExpenseViewButton } from "../../components/expense-view-button";
import { s } from "../../components/ui";
import type { ExpenseViewCode } from "../../data/expense-types";
import { useMonthPin } from "../../hooks/use-month-pin";

export default function ExpensesScreen() {
  const [view, setView] = useState<ExpenseViewCode>("calendar");
  const { busy } = useMonthPin();
  const switcher = (
    <ExpenseViewButton value={view} disabled={busy} onChange={setView} />
  );
  return (
    <View style={s.flex}>
      <View
        style={[s.flex, view !== "list" && { display: "none" }]}
        accessibilityElementsHidden={view !== "list"}
        importantForAccessibility={
          view === "list" ? "auto" : "no-hide-descendants"
        }
      >
        <ExpenseListView active={view === "list"} viewSwitcher={switcher} />
      </View>
      <View
        style={[s.flex, view !== "calendar" && { display: "none" }]}
        accessibilityElementsHidden={view !== "calendar"}
        importantForAccessibility={
          view === "calendar" ? "auto" : "no-hide-descendants"
        }
      >
        <ExpenseCalendarView
          active={view === "calendar"}
          viewSwitcher={switcher}
        />
      </View>
    </View>
  );
}
