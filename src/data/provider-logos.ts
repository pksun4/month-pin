import type { ImageSourcePropType } from "react-native";
import type { ProviderCode } from "./providers";

// Keep bundled image imports in the presentation layer, outside DB metadata.
export const PROVIDER_LOGOS = {
  bank_kb: require("../../assets/providers/kb.png"),
  bank_shinhan: require("../../assets/providers/shinhan.png"),
  bank_hana: require("../../assets/providers/hana.png"),
  bank_woori: require("../../assets/providers/woori.png"),
  bank_nh: require("../../assets/providers/nh.png"),
  bank_ibk: require("../../assets/providers/ibk.png"),
  bank_kakao: require("../../assets/providers/kakao.png"),
  bank_kbank: require("../../assets/providers/kbank.png"),
  bank_toss: require("../../assets/providers/toss.png"),
  bank_sc: require("../../assets/providers/sc.png"),
  card_shinhan: require("../../assets/providers/shinhan.png"),
  card_samsung: require("../../assets/providers/samsung.png"),
  card_hyundai: require("../../assets/providers/hyundai.jpg"),
  card_kb: require("../../assets/providers/kb.png"),
  card_lotte: require("../../assets/providers/lotte.png"),
  card_woori: require("../../assets/providers/woori.png"),
  card_hana: require("../../assets/providers/hana.png"),
  card_nh: require("../../assets/providers/nh.png"),
  card_bc: require("../../assets/providers/bc.png"),
} satisfies Record<ProviderCode, ImageSourcePropType>;
