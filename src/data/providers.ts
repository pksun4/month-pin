import type { MethodKind } from "./models";

// App-owned stable identifiers, not official financial institution codes.
// Keep codes unchanged when updating labels, aliases, or icon styling.
export const BANK_PROVIDERS = [
  {
    code: "bank_kb",
    kind: "bank",
    name: "KB국민은행",
    mark: "KB",
    color: "#695120",
    background: "#FFF2C7",
    aliases: ["국민은행", "KB국민", "국민"],
  },
  {
    code: "bank_shinhan",
    kind: "bank",
    name: "신한은행",
    mark: "신한",
    color: "#2257AF",
    background: "#EAF1FF",
    aliases: ["신한"],
  },
  {
    code: "bank_hana",
    kind: "bank",
    name: "하나은행",
    mark: "하나",
    color: "#007C72",
    background: "#E0F5EF",
    aliases: ["KEB하나은행", "하나"],
  },
  {
    code: "bank_woori",
    kind: "bank",
    name: "우리은행",
    mark: "우리",
    color: "#087BB5",
    background: "#E3F3FF",
    aliases: ["우리"],
  },
  {
    code: "bank_nh",
    kind: "bank",
    name: "NH농협은행",
    mark: "NH",
    color: "#277C38",
    background: "#E9F5DF",
    aliases: ["농협은행", "NH농협"],
  },
  {
    code: "bank_ibk",
    kind: "bank",
    name: "IBK기업은행",
    mark: "IBK",
    color: "#185A9B",
    background: "#E7F0FC",
    aliases: ["기업은행", "IBK기업", "기업"],
  },
  {
    code: "bank_kakao",
    kind: "bank",
    name: "카카오뱅크",
    mark: "k",
    color: "#423B19",
    background: "#FFF5AD",
    aliases: ["카카오은행", "카카오"],
  },
  {
    code: "bank_kbank",
    kind: "bank",
    name: "케이뱅크",
    mark: "K",
    color: "#263264",
    background: "#E8EBF8",
    aliases: ["K뱅크", "Kbank"],
  },
  {
    code: "bank_toss",
    kind: "bank",
    name: "토스뱅크",
    mark: "토스",
    color: "#2864D8",
    background: "#EAF1FF",
    aliases: ["토스은행", "토스"],
  },
  {
    code: "bank_sc",
    kind: "bank",
    name: "SC제일은행",
    mark: "SC",
    color: "#087E60",
    background: "#E0F5EE",
    aliases: ["제일은행", "SC은행", "SC제일"],
  },
] as const;
export const CARD_PROVIDERS = [
  {
    code: "card_shinhan",
    kind: "card",
    name: "신한카드",
    mark: "신한",
    color: "#2257AF",
    background: "#EAF1FF",
    aliases: ["신한"],
  },
  {
    code: "card_samsung",
    kind: "card",
    name: "삼성카드",
    mark: "삼성",
    color: "#2257AF",
    background: "#EAF1FF",
    aliases: ["삼성"],
  },
  {
    code: "card_hyundai",
    kind: "card",
    name: "현대카드",
    mark: "현대",
    color: "#30323A",
    background: "#ECEEF2",
    aliases: ["현대"],
  },
  {
    code: "card_kb",
    kind: "card",
    name: "KB국민카드",
    mark: "KB",
    color: "#695120",
    background: "#FFF2C7",
    aliases: ["국민카드", "KB국민", "국민"],
  },
  {
    code: "card_lotte",
    kind: "card",
    name: "롯데카드",
    mark: "롯데",
    color: "#B82838",
    background: "#FFE9ED",
    aliases: ["롯데"],
  },
  {
    code: "card_woori",
    kind: "card",
    name: "우리카드",
    mark: "우리",
    color: "#087BB5",
    background: "#E3F3FF",
    aliases: ["우리"],
  },
  {
    code: "card_hana",
    kind: "card",
    name: "하나카드",
    mark: "하나",
    color: "#007C72",
    background: "#E0F5EF",
    aliases: ["하나", "외환카드"],
  },
  {
    code: "card_nh",
    kind: "card",
    name: "NH농협카드",
    mark: "NH",
    color: "#277C38",
    background: "#E9F5DF",
    aliases: ["농협카드", "NH농협", "NH카드"],
  },
  {
    code: "card_bc",
    kind: "card",
    name: "BC카드",
    mark: "BC",
    color: "#B82838",
    background: "#FFE9ED",
    aliases: ["비씨카드", "비씨", "BC"],
  },
] as const;

export const PROVIDERS = [...BANK_PROVIDERS, ...CARD_PROVIDERS];
export type Provider = (typeof PROVIDERS)[number];
export type ProviderCode = Provider["code"];

export function getProvider(code: string | null | undefined) {
  return PROVIDERS.find((provider) => provider.code === code);
}

export function matchLegacyProvider(kind: MethodKind, name: string) {
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  const normalized = normalize(name);
  return PROVIDERS.find(
    (provider) =>
      provider.kind === kind &&
      [provider.name, ...provider.aliases].some(
        (alias) => normalize(alias) === normalized,
      ),
  );
}
