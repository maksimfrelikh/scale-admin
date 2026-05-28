export type SupportedLocale = 'ru' | 'en';

export function coerceLocale(value: unknown): SupportedLocale {
  return value === 'en' ? 'en' : 'ru';
}

export function getRequestLocale(headers: Record<string, string | string[] | undefined> | undefined): SupportedLocale {
  const raw = headers?.['x-locale'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return coerceLocale(value);
}
