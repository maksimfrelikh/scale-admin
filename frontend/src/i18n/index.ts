import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonRu from '../locales/ru/common.json';
import authRu from '../locales/ru/auth.json';
import dashboardRu from '../locales/ru/dashboard.json';
import navigationRu from '../locales/ru/navigation.json';
import validationRu from '../locales/ru/validation.json';

import commonEn from '../locales/en/common.json';
import authEn from '../locales/en/auth.json';
import dashboardEn from '../locales/en/dashboard.json';
import navigationEn from '../locales/en/navigation.json';
import validationEn from '../locales/en/validation.json';

export const SUPPORTED_LOCALES = ['ru', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = 'app.locale';
export const DEFAULT_LOCALE: SupportedLocale = 'ru';

export const I18N_NAMESPACES = ['common', 'auth', 'dashboard', 'navigation', 'validation'] as const;

export const resources = {
  ru: {
    common: commonRu,
    auth: authRu,
    dashboard: dashboardRu,
    navigation: navigationRu,
    validation: validationRu,
  },
  en: {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    navigation: navigationEn,
    validation: validationEn,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    defaultNS: 'common',
    ns: I18N_NAMESPACES as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: true },
  });

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  const base = value.split('-')[0].toLowerCase();
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

export default i18n;
