import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MethodKind } from "../data/models";
import { getProvider } from "../data/providers";
import { colors } from "./ui";

export function ProviderIcon({
  code,
  kind,
  size = 36,
}: {
  code: string | null;
  kind: MethodKind;
  size?: number;
}) {
  const provider = getProvider(code);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.icon,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: provider?.background ?? colors.softBlue,
        },
      ]}
    >
      {provider ? (
        <Text
          allowFontScaling={false}
          style={{
            color: provider.color,
            fontSize: size * (provider.mark.length > 2 ? 0.3 : 0.36),
            fontWeight: "800",
          }}
        >
          {provider.mark}
        </Text>
      ) : (
        <Ionicons
          name={kind === "bank" ? "business-outline" : "card-outline"}
          size={size * 0.5}
          color={colors.blue}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
