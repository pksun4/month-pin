import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const webBottomPadding = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          paddingTop: 8,
          ...Platform.select({
            web: {
              // Keep icon + label space independent of the home indicator inset.
              height: 60 + webBottomPadding,
              paddingTop: 4,
              paddingBottom: webBottomPadding,
            },
          }),
        },
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
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.icon}
                color={color}
                size={23}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
