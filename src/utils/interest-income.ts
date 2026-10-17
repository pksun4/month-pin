export const MAX_INTEREST_AMOUNT = 9999999999;
export const MAX_ACCOUNT_ALIAS_LENGTH = 40;

export function validateInterestYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error("연도를 다시 확인해 주세요.");
}

export function validateInterestMonth(year: number, month: number) {
  validateInterestYear(year);
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("월을 다시 확인해 주세요.");
}

export function parseInterestAmount(value: string): number | null {
  const digits = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount <= MAX_INTEREST_AMOUNT
    ? amount
    : null;
}
