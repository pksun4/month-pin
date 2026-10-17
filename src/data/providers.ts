import type { MethodKind } from "./models";

// App-owned stable identifiers, not official financial institution codes.
// Keep codes unchanged when updating labels, aliases, or icon styling.
export const BANK_PROVIDERS = [
  {
    code: "bank_kb",
    kind: "bank",
    name: "KB국민은행",
    sortName: "국민은행",
    aliases: ["국민은행", "KB국민", "국민"],
  },
  {
    code: "bank_shinhan",
    kind: "bank",
    name: "신한은행",
    aliases: ["신한"],
  },
  {
    code: "bank_hana",
    kind: "bank",
    name: "하나은행",
    aliases: ["KEB하나은행", "하나"],
  },
  {
    code: "bank_woori",
    kind: "bank",
    name: "우리은행",
    aliases: ["우리"],
  },
  {
    code: "bank_nh",
    kind: "bank",
    name: "NH농협은행",
    sortName: "농협은행",
    aliases: ["농협은행", "NH농협"],
  },
  {
    code: "bank_ibk",
    kind: "bank",
    name: "IBK기업은행",
    sortName: "기업은행",
    aliases: ["기업은행", "IBK기업", "기업"],
  },
  {
    code: "bank_kakao",
    kind: "bank",
    name: "카카오뱅크",
    aliases: ["카카오은행", "카카오"],
  },
  {
    code: "bank_kbank",
    kind: "bank",
    name: "케이뱅크",
    aliases: ["K뱅크", "Kbank"],
  },
  {
    code: "bank_toss",
    kind: "bank",
    name: "토스뱅크",
    aliases: ["토스은행", "토스"],
  },
  {
    code: "bank_sc",
    kind: "bank",
    name: "SC제일은행",
    sortName: "제일은행",
    aliases: ["제일은행", "SC은행", "SC제일"],
  },
] as const;
export type BankProviderCode = (typeof BANK_PROVIDERS)[number]["code"];
export const CARD_PROVIDERS = [
  {
    code: "card_shinhan",
    kind: "card",
    name: "신한카드",
    aliases: ["신한"],
  },
  {
    code: "card_samsung",
    kind: "card",
    name: "삼성카드",
    aliases: ["삼성"],
  },
  {
    code: "card_hyundai",
    kind: "card",
    name: "현대카드",
    aliases: ["현대"],
  },
  {
    code: "card_kb",
    kind: "card",
    name: "KB국민카드",
    sortName: "국민카드",
    aliases: ["국민카드", "KB국민", "국민"],
  },
  {
    code: "card_lotte",
    kind: "card",
    name: "롯데카드",
    aliases: ["롯데"],
  },
  {
    code: "card_woori",
    kind: "card",
    name: "우리카드",
    aliases: ["우리"],
  },
  {
    code: "card_hana",
    kind: "card",
    name: "하나카드",
    aliases: ["하나", "외환카드"],
  },
  {
    code: "card_nh",
    kind: "card",
    name: "NH농협카드",
    sortName: "농협카드",
    aliases: ["농협카드", "NH농협", "NH카드"],
  },
  {
    code: "card_bc",
    kind: "card",
    name: "BC카드",
    sortName: "비씨카드",
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
