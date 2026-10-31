import { Tabs } from "expo-router";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, type IconName } from "../../components/ui";
import { AppText } from "../../components/typography";
import { useSafeAreaInsets } from "../../components/safe-area";

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
  const { width, fontScale } = useWindowDimensions();
  const labelWidth =
    (width - insets.left - insets.right - 34) / tabs.length - 10;
  const charactersPerLine = Math.max(
    1,
    Math.floor(labelWidth / (11 * fontScale)),
  );
  const labelLines = Math.ceil(
    Math.max(...tabs.map((tab) => tab.title.length)) / charactersPerLine,
  );
  const barHeight = Math.max(64, Math.ceil(48 + 14 * fontScale * labelLines));
  return (
    <View style={styles.container}>
      <Tabs
        safeAreaInsets={{ top: 0, right: 0, bottom: insets.bottom, left: 0 }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.muted,
          tabBarActiveBackgroundColor: "#F0F1F3",
          tabBarLabelPosition: "below-icon",
          tabBarItemStyle: styles.item,
          tabBarStyle: [
            styles.bar,
            {
              height: barHeight,
              marginBottom: Math.max(insets.bottom, 10),
              marginLeft: insets.left + 12,
              marginRight: insets.right + 12,
            },
            Platform.OS === "web" &&
              ({
                marginBottom: "max(10px, env(safe-area-inset-bottom, 0px))",
                marginLeft: "calc(12px + env(safe-area-inset-left, 0px))",
                marginRight: "calc(12px + env(safe-area-inset-right, 0px))",
              } as unknown as ViewStyle),
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
              tabBarLabel: ({ focused }) => (
                <AppText
                  style={[
                    styles.label,
                    { color: focused ? colors.blue : colors.muted },
                  ]}
                >
                  {tab.title}
                </AppText>
              ),
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bar: {
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 4,
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  item: { borderRadius: 999, overflow: "hidden", minHeight: 48 },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
});
