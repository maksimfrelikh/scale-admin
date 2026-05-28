import type commonRu from '../locales/ru/common.json';
import type authRu from '../locales/ru/auth.json';
import type dashboardRu from '../locales/ru/dashboard.json';
import type navigationRu from '../locales/ru/navigation.json';
import type validationRu from '../locales/ru/validation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof commonRu;
      auth: typeof authRu;
      dashboard: typeof dashboardRu;
      navigation: typeof navigationRu;
      validation: typeof validationRu;
    };
  }
}

export {};
