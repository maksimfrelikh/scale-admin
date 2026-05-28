import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import i18n, { LOCALE_STORAGE_KEY } from './index';
import { LanguageSwitcher } from './LanguageSwitcher';

function renderSwitcher() {
  return render(
    <I18nextProvider i18n={i18n}>
      <LanguageSwitcher />
    </I18nextProvider>,
  );
}

describe('LanguageSwitcher', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ru');
  });

  afterEach(() => {
    cleanup();
  });

  it('switches language and persists the selection to localStorage', async () => {
    renderSwitcher();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('ru');

    fireEvent.change(select, { target: { value: 'en' } });

    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe('en');
    });
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');

    fireEvent.change(select, { target: { value: 'ru' } });
    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe('ru');
    });
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ru');
  });
});
