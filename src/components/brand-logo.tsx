import { Image } from "react-native";
import { colors } from "./ui";

export function BrandLogo({ size = 26 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/brand/symbol.png")}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      tintColor={colors.blue}
      style={{
        width: size * (224 / 256),
        height: size,
        flexShrink: 0,
      }}
    />
  );
}
