import { type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LOCALES, isSupportedLocale, normalizeLocale } from './index';

const LOCALE_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  ru: 'Русский',
  en: 'English',
};

const LOCALE_SHORT_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  ru: 'RU',
  en: 'EN',
};

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' } = {}) {
  const { t, i18n } = useTranslation('navigation');
  const currentLocale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isSupportedLocale(next) || next === currentLocale) {
      return;
    }
    void i18n.changeLanguage(next);
  }

  return (
    <label className={`language-switcher language-switcher-${variant}`}>
      <span className="language-switcher-icon" aria-hidden="true">
        {globeIcon()}
      </span>
      <span className="visually-hidden">{t('languageSwitcher.ariaLabel')}</span>
      <select
        aria-label={t('languageSwitcher.ariaLabel')}
        className="language-switcher-select"
        onChange={handleChange}
        value={currentLocale}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {variant === 'compact' ? LOCALE_SHORT_LABELS[locale] : LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}

function globeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" focusable="false" role="presentation">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
