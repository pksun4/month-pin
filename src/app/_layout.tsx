import { AppText as Text, FONT_ASSETS } from "../components/typography";
import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "../components/safe-area";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initializeDatabase } from "../data/database";
import { MonthPinProvider } from "../hooks/use-month-pin";
import { Button, colors, s } from "../components/ui";

class StorageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "MonthPin storage initialization failed",
      error,
      info.componentStack,
    );
  }
  render() {
    if (this.state.failed)
      return (
        <View style={[s.screen, s.center]}>
          <Text style={s.sectionTitle}>저장 공간을 열지 못했어요.</Text>
          <Text style={[s.caption, s.centerText]}>
            앱을 다시 열거나 잠시 후 다시 시도해 주세요.
          </Text>
          <Button
            label="다시 시도"
            onPress={() =>
              this.setState(({ attempt }) => ({
                failed: false,
                attempt: attempt + 1,
              }))
            }
          />
        </View>
      );
    return (
      <View key={this.state.attempt} style={s.flex}>
        {this.props.children}
      </View>
    );
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }
  return (
    <GestureHandlerRootView style={s.flex}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <StorageBoundary>
          <Suspense
            fallback={
              <View style={[s.screen, s.center]}>
                <ActivityIndicator color={colors.blue} />
              </View>
            }
          >
            <SQLiteProvider
              databaseName="month-pin.db"
              onInit={initializeDatabase}
              useSuspense
            >
              <MonthPinProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </MonthPinProvider>
            </SQLiteProvider>
          </Suspense>
        </StorageBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
