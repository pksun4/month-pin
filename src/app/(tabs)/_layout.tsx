import { Tabs } from "expo-router";
import { Platform, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, type IconName } from "../../components/ui";
import { bodyFontStyle } from "../../components/typography";

const tabs: {
  name: string;
  title: string;
  icon: IconName;
  activeIcon: IconName;
}[] = [
  { name: "index", title: "홈", icon: "home-outline", activeIcon: "home" },
  {
    name: "expenses",
    title: "고정비",
    icon: "receipt-outline",
    activeIcon: "receipt",
  },
  {
    name: "wallet",
    title: "결제수단",
    icon: "wallet-outline",
    activeIcon: "wallet",
  },
  {
    name: "settlement",
    title: "결산",
    icon: "pie-chart-outline",
    activeIcon: "pie-chart",
  },
  {
    name: "settings",
    title: "설정",
    icon: "settings-outline",
    activeIcon: "settings",
  },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: [
          {
            backgroundColor: colors.white,
            borderTopColor: colors.line,
            paddingTop: 8,
          },
          Platform.OS === "web" &&
            ({
              // Keep icon + label space independent of the home indicator inset.
              height: "calc(60px + max(8px, env(safe-area-inset-bottom, 0px)))",
              paddingTop: 4,
              paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))",
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            } as unknown as ViewStyle),
        ],
        tabBarLabelStyle: [
          { fontSize: 11, fontWeight: "600" },
          bodyFontStyle("600"),
          Platform.OS === "web" && { lineHeight: 14 },
        ],
        tabBarHideOnKeyboard: true,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.icon}
                color={focused ? colors.blue : colors.muted}
                size={23}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
