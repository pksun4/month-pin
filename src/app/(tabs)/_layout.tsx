import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, type IconName } from "../../components/ui";

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
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
