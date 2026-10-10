import { Image, StyleSheet, Text, View } from "react-native";
import { getProvider } from "../data/providers";
import { PROVIDER_LOGOS } from "../data/provider-logos";
import { colors } from "./ui";

export function ProviderIcon({
  code,
  size = 36,
}: {
  code: string | null;
  size?: number;
}) {
  const provider = getProvider(code);
  const logoSize = Math.min((size * 5) / 6, 24);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.logo, { width: size, height: size }]}
    >
      {provider ? (
        <Image
          source={PROVIDER_LOGOS[provider.code]}
          resizeMode="contain"
          style={{ width: logoSize, height: logoSize }}
        />
      ) : (
        <Text allowFontScaling={false} style={styles.placeholder}>
          —
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  placeholder: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
