export const MAX_GROSS_SALARY = 9999999999;
export const CARD_SPENDING_TARGET_RATE = 0.25;

export function validateTaxYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error("연도를 다시 확인해 주세요.");
}

export function isValidGrossSalary(amount: number) {
  return (
    Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_GROSS_SALARY
  );
}

export function parseGrossSalary(value: string): number | null {
  const digits = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return isValidGrossSalary(amount) ? amount : null;
}

export function cardSpendingTarget(grossSalary: number | null) {
  return grossSalary === null ? null : grossSalary * CARD_SPENDING_TARGET_RATE;
}
