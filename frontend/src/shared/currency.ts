export const ALLOWED_CURRENCIES = ['RUB'] as const;
export type AllowedCurrency = typeof ALLOWED_CURRENCIES[number];
