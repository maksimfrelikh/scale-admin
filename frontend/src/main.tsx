import { type ChangeEvent, type FormEvent, type ReactNode, StrictMode, Suspense, useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import { Trans, useTranslation } from 'react-i18next';
import { store } from './app/store';
import './i18n';
import i18n, { normalizeLocale } from './i18n';
import { LanguageSwitcher } from './i18n/LanguageSwitcher';
import {
  backendApi,
  clearProtectedClientState,
  subscribeAuthSessionEvents,
  subscribeStoreListChangedEvents,
  type ApiError,
} from './shared/api/backendApi';
import {
  useAcceptInviteMutation,
  useConfirmPasswordResetMutation,
  useGetCsrfTokenQuery,
  useGetSessionQuery,
  useLoginMutation,
  useLogoutMutation,
  useRequestPasswordResetMutation,
  type AuthUser,
} from './features/auth/authApi';
import {
  useCreateAdvertisingBannerMutation,
  useListAdvertisingBannersQuery,
  useReorderAdvertisingBannersMutation,
  useUpdateAdvertisingBannerStatusMutation,
  useUploadBannerImageMutation,
  type AdvertisingBanner,
  type BannerStatus,
} from './features/advertising/advertisingApi';
import {
  useCreateCatalogCategoryMutation,
  useCreateCatalogPlacementMutation,
  useListCatalogCategoriesQuery,
  useListCatalogPlacementsQuery,
  useMoveCatalogPlacementMutation,
  useReorderCatalogCategoriesMutation,
  useReorderCatalogPlacementsMutation,
  useUpdateCatalogCategoryMutation,
  type CatalogCategory,
  type CatalogProductPlacement,
  type CategoryStatus,
} from './features/catalog/catalogApi';
import {
  useGetAdminDashboardQuery,
  type AdminDashboardLatestSyncError,
  type AdminDashboardProblematicScaleDevice,
} from './features/dashboard/dashboardApi';
import {
  useListGlobalLogsQuery,
  useListStoreLogsQuery,
  type AuditLogEntry,
  type LogsFilters,
  type ScaleSyncLogEntry,
} from './features/logs/logsApi';
import { Pagination, type PaginationMeta } from './shared/pagination/Pagination';
import {
  useListStorePriceCategoriesQuery,
  useListStorePricesQuery,
  useUpdateStoreProductPriceMutation,
  type PriceRow,
} from './features/prices/pricesApi';
import { ALLOWED_CURRENCIES, type AllowedCurrency } from './shared/currency';
import {
  useCreateProductMutation,
  useGetProductQuery,
  useListProductsQuery,
  useUpdateProductMutation,
  useUploadProductImageMutation,
  type Product,
  type ProductFormValues,
  type ProductStatus,
  type ProductUnit,
  type ProductWarning,
} from './features/products/productsApi';
import {
  useGetCatalogVersionsQuery,
  usePublishCatalogMutation,
  useValidateCatalogMutation,
  type CatalogValidationIssue,
  type CatalogValidationResponse,
  type CatalogVersionHistoryItem,
  type PublishCatalogResponse,
} from './features/publishing/publishingApi';
import {
  useCreateScaleDeviceMutation,
  useListScaleDevicesQuery,
  useRegenerateScaleDeviceTokenMutation,
  useUpdateScaleDeviceStatusMutation,
  type ScaleDevice,
  type ScaleDeviceStatus,
} from './features/scales/scalesApi';
import {
  useCreateStoreMutation,
  useGetStoreQuery,
  useListStoresQuery,
  useUpdateStoreMutation,
  type Store,
  type StoreFormValues,
  type StoreStatus,
} from './features/stores/storesApi';
import {
  useBlockUserMutation,
  useChangeUserRoleMutation,
  useCancelInviteMutation,
  useCreateInviteMutation,
  useGrantStoreAccessMutation,
  useListUserStoreAccessesQuery,
  useListUsersQuery,
  useRevokeStoreAccessMutation,
  useUnblockUserMutation,
  type ManagedUser,
} from './features/users/usersApi';
import {
  hashFromView,
  isValidRouteId,
  type DashboardView,
  viewFromHash as dashboardViewFromHash,
} from './routeState';
import './styles.css';

function formatStatusLabel(status: string | null | undefined) {
  if (!status) {
    return '—';
  }
  const t = i18n.getFixedT(null, 'common');
  return (t as (k: string, opts: { defaultValue: string }) => string)(`statuses.${status}`, { defaultValue: status });
}

function formatUnitLabel(unit: string | null | undefined) {
  if (!unit) {
    return '—';
  }
  const t = i18n.getFixedT(null, 'products');
  return (t as (k: string, opts: { defaultValue: string }) => string)(`unit.${unit}`, { defaultValue: unit });
}

function formatSyncStatusLabel(status: string | null | undefined) {
  const key = status ?? 'unknown';
  const t = i18n.getFixedT(null, 'scales');
  return (t as (k: string, opts: { defaultValue: string }) => string)(`syncStatus.${key}`, { defaultValue: key });
}

function LoginScreen({
  notice,
  onForgotPassword,
  onLoginSuccess,
}: {
  notice?: string | null;
  onForgotPassword: () => void;
  onLoginSuccess?: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { data: csrf, isLoading: csrfLoading, error: csrfError, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [login, { isLoading: loginLoading }] = useLoginMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError(t('login.errors.emptyFields'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('login.errors.csrf'));
      return;
    }

    try {
      await login({
        email: trimmedEmail,
        password,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setPassword('');
      onLoginSuccess?.();
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('login.errors.fallback');
      setFormError(message);
    }
  }

  const csrfErrorMessage = csrfError && 'message' in csrfError ? csrfError.message : null;

  return (
    <main className="auth-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="auth-language-row">
          <LanguageSwitcher />
        </div>
        <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
        <h1 id="login-title">{t('login.title')}</h1>
        <p className="description">{t('login.description')}</p>

        {notice && (
          <div className="status status-ok" role="status">
            {notice}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t('login.emailLabel')}
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('login.emailPlaceholder')}
              type="email"
              value={email}
            />
          </label>

          <label>
              {t('login.passwordLabel')}
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              type="password"
              value={password}
            />
          </label>

          {(formError || csrfErrorMessage) && (
            <div className="form-error" role="alert">
              {formError ?? csrfErrorMessage}
            </div>
          )}

          <button type="submit" disabled={csrfLoading || loginLoading}>
            {loginLoading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
        <p className="login-help-note">
          <button className="link-button" type="button" onClick={onForgotPassword}>
            {t('login.forgotPasswordLink')}
          </button>
        </p>
      </section>
    </main>
  );
}

function readAuthTokenFromQuery() {
  return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
}

function removeAuthTokenFromUrl() {
  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has('token')) {
    return;
  }

  currentUrl.searchParams.delete('token');
  const nextSearch = currentUrl.searchParams.toString();
  window.history.replaceState(
    null,
    '',
    currentUrl.pathname + (nextSearch ? '?' + nextSearch : '') + currentUrl.hash,
  );
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(error && typeof error === 'object' && 'status' in error && 'message' in error);
}

function acceptInviteErrorMessage(error: unknown) {
  if (!isApiError(error)) {
    return i18n.t('acceptInvite.errors.fallback', { ns: 'auth' });
  }

  if (error.status === 404) {
    return i18n.t('acceptInvite.errors.linkInvalid', { ns: 'auth' });
  }

  if (error.status === 409) {
    const backendMessage = error.message.toLowerCase();
    if (backendMessage.includes('user with this email already exists') || backendMessage.includes('пользователь с таким email')) {
      return i18n.t('acceptInvite.errors.emailExists', { ns: 'auth' });
    }

    return i18n.t('acceptInvite.errors.alreadyAccepted', { ns: 'auth' });
  }

  if (error.status === 400) {
    const backendMessage = error.message.toLowerCase();
    if (backendMessage.includes('expired') || backendMessage.includes('истёк')) {
      return i18n.t('acceptInvite.errors.expired', { ns: 'auth' });
    }
    if (backendMessage.includes('password') || backendMessage.includes('пароль')) {
      return i18n.t('passwordTooShort', { ns: 'validation' });
    }
    if (backendMessage.includes('token') || backendMessage.includes('токен')) {
      return i18n.t('acceptInvite.errors.missingToken', { ns: 'auth' });
    }
  }

  return error.message;
}

function AcceptInviteScreen({
  onAccepted,
  onBackToLogin,
}: {
  onAccepted: () => void;
  onBackToLogin: () => void;
}) {
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const [inviteToken] = useState(readAuthTokenFromQuery);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { data: csrf, isLoading: csrfLoading, error: csrfError, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [acceptInvite, { isLoading: acceptLoading }] = useAcceptInviteMutation();

  useEffect(removeAuthTokenFromUrl, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!inviteToken) {
      setFormError(t('acceptInvite.errors.missingToken'));
      return;
    }

    if (password.length < 8) {
      setFormError(t('passwordTooShort', { ns: 'validation' }));
      return;
    }

    if (password !== passwordConfirm) {
      setFormError(t('passwordsDoNotMatch', { ns: 'validation' }));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('acceptInvite.errors.csrf'));
      return;
    }

    try {
      await acceptInvite({
        token: inviteToken,
        password,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setPassword('');
      setPasswordConfirm('');
      onAccepted();
    } catch (error) {
      setFormError(acceptInviteErrorMessage(error));
    }
  }

  const csrfErrorMessage = csrfError && 'message' in csrfError ? csrfError.message : null;
  const submitDisabled = csrfLoading || acceptLoading || !inviteToken;

  return (
    <main className="auth-shell">
      <section className="login-card" aria-labelledby="accept-invite-title">
        <div className="auth-language-row">
          <LanguageSwitcher />
        </div>
        <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
        <h1 id="accept-invite-title">{t('acceptInvite.title')}</h1>
        <p className="description">{t('acceptInvite.description')}</p>

        {!inviteToken && (
          <div className="form-error" role="alert">
            {t('acceptInvite.errors.missingToken')}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t('acceptInvite.passwordLabel')}
            <input
              autoComplete="new-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('acceptInvite.passwordPlaceholder')}
              type="password"
              value={password}
            />
          </label>

          <label>
            {t('acceptInvite.passwordConfirmLabel')}
            <input
              autoComplete="new-password"
              name="password-confirm"
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder={t('acceptInvite.passwordConfirmPlaceholder')}
              type="password"
              value={passwordConfirm}
            />
          </label>

          {(formError || csrfErrorMessage) && (
            <div className="form-error" role="alert">
              {formError ?? csrfErrorMessage}
            </div>
          )}

          <button type="submit" disabled={submitDisabled}>
            {acceptLoading ? t('acceptInvite.submitting') : t('acceptInvite.submit')}
          </button>
          <button className="secondary-button" type="button" onClick={onBackToLogin}>
            {t('acceptInvite.backToLogin')}
          </button>
        </form>
      </section>
    </main>
  );
}

function passwordResetRequestErrorMessage(error: unknown) {
  if (!isApiError(error)) {
    return i18n.t('passwordResetRequest.errors.fallback', { ns: 'auth' });
  }

  return error.message;
}

function passwordResetConfirmErrorMessage(error: unknown) {
  if (!isApiError(error)) {
    return i18n.t('passwordResetConfirm.errors.fallback', { ns: 'auth' });
  }

  if (error.status === 409) {
    return i18n.t('passwordResetConfirm.errors.alreadyUsed', { ns: 'auth' });
  }

  if (error.status === 400 || error.status === 404) {
    const backendMessage = error.message.toLowerCase();
    if (backendMessage.includes('expired') || backendMessage.includes('истёк')) {
      return i18n.t('passwordResetConfirm.errors.expired', { ns: 'auth' });
    }
    if (backendMessage.includes('password') || backendMessage.includes('пароль')) {
      return i18n.t('passwordTooShort', { ns: 'validation' });
    }
    if (backendMessage.includes('token') || backendMessage.includes('invalid') || backendMessage.includes('токен') || backendMessage.includes('недействитель')) {
      return i18n.t('passwordResetConfirm.errors.invalidLink', { ns: 'auth' });
    }
  }

  return error.message;
}

function PasswordResetRequestScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { data: csrf, isLoading: csrfLoading, error: csrfError, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [requestPasswordReset, { isLoading: requestLoading }] = useRequestPasswordResetMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitted(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError(t('passwordResetRequest.errors.invalidEmail'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('passwordResetRequest.errors.csrf'));
      return;
    }

    try {
      await requestPasswordReset({
        email: trimmedEmail,
        locale: normalizeLocale(i18n.resolvedLanguage ?? i18n.language),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setSubmitted(true);
    } catch (error) {
      setFormError(passwordResetRequestErrorMessage(error));
    }
  }

  const csrfErrorMessage = csrfError && 'message' in csrfError ? csrfError.message : null;

  return (
    <main className="auth-shell">
      <section className="login-card" aria-labelledby="password-reset-request-title">
        <div className="auth-language-row">
          <LanguageSwitcher />
        </div>
        <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
        <h1 id="password-reset-request-title">{t('passwordResetRequest.title')}</h1>
        <p className="description">{t('passwordResetRequest.description')}</p>

        {submitted && (
          <div className="status status-ok" role="status">
            {t('passwordResetRequest.submittedNotice')}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t('passwordResetRequest.emailLabel')}
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('passwordResetRequest.emailPlaceholder')}
              type="email"
              value={email}
            />
          </label>

          {(formError || csrfErrorMessage) && (
            <div className="form-error" role="alert">
              {formError ?? csrfErrorMessage}
            </div>
          )}

          <button type="submit" disabled={csrfLoading || requestLoading}>
            {requestLoading ? t('passwordResetRequest.submitting') : t('passwordResetRequest.submit')}
          </button>
          <button className="secondary-button" type="button" onClick={onBackToLogin}>
            {t('passwordResetRequest.backToLogin')}
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordResetConfirmScreen({
  onBackToLogin,
  onConfirmed,
}: {
  onBackToLogin: () => void;
  onConfirmed: () => void;
}) {
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const [resetToken] = useState(readAuthTokenFromQuery);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { data: csrf, isLoading: csrfLoading, error: csrfError, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [confirmPasswordReset, { isLoading: confirmLoading }] = useConfirmPasswordResetMutation();

  useEffect(removeAuthTokenFromUrl, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!resetToken) {
      setFormError(t('passwordResetConfirm.errors.missingToken'));
      return;
    }

    if (password.length < 8) {
      setFormError(t('passwordTooShort', { ns: 'validation' }));
      return;
    }

    if (password !== passwordConfirm) {
      setFormError(t('passwordsDoNotMatch', { ns: 'validation' }));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('passwordResetConfirm.errors.csrf'));
      return;
    }

    try {
      await confirmPasswordReset({
        token: resetToken,
        password,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setPassword('');
      setPasswordConfirm('');
      onConfirmed();
    } catch (error) {
      setFormError(passwordResetConfirmErrorMessage(error));
    }
  }

  const csrfErrorMessage = csrfError && 'message' in csrfError ? csrfError.message : null;
  const submitDisabled = csrfLoading || confirmLoading || !resetToken;

  return (
    <main className="auth-shell">
      <section className="login-card" aria-labelledby="password-reset-confirm-title">
        <div className="auth-language-row">
          <LanguageSwitcher />
        </div>
        <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
        <h1 id="password-reset-confirm-title">{t('passwordResetConfirm.title')}</h1>
        <p className="description">{t('passwordResetConfirm.description')}</p>

        {!resetToken && (
          <div className="form-error" role="alert">
            {t('passwordResetConfirm.errors.missingToken')}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {t('passwordResetConfirm.passwordLabel')}
            <input
              autoComplete="new-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordResetConfirm.passwordPlaceholder')}
              type="password"
              value={password}
            />
          </label>

          <label>
            {t('passwordResetConfirm.passwordConfirmLabel')}
            <input
              autoComplete="new-password"
              name="password-confirm"
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder={t('passwordResetConfirm.passwordConfirmPlaceholder')}
              type="password"
              value={passwordConfirm}
            />
          </label>

          {(formError || csrfErrorMessage) && (
            <div className="form-error" role="alert">
              {formError ?? csrfErrorMessage}
            </div>
          )}

          <button type="submit" disabled={submitDisabled}>
            {confirmLoading ? t('passwordResetConfirm.submitting') : t('passwordResetConfirm.submit')}
          </button>
          <button className="secondary-button" type="button" onClick={onBackToLogin}>
            {t('passwordResetConfirm.backToLogin')}
          </button>
        </form>
      </section>
    </main>
  );
}

function Navigation({ user, activeView, onNavigate }: { user: AuthUser; activeView: DashboardView; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('navigation');
  const storesActive = activeView.name.startsWith('store');
  const productsActive = activeView.name.startsWith('product');

  return (
    <nav className="app-nav" aria-label={t('shell.ariaLabel')}>
      <button
        className={activeView.name === 'overview' ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'overview' })}
      >
        {t('items.overview')}
      </button>
      <button
        className={storesActive ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'stores' })}
      >
        {t('items.stores')}
      </button>
      <button
        className={productsActive ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'products' })}
      >
        {t('items.products')}
      </button>
      {user.role === 'admin' ? (
        <>
          <button className="nav-button" type="button" onClick={() => onNavigate({ name: 'store-create' })}>
            {t('items.createStore')}
          </button>
          <button
            className={activeView.name === 'global-logs' ? 'nav-button nav-button-active' : 'nav-button'}
            type="button"
            onClick={() => onNavigate({ name: 'global-logs' })}
          >
            {t('items.globalLogs')}
          </button>
          <button
            className={activeView.name === 'users-access' ? 'nav-button nav-button-active' : 'nav-button'}
            type="button"
            onClick={() => onNavigate({ name: 'users-access' })}
          >
            {t('items.usersAccess')}
          </button>
        </>
      ) : (
        <span className="nav-note">{t('operatorNote')}</span>
      )}
    </nav>
  );
}

function StoresList({ user, onNavigate }: { user: AuthUser; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('stores');
  const { data, error, isLoading, isFetching, refetch } = useListStoresQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });
  const stores = data?.stores ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel" aria-labelledby="stores-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{user.role === 'admin' ? t('list.eyebrow.admin') : t('list.eyebrow.operator')}</p>
          <h2 id="stores-title">{t('list.title')}</h2>
          <p className="muted">
            {user.role === 'admin'
              ? t('list.description.admin')
              : t('list.description.operator')}
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? t('list.refreshing') : t('list.refresh')}
          </button>
          {user.role === 'admin' && (
            <button type="button" onClick={() => onNavigate({ name: 'store-create' })}>
              {t('list.create')}
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="status status-loading">{t('list.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && stores.length === 0 && <div className="empty-state">{t('list.empty')}</div>}

      {stores.length > 0 && (
        <div className="store-list" data-testid="stores-list">
          {stores.map((store) => (
            <article className="store-card" key={store.id}>
              <div>
                <p className="store-code">{store.code}</p>
                <h3>{store.name}</h3>
                <p className="muted">{store.address || t('list.addressMissing')} · {store.timezone}</p>
              </div>
              <div className="store-actions">
                <span className={`badge badge-${store.status}`}>{formatStatusLabel(store.status)}</span>
                <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-details', storeId: store.id })}>
                  {t('list.actions.details')}
                </button>
                {user.role === 'admin' && (
                  <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-edit', storeId: store.id })}>
                    {t('list.actions.edit')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const scaleSyncStatuses: Array<ScaleSyncLogEntry['status']> = ['no_update', 'update_available', 'package_delivered', 'ack_received', 'auth_failed', 'error'];

function LogsFiltersForm({
  filters,
  onChange,
  stores,
  showStoreFilter,
}: {
  filters: LogsFilters;
  onChange: (filters: LogsFilters) => void;
  stores?: Store[];
  showStoreFilter?: boolean;
}) {
  const { t } = useTranslation('logs');
  function setFilter(key: keyof LogsFilters, value: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="logs-filters" aria-label={t('filters.ariaLabel')}>
      {showStoreFilter && (
        <label>
          {t('filters.store')}
          <select value={filters.storeId ?? ''} onChange={(event) => setFilter('storeId', event.target.value)}>
            <option value="">{t('filters.storeAll')}</option>
            {(stores ?? []).map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
          </select>
        </label>
      )}
      <label>
        {t('filters.entityType')}
        <input value={filters.entityType ?? ''} onChange={(event) => setFilter('entityType', event.target.value)} placeholder={t('filters.entityTypePlaceholder')} />
      </label>
      <label>
        {t('filters.action')}
        <input value={filters.action ?? ''} onChange={(event) => setFilter('action', event.target.value)} placeholder={t('filters.actionPlaceholder')} />
      </label>
      <label>
        {t('filters.syncStatus')}
        <select value={filters.status ?? ''} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">{t('filters.statusAny')}</option>
          {scaleSyncStatuses.map((status) => <option key={status} value={status}>{formatSyncStatusLabel(status)}</option>)}
        </select>
      </label>
      <label>
        {t('filters.dateFrom')}
        <input type="date" value={filters.dateFrom ?? ''} onChange={(event) => setFilter('dateFrom', event.target.value)} />
      </label>
      <label>
        {t('filters.dateTo')}
        <input type="date" value={filters.dateTo ?? ''} onChange={(event) => setFilter('dateTo', event.target.value)} />
      </label>
      <button className="secondary-button" type="button" onClick={() => onChange({})}>{t('filters.reset')}</button>
    </div>
  );
}

function LogsTables({
  auditLogs,
  scaleSyncLogs,
  onOffsetChange,
  onLimitChange,
}: {
  auditLogs: { data: AuditLogEntry[]; meta: PaginationMeta };
  scaleSyncLogs: { data: ScaleSyncLogEntry[]; meta: PaginationMeta };
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  const { t } = useTranslation('logs');
  const auditEntries = auditLogs.data;
  const syncEntries = scaleSyncLogs.data;
  return (
    <div className="logs-grid">
      <section className="logs-card" aria-labelledby="audit-logs-title">
        <h4 id="audit-logs-title">{t('tables.audit.title')}</h4>
        <Pagination
          meta={auditLogs.meta}
          onOffsetChange={onOffsetChange}
          onLimitChange={onLimitChange}
          label={t('tables.paginationLabel')}
        />
        {auditEntries.length === 0 ? <div className="empty-state">{t('tables.audit.empty')}</div> : (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr><th>{t('tables.audit.columns.time')}</th><th>{t('tables.audit.columns.store')}</th><th>{t('tables.audit.columns.user')}</th><th>{t('tables.audit.columns.entity')}</th><th>{t('tables.audit.columns.action')}</th></tr>
              </thead>
              <tbody>
                {auditEntries.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.store ? `${log.store.code} · ${log.store.name}` : t('tables.audit.row.allStores')}</td>
                    <td>{log.actor ? (log.actor.fullName || log.actor.email) : t('tables.audit.row.systemActor')}</td>
                    <td><strong>{log.entityType}</strong>{log.entityId ? <span className="muted block">{log.entityId}</span> : null}</td>
                    <td><span className="badge badge-neutral">{log.action}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="logs-card" aria-labelledby="sync-logs-title">
        <h4 id="sync-logs-title">{t('tables.sync.title')}</h4>
        <Pagination
          meta={scaleSyncLogs.meta}
          onOffsetChange={onOffsetChange}
          onLimitChange={onLimitChange}
          label={t('tables.paginationLabel')}
        />
        {syncEntries.length === 0 ? <div className="empty-state">{t('tables.sync.empty')}</div> : (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr><th>{t('tables.sync.columns.time')}</th><th>{t('tables.sync.columns.store')}</th><th>{t('tables.sync.columns.scale')}</th><th>{t('tables.sync.columns.status')}</th><th>{t('tables.sync.columns.versions')}</th></tr>
              </thead>
              <tbody>
                {syncEntries.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.store ? `${log.store.code} · ${log.store.name}` : '—'}</td>
                    <td>{log.scaleDevice ? `${log.scaleDevice.deviceCode} · ${log.scaleDevice.name}` : t('tables.sync.row.unknownScale')}</td>
                    <td><span className={`badge ${log.status === 'error' || log.status === 'auth_failed' ? 'badge-danger' : 'badge-neutral'}`}>{formatSyncStatusLabel(log.status)}</span></td>
                    <td>
                      <span className="muted block">{t('tables.sync.row.requestedVersion', { id: log.requestedVersionId ?? '—' })}</span>
                      <span className="muted block">{t('tables.sync.row.deliveredVersion', { id: log.deliveredVersionId ?? '—' })}</span>
                      {log.errorMessage && <span className="inline-error block">{log.errorMessage}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function GlobalLogsPage({ user }: { user: AuthUser }) {
  const { t } = useTranslation('logs');
  const [filters, setFilters] = useState<LogsFilters>({});
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const handleFiltersChange = (next: LogsFilters) => {
    setFilters(next);
    setOffset(0);
  };
  const handleLimitChange = (next: number) => {
    setLimit(next);
    setOffset(0);
  };
  const { data: storesData } = useListStoresQuery(undefined, { skip: user.role !== 'admin' });
  const { data, error, isLoading, isFetching, refetch } = useListGlobalLogsQuery(
    { ...filters, limit, offset },
    { skip: user.role !== 'admin' },
  );
  const errorMessage = error && 'message' in error ? error.message : null;

  if (user.role !== 'admin') {
    return <AccessDeniedPanel route="global-logs" />;
  }

  return (
    <section className="panel" aria-labelledby="global-logs-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('global.eyebrow')}</p>
          <h2 id="global-logs-title">{t('global.title')}</h2>
          <p className="muted">{t('global.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? t('global.refreshing') : t('global.refresh')}</button>
      </div>
      <LogsFiltersForm filters={filters} onChange={handleFiltersChange} stores={storesData?.stores ?? []} showStoreFilter />
      {isLoading && <div className="status status-loading">{t('global.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {data && (
        <LogsTables
          auditLogs={data.auditLogs}
          scaleSyncLogs={data.scaleSyncLogs}
          onOffsetChange={setOffset}
          onLimitChange={handleLimitChange}
        />
      )}
    </section>
  );
}

function StoreLogsTab({ storeId }: { storeId: string }) {
  const { t } = useTranslation('logs');
  const [filters, setFilters] = useState<LogsFilters>({});
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const handleFiltersChange = (next: LogsFilters) => {
    setFilters(next);
    setOffset(0);
  };
  const handleLimitChange = (next: number) => {
    setLimit(next);
    setOffset(0);
  };
  const { data, error, isLoading, isFetching, refetch } = useListStoreLogsQuery({
    storeId,
    filters: { ...filters, limit, offset },
  });
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="logs-tab" aria-labelledby="store-logs-title">
      <div className="panel-heading logs-heading">
        <div>
          <p className="eyebrow">{t('storeTab.eyebrow')}</p>
          <h3 id="store-logs-title">{t('storeTab.title')}</h3>
          <p className="muted">{t('storeTab.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? t('storeTab.refreshing') : t('storeTab.refresh')}</button>
      </div>
      <LogsFiltersForm filters={filters} onChange={handleFiltersChange} />
      {isLoading && <div className="status status-loading">{t('storeTab.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {data && (
        <LogsTables
          auditLogs={data.auditLogs}
          scaleSyncLogs={data.scaleSyncLogs}
          onOffsetChange={setOffset}
          onLimitChange={handleLimitChange}
        />
      )}
    </section>
  );
}

function StoreDetails({ user, storeId, onNavigate }: { user: AuthUser; storeId: string; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('stores');
  const hasValidStoreId = isValidRouteId(storeId);
  const { currentData, error, isLoading } = useGetStoreQuery(storeId, {
    skip: !hasValidStoreId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });
  const errorMessage = error && 'message' in error ? error.message : null;
  const store = !errorMessage && currentData?.store.id === storeId ? currentData.store : null;
  const { currentData: versionsData, error: versionsError, isLoading: versionsLoading } = useGetCatalogVersionsQuery(storeId, {
    skip: !hasValidStoreId || !store,
  });
  const currentVersion = versionsData?.currentVersion ?? null;
  const versionsErrorMessage = store && versionsError && 'message' in versionsError ? versionsError.message : null;

  if (!hasValidStoreId) {
    return <RouteNotFoundPanel returnTo="stores" messageKey="detailsInvalid" onNavigate={onNavigate} />;
  }

  return (
    <section className="panel store-details-panel" aria-labelledby="store-details-title">
      <button className="link-button" type="button" onClick={() => onNavigate({ name: 'stores' })}>
        {t('details.back')}
      </button>
      {isLoading && <div className="status status-loading">{t('details.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {versionsErrorMessage && <div className="form-error" role="alert">{versionsErrorMessage}</div>}
      {store && (
        <>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t('details.eyebrow')}</p>
              <h2 id="store-details-title">{store.name}</h2>
              <p className="muted">{store.code}</p>
            </div>
            <div className="action-row">
              <span className={`badge badge-${store.status}`}>{formatStatusLabel(store.status)}</span>
              {user.role === 'admin' && (
                <button type="button" onClick={() => onNavigate({ name: 'store-edit', storeId: store.id })}>
                  {t('details.editStore')}
                </button>
              )}
            </div>
          </div>
          <dl className="details-grid">
            <div><dt>{t('details.fields.address')}</dt><dd>{store.address || '—'}</dd></div>
            <div><dt>{t('details.fields.timezone')}</dt><dd>{store.timezone}</dd></div>
            <div><dt>{t('details.fields.publishedCatalog')}</dt><dd>{versionsLoading ? t('details.versionLoading') : formatVersionLabel(currentVersion, t('details.fields.noPublishedVersion'))}</dd></div>
            <div><dt>{t('details.fields.createdAt')}</dt><dd>{new Date(store.createdAt).toLocaleString('ru-RU')}</dd></div>
            <div><dt>{t('details.fields.updatedAt')}</dt><dd>{new Date(store.updatedAt).toLocaleString('ru-RU')}</dd></div>
          </dl>
          <CatalogTab storeId={store.id} />
          <AdvertisingTab storeId={store.id} />
          <ScaleDevicesTab storeId={store.id} userRole={user.role} currentVersionId={currentVersion?.id ?? null} />
          <PricesTab storeId={store.id} />
          <PublishingTab storeId={store.id} userRole={user.role} currentVersion={currentVersion} />
          <StoreLogsTab storeId={store.id} />
        </>
      )}
    </section>
  );
}


type CategoryFormState = {
  name: string;
  shortName: string;
  status: CategoryStatus;
  parentId: string;
};

const emptyCategoryForm = (parentId = ''): CategoryFormState => ({
  name: '',
  shortName: '',
  status: 'active',
  parentId,
});

const bannerStatuses: BannerStatus[] = ['active', 'inactive', 'archived'];
const supportedBannerMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const supportedBannerExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const maxBannerImageBytes = 2 * 1024 * 1024;

function AdvertisingTab({ storeId }: { storeId: string }) {
  const { t } = useTranslation('advertising');
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const handleLimitChange = (next: number) => {
    setLimit(next);
    setOffset(0);
  };
  const { data, error, isLoading, isFetching, refetch } = useListAdvertisingBannersQuery({ storeId, limit, offset });
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [uploadBannerImage, { isLoading: uploading }] = useUploadBannerImageMutation();
  const [createBanner, { isLoading: creating }] = useCreateAdvertisingBannerMutation();
  const [updateStatus, { isLoading: changingStatus }] = useUpdateAdvertisingBannerStatusMutation();
  const [reorderBanners, { isLoading: reordering }] = useReorderAdvertisingBannersMutation();
  const [newStatus, setNewStatus] = useState<BannerStatus>('active');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const banners = data?.data ?? [];
  const bannersMeta = data?.meta ?? { total: 0, limit, offset };
  const busy = uploading || creating || changingStatus || reordering;
  const listError = error && 'message' in error ? error.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error(t('errors.csrf'));
    }
    return csrfData;
  }

  function validateBannerFile(file: File): string | null {
    const filename = file.name.toLowerCase();
    const hasSupportedExtension = supportedBannerExtensions.some((extension) => filename.endsWith(extension));
    const hasSupportedMimeType = file.type === '' || supportedBannerMimeTypes.has(file.type);

    if (!hasSupportedExtension || !hasSupportedMimeType) {
      return t('errors.unsupportedFormat');
    }

    if (file.size > maxBannerImageBytes) {
      return t('errors.fileTooLarge');
    }

    return null;
  }

  async function handleBannerUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setActionError(null);
    setActionNotice(null);

    if (!file) {
      return;
    }

    const validationError = validateBannerFile(file);
    if (validationError) {
      setActionError(validationError);
      return;
    }

    try {
      const csrfData = await getCsrfOrThrow();
      const uploadResponse = await uploadBannerImage({
        file,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      await createBanner({
        storeId,
        imageUrl: uploadResponse.fileAsset.publicUrl,
        imageFileAssetId: uploadResponse.fileAsset.id,
        status: newStatus,
        sortOrder: bannersMeta.total,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice(t('notices.uploaded'));
    } catch (uploadError) {
      setActionError(errorMessageFromUnknown(uploadError, t('errors.uploadFailed')));
    }
  }

  async function handleStatusChange(banner: AdvertisingBanner, status: BannerStatus) {
    if (banner.status === status) {
      return;
    }
    setActionError(null);
    setActionNotice(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await updateStatus({
        storeId,
        bannerId: banner.id,
        status,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice(t('notices.statusChanged'));
    } catch (statusError) {
      setActionError(errorMessageFromUnknown(statusError, t('errors.statusFailed')));
    }
  }

  async function moveBanner(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= banners.length) {
      return;
    }

    const orderedIds = banners.map((banner) => banner.id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    setActionError(null);
    setActionNotice(null);

    try {
      const csrfData = await getCsrfOrThrow();
      await reorderBanners({
        storeId,
        bannerIds: orderedIds,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice(t('notices.reordered'));
    } catch (reorderError) {
      setActionError(errorMessageFromUnknown(reorderError, t('errors.reorderFailed')));
    }
  }

  return (
    <section className="advertising-tab" aria-labelledby="advertising-title">
      <div className="panel-heading advertising-heading">
        <div>
          <p className="eyebrow">{t('tab.eyebrow')}</p>
          <h3 id="advertising-title">{t('tab.title')}</h3>
          <p className="muted">{t('tab.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('tab.refreshing') : t('tab.refresh')}
        </button>
      </div>

      <div className="status status-warning publication-required" role="note">
        {t('tab.publicationRequiredNotice')}
      </div>

      {listError && <div className="form-error" role="alert">{listError}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {actionNotice && <div className="status status-ok">{actionNotice}</div>}
      {isLoading && <div className="status status-loading">{t('tab.loading')}</div>}

      <div className="banner-upload-card">
        <label>
          {t('form.newStatus')}
          <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as BannerStatus)} disabled={busy}>
            {bannerStatuses.map((status) => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}
          </select>
        </label>
        <label>
          {t('form.image')}
          <input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={handleBannerUpload} type="file" />
        </label>
      </div>

      {!isLoading && banners.length === 0 && <div className="empty-state">{t('tab.empty')}</div>}

      <Pagination meta={bannersMeta} onOffsetChange={setOffset} onLimitChange={handleLimitChange} label={t('tab.paginationLabel')} />

      {banners.length > 0 && (
        <div className="banner-table-wrap">
          <table className="banner-table">
            <thead>
              <tr>
                <th>{t('columns.preview')}</th>
                <th>{t('columns.status')}</th>
                <th>{t('columns.order')}</th>
                <th>{t('columns.updatedAt')}</th>
                <th>{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((banner, index) => (
                <tr key={banner.id}>
                  <td>
                    <div className="banner-preview">
                      <img src={banner.imageUrl} alt={t('row.previewAlt')} />
                      <small>{banner.imageUrl}</small>
                    </div>
                  </td>
                  <td>
                    <select
                      aria-label={t('row.statusAriaLabel', { id: banner.id })}
                      value={banner.status}
                      onChange={(event) => handleStatusChange(banner, event.target.value as BannerStatus)}
                      disabled={busy}
                    >
                      {bannerStatuses.map((status) => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}
                    </select>
                  </td>
                  <td>#{banner.sortOrder}</td>
                  <td>{new Date(banner.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="secondary-button table-action" type="button" disabled={busy || index === 0} onClick={() => moveBanner(index, -1)}>{t('row.moveUp')}</button>
                      <button className="secondary-button table-action" type="button" disabled={busy || index === banners.length - 1} onClick={() => moveBanner(index, 1)}>{t('row.moveDown')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CatalogTab({ storeId }: { storeId: string }) {
  const { t } = useTranslation('catalog');
  const { data, error, isLoading, isFetching, refetch } = useListCatalogCategoriesQuery(storeId);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createCategory, { isLoading: creating }] = useCreateCatalogCategoryMutation();
  const [updateCategory, { isLoading: updating }] = useUpdateCatalogCategoryMutation();
  const [reorderCategories, { isLoading: reordering }] = useReorderCatalogCategoriesMutation();
  const [createPlacement, { isLoading: creatingPlacement }] = useCreateCatalogPlacementMutation();
  const [movePlacement, { isLoading: movingPlacement }] = useMoveCatalogPlacementMutation();
  const [reorderPlacements, { isLoading: reorderingPlacements }] = useReorderCatalogPlacementsMutation();
  const [rootForm, setRootForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [childForm, setChildForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const categories = data?.categories ?? [];
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const activeCategoryOptions = useMemo(
    () => flatCategories.filter((category) => category.status === 'active' && category.canAcceptActivePlacements),
    [flatCategories],
  );
  const selectedCategory = activeCategoryOptions.find((category) => category.id === selectedCategoryId) ?? null;
  const { data: placementsData, error: placementsError, isLoading: placementsLoading, isFetching: placementsFetching } = useListCatalogPlacementsQuery(
    { storeId, categoryId: selectedCategoryId, status: 'active' },
    { skip: !selectedCategoryId },
  );
  const placements = useMemo(
    () => [...(placementsData?.placements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [placementsData?.placements],
  );
  const { data: productsData, isFetching: productsFetching } = useListProductsQuery({
    search: productSearch.trim() || undefined,
    status: 'active',
    limit: 10,
  });
  const selectableProducts = (productsData?.data ?? []).filter((product) => product.status === 'active' && !product.unavailableForNewActivePlacements);
  const selectedProduct = selectableProducts.find((product) => product.id === selectedProductId) ?? null;
  const placementBusy = creatingPlacement || movingPlacement || reorderingPlacements;
  const errorMessage = error && 'message' in error ? error.message : null;
  const placementsErrorMessage = placementsError && 'message' in placementsError ? placementsError.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error(t('category.errors.csrf'));
    }
    return csrfData;
  }

  function categoryPayload(form: CategoryFormState, includeParent: boolean) {
    const name = form.name.trim();
    const shortName = form.shortName.trim();
    if (!name) {
      throw new Error(t('category.errors.nameRequired'));
    }
    return {
      name,
      shortName: shortName || name,
      status: form.status,
      ...(includeParent ? { parentId: form.parentId || null } : {}),
    };
  }

  async function handleCreateRoot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionNotice(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await createCategory({
        storeId,
        ...categoryPayload(rootForm, false),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setRootForm(emptyCategoryForm());
      setActionNotice(t('category.notices.rootCreated'));
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, t('category.errors.createFailed')));
    }
  }

  async function handleCreateChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!childParentId) return;
    setActionError(null);
    setActionNotice(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await createCategory({
        storeId,
        ...categoryPayload({ ...childForm, parentId: childParentId }, true),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setChildParentId(null);
      setChildForm(emptyCategoryForm());
      setActionNotice(t('category.notices.childCreated'));
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, t('category.errors.createChildFailed')));
    }
  }

  function startEdit(category: CatalogCategory) {
    setEditingId(category.id);
    setChildParentId(null);
    setActionError(null);
    setActionNotice(null);
    setEditForm({
      name: category.name,
      shortName: category.shortName,
      status: category.status,
      parentId: category.parentId ?? '',
    });
  }

  async function handleUpdate(category: CatalogCategory, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionNotice(null);
    if (category.status !== 'archived' && editForm.status === 'archived') {
      const confirmed = window.confirm(t('category.archiveConfirm'));
      if (!confirmed) return;
    }
    try {
      const csrfData = await getCsrfOrThrow();
      await updateCategory({
        storeId,
        categoryId: category.id,
        ...categoryPayload(editForm, true),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setEditingId(null);
      setActionNotice(t('category.notices.updated'));
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, t('category.errors.updateFailed')));
    }
  }

  async function moveCategory(category: CatalogCategory, siblings: CatalogCategory[], direction: -1 | 1) {
    const currentIndex = siblings.findIndex((sibling) => sibling.id === category.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const nextIds = siblings.map((sibling) => sibling.id);
    [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
    setActionError(null);
    setActionNotice(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await reorderCategories({
        storeId,
        parentId: category.parentId,
        categoryIds: nextIds,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice(t('category.notices.reordered'));
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, t('category.errors.reorderFailed')));
    }
  }


  useEffect(() => {
    if (!selectedCategoryId && activeCategoryOptions.length > 0) {
      setSelectedCategoryId(activeCategoryOptions[0].id);
      return;
    }
    if (selectedCategoryId && !activeCategoryOptions.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(activeCategoryOptions[0]?.id ?? '');
    }
  }, [activeCategoryOptions, selectedCategoryId]);

  async function handleAddPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionNotice(null);
    if (!selectedCategory) {
      setActionError(t('placement.errors.noCategory'));
      return;
    }
    if (!selectedProduct) {
      setActionError(t('placement.errors.noProduct'));
      return;
    }

    try {
      const csrfData = await getCsrfOrThrow();
      await createPlacement({
        storeId,
        categoryId: selectedCategory.id,
        productId: selectedProduct.id,
        sortOrder: placements.length,
        status: 'active',
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setSelectedProductId('');
      setActionNotice(t('placement.notices.added', { product: selectedProduct.name, category: selectedCategory.name }));
    } catch (error) {
      const existingPlacement = existingPlacementFromError(error);
      if (existingPlacement) {
        const confirmed = window.confirm(
          t('placement.moveConfirm', {
            currentCategory: existingPlacement.category?.name ?? t('placement.fallbackCategoryName'),
            targetCategory: selectedCategory.name,
          }),
        );
        if (!confirmed) {
          setActionError(errorMessageFromUnknown(error, t('placement.errors.duplicateActive')));
          return;
        }
        try {
          const csrfData = await getCsrfOrThrow();
          await movePlacement({
            storeId,
            placementId: existingPlacement.id,
            categoryId: selectedCategory.id,
            sortOrder: placements.length,
            csrfToken: csrfData.csrfToken,
            csrfHeaderName: csrfData.headerName,
          }).unwrap();
          setSelectedProductId('');
          setActionNotice(t('placement.notices.moved', { product: selectedProduct.name, category: selectedCategory.name }));
        } catch (moveError) {
          setActionError(errorMessageFromUnknown(moveError, t('placement.errors.moveFailed')));
        }
        return;
      }
      setActionError(errorMessageFromUnknown(error, t('placement.errors.addFailed')));
    }
  }

  async function moveProductPlacement(placement: CatalogProductPlacement, direction: -1 | 1) {
    const currentIndex = placements.findIndex((item) => item.id === placement.id);
    const nextIndex = currentIndex + direction;
    if (!selectedCategoryId || currentIndex < 0 || nextIndex < 0 || nextIndex >= placements.length) return;
    const nextIds = placements.map((item) => item.id);
    [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
    setActionError(null);
    setActionNotice(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await reorderPlacements({
        storeId,
        categoryId: selectedCategoryId,
        placementIds: nextIds,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice(t('placement.notices.reordered'));
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, t('placement.errors.reorderFailed')));
    }
  }

  return (
    <section className="catalog-tab" aria-labelledby="catalog-title">
      <div className="panel-heading catalog-heading">
        <div>
          <p className="eyebrow">{t('tab.eyebrow')}</p>
          <h3 id="catalog-title">{t('tab.title')}</h3>
          <p className="muted">{t('tab.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('tab.refreshing') : t('tab.refresh')}
        </button>
      </div>

      {data?.catalog && (
        <div className="catalog-summary">
          <strong>{data.catalog.name}</strong>
          <span className={`badge badge-${data.catalog.status}`}>{formatStatusLabel(data.catalog.status)}</span>
          <small>{t('tab.catalogId')} <code>{data.catalog.id}</code></small>
        </div>
      )}

      <form className="category-form category-root-form" onSubmit={handleCreateRoot}>
        <CategoryFields form={rootForm} onChange={setRootForm} />
        <button type="submit" disabled={creating}>{creating ? t('category.creating') : t('category.createRoot')}</button>
      </form>

      <div className="status status-warning category-archive-warning">
        {t('tab.archiveWarning')}
      </div>

      <section className="placement-panel" aria-labelledby="placements-title">
        <div className="panel-heading placement-heading">
          <div>
            <p className="eyebrow">{t('placement.eyebrow')}</p>
            <h4 id="placements-title">{t('placement.title')}</h4>
            <p className="muted">{t('placement.description')}</p>
          </div>
          {placementsFetching && <span className="muted">{t('placement.fetching')}</span>}
        </div>

        <form className="placement-form" onSubmit={handleAddPlacement}>
          <label>
            {t('placement.fields.category')}
            <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={placementBusy || activeCategoryOptions.length === 0}>
              {activeCategoryOptions.length === 0 && <option value="">{t('placement.categorySelect.noOptions')}</option>}
              {activeCategoryOptions.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('placement.fields.searchProduct')}
            <input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setSelectedProductId('');
              }}
              placeholder={t('placement.placeholders.searchProduct')}
            />
          </label>
          <label>
            {t('placement.fields.product')}
            <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} disabled={placementBusy || selectableProducts.length === 0}>
              <option value="">{productsFetching ? t('placement.productSelect.searching') : t('placement.productSelect.placeholder')}</option>
              {selectableProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.defaultPluCode} · {product.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={placementBusy || !selectedCategory || !selectedProduct}>
            {creatingPlacement || movingPlacement ? t('placement.saving') : t('placement.submit')}
          </button>
        </form>
        <p className="muted">{t('placement.hint')}</p>

        {placementsErrorMessage && <div className="form-error" role="alert">{placementsErrorMessage}</div>}
        {placementsLoading && <div className="status status-loading">{t('placement.loading')}</div>}
        {!selectedCategoryId && <div className="empty-state">{t('placement.empty.noSelection')}</div>}
        {selectedCategoryId && !placementsLoading && placements.length === 0 && <div className="empty-state">{t('placement.empty.noActiveProducts')}</div>}
        {placements.length > 0 && (
          <ul className="placement-list">
            {placements.map((placement, index) => (
              <li key={placement.id} className="placement-card">
                <div>
                  <strong>{placement.product?.name ?? placement.productId}</strong>
                  <p className="muted">
	                    {t('placement.details', { plu: placement.product?.defaultPluCode ?? '—', order: placement.sortOrder })} · <span className={`badge badge-${placement.status}`}>{formatStatusLabel(placement.status)}</span>
                  </p>
	                  {placement.product?.status !== 'active' && <span className="price-warning">{t('placement.productNoLongerActive')}</span>}
                </div>
                <div className="category-actions">
                  <button className="secondary-button" type="button" onClick={() => moveProductPlacement(placement, -1)} disabled={placementBusy || index === 0}>{t('category.moveUp')}</button>
                  <button className="secondary-button" type="button" onClick={() => moveProductPlacement(placement, 1)} disabled={placementBusy || index === placements.length - 1}>{t('category.moveDown')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionNotice && <div className="status status-ok" role="status">{actionNotice}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {isLoading && <div className="status status-loading">{t('tab.loadingCategories')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && categories.length === 0 && <div className="empty-state">{t('tab.empty')}</div>}
      {categories.length > 0 && (
        <div className="category-tree" role="tree" aria-label={t('tab.treeAriaLabel')}>
          <CategoryTreeList
            categories={categories}
            allCategories={flatCategories}
            childForm={childForm}
            childParentId={childParentId}
            editingId={editingId}
            editForm={editForm}
            busy={creating || updating || reordering}
            onAddChild={(category) => {
              setEditingId(null);
              setChildParentId(category.id);
              setChildForm(emptyCategoryForm(category.id));
              setActionError(null);
              setActionNotice(null);
            }}
            onCancelChild={() => setChildParentId(null)}
            onChildFormChange={setChildForm}
            onCreateChild={handleCreateChild}
            onEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            onEditFormChange={setEditForm}
            onUpdate={handleUpdate}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(category) => setSelectedCategoryId(category.id)}
            onMove={moveCategory}
          />
        </div>
      )}
    </section>
  );
}

function CategoryTreeList({
  categories,
  allCategories,
  childForm,
  childParentId,
  editingId,
  editForm,
  busy,
  onAddChild,
  onCancelChild,
  onChildFormChange,
  onCreateChild,
  onEdit,
  onCancelEdit,
  onEditFormChange,
  onUpdate,
  onMove,
  selectedCategoryId,
  onSelectCategory,
}: {
  categories: CatalogCategory[];
  allCategories: CatalogCategory[];
  childForm: CategoryFormState;
  childParentId: string | null;
  editingId: string | null;
  editForm: CategoryFormState;
  busy: boolean;
  onAddChild: (category: CatalogCategory) => void;
  onCancelChild: () => void;
  onChildFormChange: (form: CategoryFormState) => void;
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (category: CatalogCategory) => void;
  onCancelEdit: () => void;
  onEditFormChange: (form: CategoryFormState) => void;
  onUpdate: (category: CatalogCategory, event: FormEvent<HTMLFormElement>) => void;
  onMove: (category: CatalogCategory, siblings: CatalogCategory[], direction: -1 | 1) => void;
  selectedCategoryId: string;
  onSelectCategory: (category: CatalogCategory) => void;
}) {
  const { t } = useTranslation('catalog');
  return (
    <ul className="category-list">
      {categories.map((category, index) => (
        <li className="category-node" key={category.id} role="treeitem" aria-expanded={category.children.length > 0}>
          <div className={category.status === 'archived' ? 'category-card category-card-archived' : 'category-card'}>
            {editingId === category.id ? (
              <form className="category-edit-form" onSubmit={(event) => onUpdate(category, event)}>
                <CategoryFields form={editForm} onChange={onEditFormChange} showParent allCategories={allCategories} currentCategory={category} />
                <div className="category-actions">
                  <button type="submit" disabled={busy}>{busy ? t('category.saving') : t('category.save')}</button>
                  <button className="secondary-button" type="button" onClick={onCancelEdit}>{t('category.cancel')}</button>
                </div>
              </form>
            ) : (
              <>
                <div className="category-card-main">
                  <div>
                    <div className="category-title-row">
                      <strong>{category.name}</strong>
                      <span className={`badge badge-${category.status}`}>{formatStatusLabel(category.status)}</span>
                      {!category.canAcceptActivePlacements && <span className="price-warning">{t('category.noActivePlacements')}</span>}
                    </div>
                    <p className="muted">{t('category.shortNameField', { value: category.shortName })} · {t('category.sortOrderField', { value: category.sortOrder })}</p>
                    <small><code>{category.id}</code></small>
                  </div>
                  <div className="category-actions">
                    <button className="secondary-button" type="button" onClick={() => onMove(category, categories, -1)} disabled={busy || index === 0}>{t('category.moveUp')}</button>
                    <button className="secondary-button" type="button" onClick={() => onMove(category, categories, 1)} disabled={busy || index === categories.length - 1}>{t('category.moveDown')}</button>
                    <button className="secondary-button" type="button" onClick={() => onSelectCategory(category)} disabled={busy || !category.canAcceptActivePlacements || category.status !== 'active'}>{selectedCategoryId === category.id ? t('category.selected') : t('category.manageProducts')}</button>
                    <button className="secondary-button" type="button" onClick={() => onAddChild(category)} disabled={busy}>{t('category.addChild')}</button>
                    <button type="button" onClick={() => onEdit(category)} disabled={busy}>{t('category.edit')}</button>
                  </div>
                </div>
                {childParentId === category.id && (
                  <form className="category-form category-child-form" onSubmit={onCreateChild}>
                    <CategoryFields form={childForm} onChange={onChildFormChange} />
                    <div className="category-actions">
                      <button type="submit" disabled={busy}>{busy ? t('category.creating') : t('category.createChild', { name: category.name })}</button>
                      <button className="secondary-button" type="button" onClick={onCancelChild}>{t('category.cancel')}</button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
          {category.children.length > 0 && (
            <CategoryTreeList
              categories={category.children}
              allCategories={allCategories}
              childForm={childForm}
              childParentId={childParentId}
              editingId={editingId}
              editForm={editForm}
              busy={busy}
              onAddChild={onAddChild}
              onCancelChild={onCancelChild}
              onChildFormChange={onChildFormChange}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onCancelEdit={onCancelEdit}
              onEditFormChange={onEditFormChange}
              onUpdate={onUpdate}
              onMove={onMove}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CategoryFields({
  form,
  onChange,
  showParent = false,
  allCategories = [],
  currentCategory,
}: {
  form: CategoryFormState;
  onChange: (form: CategoryFormState) => void;
  showParent?: boolean;
  allCategories?: CatalogCategory[];
  currentCategory?: CatalogCategory;
}) {
  const { t } = useTranslation('catalog');
  const descendantIds = useMemo(() => currentCategory ? collectDescendantIds(currentCategory) : new Set<string>(), [currentCategory]);
  const parentOptions = allCategories.filter((category) => category.id !== currentCategory?.id && !descendantIds.has(category.id));

  return (
    <div className="category-fields">
      <label>
        {t('category.fields.name')}
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder={t('category.placeholders.name')} />
      </label>
      <label>
        {t('category.fields.shortName')}
        <input value={form.shortName} onChange={(event) => onChange({ ...form, shortName: event.target.value })} placeholder={t('category.placeholders.shortName')} />
      </label>
      <label>
        {t('category.fields.status')}
        <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as CategoryStatus })}>
          <option value="active">{t('category.statusOptions.active')}</option>
          <option value="inactive">{t('category.statusOptions.inactive')}</option>
          <option value="archived">{t('category.statusOptions.archived')}</option>
        </select>
      </label>
      {showParent && (
        <label>
          {t('category.fields.parent')}
          <select value={form.parentId} onChange={(event) => onChange({ ...form, parentId: event.target.value })}>
            <option value="">{t('category.parentOptions.root')}</option>
            {parentOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function flattenCategories(categories: CatalogCategory[]): CatalogCategory[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

function collectDescendantIds(category: CatalogCategory): Set<string> {
  const ids = new Set<string>();
  for (const child of category.children) {
    ids.add(child.id);
    for (const descendantId of collectDescendantIds(child)) {
      ids.add(descendantId);
    }
  }
  return ids;
}

function errorMessageFromUnknown(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : fallback;
}

function existingPlacementFromError(error: unknown): CatalogProductPlacement | null {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return null;
  }
  const data = (error as { data?: { code?: string; moveRequired?: boolean; existingPlacement?: unknown } }).data;
  if (data?.code !== 'ACTIVE_PLACEMENT_EXISTS' || data.moveRequired !== true) {
    return null;
  }
  const placement = data.existingPlacement;
  if (!placement || typeof placement !== 'object' || !('id' in placement)) {
    return null;
  }
  return placement as CatalogProductPlacement;
}

function ScaleDevicesTab({ storeId, userRole, currentVersionId }: { storeId: string; userRole: AuthUser['role']; currentVersionId: string | null }) {
  const { t } = useTranslation('scales');
  const isAdmin = userRole === 'admin';
  const { data, error, isLoading, isFetching, refetch } = useListScaleDevicesQuery(storeId);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createDevice, { isLoading: creating }] = useCreateScaleDeviceMutation();
  const [updateStatus, { isLoading: updatingStatus }] = useUpdateScaleDeviceStatusMutation();
  const [regenerateToken, { isLoading: regenerating }] = useRegenerateScaleDeviceTokenMutation();
  const [deviceCode, setDeviceCode] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ deviceId: string; deviceCode: string; apiToken: string; action: 'created' | 'regenerated' } | null>(null);
  const devices = data?.devices ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error(t('errors.csrf'));
    }
    return csrfData;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setActionError(null);
    setIssuedToken(null);

    const trimmedCode = deviceCode.trim();
    const trimmedName = name.trim();
    const trimmedModel = model.trim();
    if (!trimmedCode || !trimmedName) {
      setFormError(t('form.errors.missingFields'));
      return;
    }

    try {
      const csrfData = await getCsrfOrThrow();
      const response = await createDevice({
        storeId,
        deviceCode: trimmedCode,
        name: trimmedName,
        model: trimmedModel || undefined,
        status: 'active',
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setIssuedToken({
        deviceId: response.device.id,
        deviceCode: response.device.deviceCode,
        apiToken: response.apiToken,
        action: 'created',
      });
      setDeviceCode('');
      setName('');
      setModel('');
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.createFailed');
      setFormError(message);
    }
  }

  async function handleBlock(device: ScaleDevice) {
    setActionError(null);
    setIssuedToken(null);

    try {
      const csrfData = await getCsrfOrThrow();
      await updateStatus({
        deviceId: device.id,
        status: 'blocked',
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.blockFailed');
      setActionError(message);
    }
  }

  async function handleRegenerate(device: ScaleDevice) {
    setActionError(null);
    setIssuedToken(null);

    try {
      const csrfData = await getCsrfOrThrow();
      const response = await regenerateToken({
        deviceId: device.id,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setIssuedToken({
        deviceId: response.device.id,
        deviceCode: response.device.deviceCode,
        apiToken: response.apiToken,
        action: 'regenerated',
      });
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.regenerateFailed');
      setActionError(message);
    }
  }

  return (
    <section className="scale-devices-tab" aria-labelledby="scale-devices-title">
      <div className="panel-heading scale-devices-heading">
        <div>
          <p className="eyebrow">{t('tab.eyebrow')}</p>
          <h3 id="scale-devices-title">{t('tab.title')}</h3>
          <p className="muted">{isAdmin ? t('tab.description.admin') : t('tab.description.operator')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('tab.refreshing') : t('tab.refresh')}
        </button>
      </div>

      {isAdmin && (
        <form className="scale-device-form" onSubmit={handleCreate}>
          <label>
            {t('form.fields.deviceCode')}
            <input value={deviceCode} onChange={(event) => setDeviceCode(event.target.value)} placeholder="SCALE-001" />
          </label>
          <label>
            {t('form.fields.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('form.placeholders.name')} />
          </label>
          <label>
            {t('form.fields.model')}
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={t('form.placeholders.model')} />
          </label>
          <button type="submit" disabled={creating}>{creating ? t('form.submitting') : t('form.submit')}</button>
        </form>
      )}

      {formError && <div className="form-error" role="alert">{formError}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {issuedToken && (
        <div className="token-notice" role="status">
          <strong>{t('token.heading', { code: issuedToken.deviceCode, context: issuedToken.action })}</strong>
          <span>{t('token.warning')}</span>
          <code>{issuedToken.apiToken}</code>
          <button className="secondary-button" type="button" onClick={() => setIssuedToken(null)}>{t('token.hide')}</button>
        </div>
      )}

      {isLoading && <div className="status status-loading">{t('tab.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && devices.length === 0 && <div className="empty-state">{t('tab.empty')}</div>}
      {devices.length > 0 && (
        <div className="scale-device-table-wrap">
          <table className="scale-device-table">
            <thead>
              <tr>
                <th>{t('columns.deviceCode')}</th>
                {isAdmin && <th>{t('columns.name')}</th>}
                {isAdmin && <th>{t('columns.model')}</th>}
                <th>{t('columns.status')}</th>
                <th>{t('columns.lastSeenAt')}</th>
                <th>{t('columns.lastSyncAt')}</th>
                <th>{t('columns.catalogVersion')}</th>
                <th>{t('columns.syncStatus')}</th>
                {isAdmin && <th>{t('columns.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const isOutdated = Boolean(currentVersionId && device.currentCatalogVersionId !== currentVersionId);

                return (
                  <tr className={isOutdated ? 'scale-device-outdated' : undefined} key={device.id}>
                    <td><code>{device.deviceCode}</code>{!isAdmin && <span className="operator-device-name">{device.name}</span>}</td>
                    {isAdmin && <td>{device.name}</td>}
                    {isAdmin && <td>{device.model ?? '—'}</td>}
                    <td><ScaleDeviceStatusBadge status={device.status} /></td>
                    <td>{formatDateTime(device.lastSeenAt)}</td>
                    <td>{formatDateTime(device.lastSyncAt)}</td>
                    <td>
                      <code>{device.currentCatalogVersionId ?? '—'}</code>
                      {isOutdated && <span className="sync-note">{t('row.outdatedNote')}</span>}
                    </td>
                    <td><ScaleSyncStatusCell device={device} /></td>
                    {isAdmin && (
                      <td>
                        <div className="table-actions">
                          <button className="secondary-button" type="button" onClick={() => handleBlock(device)} disabled={updatingStatus || device.status === 'blocked'}>
                            {device.status === 'blocked' ? t('row.blocked') : t('row.block')}
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleRegenerate(device)} disabled={regenerating}>
                            {t('row.regenerateToken')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScaleDeviceStatusBadge({ status }: { status: ScaleDeviceStatus }) {
  return <span className={`badge badge-${status}`}>{formatStatusLabel(status)}</span>;
}

function ScaleSyncStatusCell({ device }: { device: ScaleDevice }) {
  const { t } = useTranslation('scales');
  if (device.lastSyncError) {
    return (
      <div className="sync-status sync-status-error">
        <span className="badge badge-sync-error">{formatSyncStatusLabel(device.lastSyncError.status)}</span>
        <small>{device.lastSyncError.message || t('syncError.fallbackMessage')}</small>
        <small>{formatDateTime(device.lastSyncError.createdAt)}</small>
      </div>
    );
  }

  return (
    <div className="sync-status">
      <span className={`badge badge-sync-${device.lastSyncStatus ?? 'unknown'}`}>{formatSyncStatusLabel(device.lastSyncStatus)}</span>
    </div>
  );
}

function formatVersionLabel(version: CatalogVersionHistoryItem | null | undefined, noneLabel: string) {
  if (!version) {
    return noneLabel;
  }

  return `v${version.versionNumber} (${version.id})`;
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function shortChecksum(value: string | null | undefined) {
  return value ? `${value.slice(0, 12)}…` : '—';
}

function PublishingTab({ storeId, userRole, currentVersion }: { storeId: string; userRole: AuthUser['role']; currentVersion: CatalogVersionHistoryItem | null }) {
  const { t } = useTranslation('publishing');
  const { data: versionsData, error: versionsError, isLoading: versionsLoading, isFetching: versionsFetching, refetch } = useGetCatalogVersionsQuery(storeId);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [validateCatalog, { isLoading: validating }] = useValidateCatalogMutation();
  const [publishCatalog, { isLoading: publishing }] = usePublishCatalogMutation();
  const [validation, setValidation] = useState<CatalogValidationResponse | null>(null);
  const [lastPublished, setLastPublished] = useState<PublishCatalogResponse['version'] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAdmin = userRole === 'admin';
  const versions = versionsData?.versions ?? [];
  const displayedCurrentVersion = versionsData?.currentVersion ?? currentVersion;
  const versionsErrorMessage = versionsError && 'message' in versionsError ? versionsError.message : null;
  const hasBlockingErrors = Boolean(validation && validation.blockingErrors.length > 0);
  const canPublish = Boolean(validation?.canPublish) && !hasBlockingErrors;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error(t('errors.csrf'));
    }
    return csrfData;
  }

  async function handleValidate() {
    setActionError(null);
    setLastPublished(null);

    try {
      const csrfData = await getCsrfOrThrow();
      const response = await validateCatalog({
        storeId,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setValidation(response);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.validateFailed');
      setActionError(message);
    }
  }

  async function handlePublish() {
    setActionError(null);

    if (!canPublish) {
      setActionError(t('errors.notReady'));
      return;
    }

    try {
      const csrfData = await getCsrfOrThrow();
      const response = await publishCatalog({
        storeId,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setValidation(response.validation);
      setLastPublished(response.version);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.publishFailed');
      setActionError(message);
    }
  }

  return (
    <section className="publishing-tab" aria-labelledby="publishing-title">
      <div className="panel-heading publishing-heading">
        <div>
          <p className="eyebrow">{t('tab.eyebrow')}</p>
          <h3 id="publishing-title">{t('tab.title')}</h3>
          <p className="muted">{t('tab.description')}</p>
        </div>
        {isAdmin && (
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={handleValidate} disabled={validating || publishing}>
              {validating ? t('actions.validating') : t('actions.validate')}
            </button>
            <button type="button" onClick={handlePublish} disabled={publishing || validating || !canPublish}>
              {publishing ? t('actions.publishing') : t('actions.publish')}
            </button>
          </div>
        )}
      </div>

      <div className="publication-status-card">
        <strong>{t('currentVersion.heading')}</strong>
        <span>{formatVersionLabel(displayedCurrentVersion, t('currentVersion.none'))}</span>
        {displayedCurrentVersion?.publishedAt && <small>{t('currentVersion.publishedAt', { date: formatDateTime(displayedCurrentVersion.publishedAt) })}</small>}
      </div>

      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {lastPublished && (
        <div className="status status-ok" role="status">
          {t('notices.published', { versionNumber: lastPublished.versionNumber, date: formatDateTime(lastPublished.publishedAt) })}
        </div>
      )}

      {isAdmin && validation ? (
        <div className="validation-grid">
          <div className={`validation-summary ${validation.canPublish ? 'validation-summary-ok' : 'validation-summary-blocked'}`}>
            <strong>{validation.canPublish ? t('validation.ready') : t('validation.blocked')}</strong>
            <span>{t('validation.issueCounts', { errors: validation.blockingErrors.length, warnings: validation.warnings.length })}</span>
            <span>{t('validation.counts', { categories: validation.summary.categoryCount, products: validation.summary.activePlacementCount, banners: validation.summary.activeBannerCount })}</span>
          </div>
          <IssueList title={t('issues.errorsTitle')} issues={validation.blockingErrors} emptyText={t('issues.errorsEmpty')} tone="error" />
          <IssueList title={t('issues.warningsTitle')} issues={validation.warnings} emptyText={t('issues.warningsEmpty')} tone="warning" />
        </div>
      ) : isAdmin ? (
        <div className="empty-state">{t('emptyState.adminPreValidate')}</div>
      ) : (
        <div className="empty-state">{t('emptyState.operator')}</div>
      )}

      <div className="version-history-heading">
        <div>
          <h4>{t('history.heading')}</h4>
          <p className="muted">{t('history.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={versionsFetching}>
          {versionsFetching ? t('history.refreshing') : t('history.refresh')}
        </button>
      </div>

      {versionsLoading && <div className="status status-loading">{t('history.loading')}</div>}
      {versionsErrorMessage && <div className="form-error" role="alert">{versionsErrorMessage}</div>}
      {!versionsLoading && !versionsErrorMessage && versions.length === 0 && <div className="empty-state">{t('history.empty')}</div>}
      {versions.length > 0 && (
        <div className="version-table-wrap">
          <table className="version-table">
            <thead>
              <tr>
                <th>{t('history.columns.version')}</th>
                <th>{t('history.columns.publishedAt')}</th>
                <th>{t('history.columns.author')}</th>
                <th>{t('history.columns.checksum')}</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>v{version.versionNumber}</td>
                  <td>{formatDateTime(version.publishedAt)}</td>
                  <td>{version.publishedBy ?? t('history.row.systemAuthor')}</td>
                  <td><code title={version.checksum}>{shortChecksum(version.checksum)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IssueList({ title, issues, emptyText, tone }: { title: string; issues: CatalogValidationIssue[]; emptyText: string; tone: 'error' | 'warning' }) {
  return (
    <div className={`issue-list issue-list-${tone}`}>
      <h4>{title}</h4>
      {issues.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul>
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.entityId ?? index}`}>
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
              {(issue.entityType || issue.entityId) && <small>{[issue.entityType, issue.entityId].filter(Boolean).join(' · ')}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PricesTab({ storeId }: { storeId: string }) {
  const { t } = useTranslation('prices');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [missingPrice, setMissingPrice] = useState<'all' | 'missing' | 'priced'>('all');
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const handleLimitChange = (next: number) => {
    setLimit(next);
    setOffset(0);
  };
  const handleSearchChange = (next: string) => {
    setSearch(next);
    setOffset(0);
  };
  const handleCategoryChange = (next: string) => {
    setCategoryId(next);
    setOffset(0);
  };
  const handleMissingPriceChange = (next: 'all' | 'missing' | 'priced') => {
    setMissingPrice(next);
    setOffset(0);
  };
  const missingPriceFilter = missingPrice === 'all' ? '' : missingPrice === 'missing';
  const { data, error, isLoading, isFetching, refetch } = useListStorePricesQuery({
    storeId,
    search,
    categoryId,
    missingPrice: missingPriceFilter,
    limit,
    offset,
  });
  const { data: categoryOptionsData } = useListStorePriceCategoriesQuery(storeId);
  const prices = data?.data ?? [];
  const pricesMeta = data?.meta ?? { total: 0, limit, offset };
  const categoryOptions = categoryOptionsData ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="prices-tab" aria-labelledby="prices-title">
      <div className="panel-heading prices-heading">
        <div>
          <p className="eyebrow">{t('tab.eyebrow')}</p>
          <h3 id="prices-title">{t('tab.title')}</h3>
          <p className="muted">{t('tab.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('tab.refreshing') : t('tab.refresh')}
        </button>
      </div>

      <div className="price-filters">
        <label>
          {t('filters.search')}
          <input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
          />
        </label>
        <label>
          {t('filters.category')}
          <select value={categoryId} onChange={(event) => handleCategoryChange(event.target.value)}>
            <option value="">{t('filters.categoryAll')}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('filters.priceStatus')}
          <select
            value={missingPrice}
            onChange={(event) => handleMissingPriceChange(event.target.value as 'all' | 'missing' | 'priced')}
          >
            <option value="all">{t('filters.priceStatusAll')}</option>
            <option value="missing">{t('filters.priceStatusMissing')}</option>
            <option value="priced">{t('filters.priceStatusPriced')}</option>
          </select>
        </label>
      </div>

      {isLoading && <div className="status status-loading">{t('tab.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && prices.length === 0 && <div className="empty-state">{t('tab.emptyFiltered')}</div>}

      <Pagination meta={pricesMeta} onOffsetChange={setOffset} onLimitChange={handleLimitChange} label={t('tab.paginationLabel')} />

      {prices.length > 0 && (
        <div className="price-table-wrap">
          <table className="price-table">
            <thead>
              <tr>
                <th>{t('columns.product')}</th>
                <th>{t('columns.shortName')}</th>
                <th>{t('columns.plu')}</th>
                <th>{t('columns.skuBarcode')}</th>
                <th>{t('columns.category')}</th>
                <th>{t('columns.currentPrice')}</th>
                <th>{t('columns.unit')}</th>
                <th>{t('columns.status')}</th>
                <th>{t('columns.updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((row) => (
                <PriceTableRow key={row.placement.id} row={row} storeId={storeId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PriceTableRow({ row, storeId }: { row: PriceRow; storeId: string }) {
  const { t } = useTranslation('prices');
  const currentPriceValue = row.currentPrice?.price ?? '';
  const savedCurrency = row.currentPrice?.currency;
  const initialCurrency: AllowedCurrency = (ALLOWED_CURRENCIES as readonly string[]).includes(savedCurrency ?? '')
    ? (savedCurrency as AllowedCurrency)
    : ALLOWED_CURRENCIES[0];
  const [priceValue, setPriceValue] = useState(currentPriceValue);
  const [currency, setCurrency] = useState<AllowedCurrency>(initialCurrency);
  const [rowError, setRowError] = useState<string | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [updatePrice, { isLoading }] = useUpdateStoreProductPriceMutation();
  const numericPrice = Number(priceValue);
  const currentPriceNumber = Number(row.currentPrice?.price);
  const hasInvalidSavedPrice = Boolean(row.currentPrice) && (!Number.isFinite(currentPriceNumber) || currentPriceNumber <= 0);
  const hasInvalidPrice = priceValue.trim() !== '' && (!Number.isFinite(numericPrice) || numericPrice <= 0);
  const isDirty = priceValue.trim() !== currentPriceValue || currency !== initialCurrency;
  const currencyLocked = ALLOWED_CURRENCIES.length === 1;
  const rowClassName = [
    'price-row',
    row.missingPrice ? 'price-row-missing' : '',
    hasInvalidPrice || hasInvalidSavedPrice ? 'price-row-invalid' : '',
  ].filter(Boolean).join(' ');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRowError(null);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setRowError(t('errors.priceMustBePositive'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setRowError(t('errors.csrf'));
      return;
    }

    try {
      const response = await updatePrice({
        storeId,
        productId: row.product.id,
        price: numericPrice,
        currency,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setPriceValue(response.price.price);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('errors.saveFailed');
      setRowError(message);
    }
  }

  return (
    <tr className={rowClassName}>
      <td>
        <strong>{row.product.name}</strong>
        {row.missingPrice && <span className="price-warning">{t('row.noPrice')}</span>}
        {(hasInvalidPrice || hasInvalidSavedPrice) && <span className="price-warning">{t('row.invalidPrice')}</span>}
      </td>
      <td>{row.product.shortName}</td>
      <td>{row.product.defaultPluCode}</td>
      <td>{[row.product.sku, row.product.barcode].filter(Boolean).join(' / ') || '—'}</td>
      <td>{row.category.name}</td>
      <td>
        <form className="inline-price-form" onSubmit={handleSubmit}>
          <input
            aria-label={t('row.priceAriaLabel', { name: row.product.name })}
            inputMode="decimal"
            min="0.01"
            onChange={(event) => setPriceValue(event.target.value)}
            placeholder={t('row.pricePlaceholder')}
            step="0.01"
            type="number"
            value={priceValue}
          />
          <select
            aria-label={t('row.currencyAriaLabel', { name: row.product.name })}
            disabled={currencyLocked}
            onChange={(event) => setCurrency(event.target.value as AllowedCurrency)}
            value={currency}
          >
            {ALLOWED_CURRENCIES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <button type="submit" disabled={isLoading || hasInvalidPrice || !isDirty}>
            {isLoading ? t('row.saving') : t('row.save')}
          </button>
        </form>
        {rowError && <div className="inline-error" role="alert">{rowError}</div>}
      </td>
      <td>{formatUnitLabel(row.product.unit)}</td>
      <td><span className={`badge badge-${row.product.status}`}>{formatStatusLabel(row.product.status)}</span></td>
      <td>{row.currentPrice ? new Date(row.currentPrice.updatedAt).toLocaleString('ru-RU') : '—'}</td>
    </tr>
  );
}


function ProductsPage({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('products');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const handleLimitChange = (next: number) => {
    setLimit(next);
    setOffset(0);
  };
  const { data, error, isLoading, isFetching, refetch } = useListProductsQuery({ search, status, limit, offset });
  const products = data?.data ?? [];
  const productsMeta = data?.meta ?? { total: 0, limit, offset };
  const errorMessage = error && 'message' in error ? error.message : null;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setOffset(0);
  }

  return (
    <section className="panel" aria-labelledby="products-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('list.eyebrow')}</p>
          <h2 id="products-title">{t('list.title')}</h2>
          <p className="muted">{t('list.description')}</p>
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? t('list.refreshing') : t('list.refresh')}
          </button>
          <button type="button" onClick={() => onNavigate({ name: 'product-create' })}>{t('list.create')}</button>
        </div>
      </div>

      <form className="product-search" onSubmit={handleSearch}>
        <label>
          {t('list.search')}
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={t('list.searchPlaceholder')} />
        </label>
        <label>
          {t('list.status')}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProductStatus | 'all');
              setOffset(0);
            }}
          >
            <option value="all">{t('list.allStatuses')}</option>
            <option value="active">{t('statuses.active', { ns: 'common' })}</option>
            <option value="inactive">{t('statuses.inactive', { ns: 'common' })}</option>
            <option value="archived">{t('statuses.archived', { ns: 'common' })}</option>
          </select>
        </label>
        <button type="submit">{t('list.find')}</button>
      </form>

      {isLoading && <div className="status status-loading">{t('list.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && products.length === 0 && <div className="empty-state">{t('list.empty')}</div>}

      <Pagination meta={productsMeta} onOffsetChange={setOffset} onLimitChange={handleLimitChange} label={t('list.paginationLabel')} />

      {products.length > 0 && (
        <div className="product-table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('list.columns.plu')}</th>
                <th>{t('list.columns.name')}</th>
                <th>{t('list.columns.shortName')}</th>
                <th>{t('list.columns.sku')}</th>
                <th>{t('list.columns.barcode')}</th>
                <th>{t('list.columns.unit')}</th>
                <th>{t('list.columns.status')}</th>
                <th>{t('list.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.defaultPluCode}</td>
                  <td><strong>{product.name}</strong></td>
                  <td>{product.shortName}</td>
                  <td>{product.sku || '—'}</td>
                  <td>{product.barcode || '—'}</td>
                  <td>{formatUnitLabel(product.unit)}</td>
                  <td><span className={`badge badge-${product.status}`}>{formatStatusLabel(product.status)}</span></td>
                  <td>
                    <button className="secondary-button table-action" type="button" onClick={() => onNavigate({ name: 'product-edit', productId: product.id })}>
                      {t('list.actions.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductForm({ mode, product, onCancel, onSaved }: { mode: 'create' | 'edit'; product?: Product; onCancel: () => void; onSaved: (product: Product) => void }) {
  const { t } = useTranslation('products');
  const [values, setValues] = useState<ProductFormValues>({
    defaultPluCode: product?.defaultPluCode ?? '',
    name: product?.name ?? '',
    shortName: product?.shortName ?? '',
    description: product?.description ?? '',
    imageUrl: product?.imageUrl ?? '',
    imageFileAssetId: product?.imageFileAssetId ?? '',
    barcode: product?.barcode ?? '',
    sku: product?.sku ?? '',
    unit: product?.unit ?? 'kg',
    status: product?.status ?? 'active',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<ProductWarning | null>(null);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();
  const [uploadProductImage, { isLoading: uploadingImage }] = useUploadProductImageMutation();
  const isSaving = creating || updating;
  const existingPlacementCount = product?.activePlacementCount ?? 0;

  function updateValue(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setUploadError(null);
    setUploadNotice(null);

    if (!file) {
      return;
    }

    const filename = file.name.toLowerCase();
    if (filename.endsWith('.gif') || file.type === 'image/gif') {
      setUploadError(t('editor.upload.errors.gifNotSupported'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('editor.upload.errors.tooLarge'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setUploadError(t('editor.upload.errors.csrf'));
      return;
    }

    try {
      const response = await uploadProductImage({
        file,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setValues((current) => ({
        ...current,
        imageUrl: response.fileAsset.publicUrl,
        imageFileAssetId: response.fileAsset.id,
      }));
      setUploadNotice(t('editor.upload.noticeSaved', { name: response.fileAsset.originalFileName }));
    } catch (error) {
      setUploadError(errorMessageFromUnknown(error, t('editor.upload.errors.uploadFailed')));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setWarning(null);
    setSavedProduct(null);

    if (!values.defaultPluCode.trim() || !values.name.trim() || !values.shortName.trim() || !values.unit || !values.status) {
      setFormError(t('editor.errors.missingFields'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('editor.errors.csrf'));
      return;
    }

    const payload = {
      defaultPluCode: values.defaultPluCode.trim(),
      name: values.name.trim(),
      shortName: values.shortName.trim(),
      description: values.description?.trim() || undefined,
      imageUrl: values.imageUrl?.trim() || undefined,
      imageFileAssetId: values.imageFileAssetId?.trim() || undefined,
      barcode: values.barcode?.trim() || undefined,
      sku: values.sku?.trim() || undefined,
      unit: values.unit,
      status: values.status,
      csrfToken: csrfData.csrfToken,
      csrfHeaderName: csrfData.headerName,
    };

    try {
      if (mode === 'create') {
        const response = await createProduct(payload).unwrap();
        onSaved(response.product);
        return;
      }

      const response = await updateProduct({ ...payload, productId: product!.id }).unwrap();
      if (response.warning) {
        setSavedProduct(response.product);
        setWarning(response.warning);
      } else {
        onSaved(response.product);
      }
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('editor.errors.saveFailed');
      setFormError(message);
    }
  }

  return (
    <section className="panel" aria-labelledby="product-form-title">
      <button className="link-button" type="button" onClick={onCancel}>{t('editor.back')}</button>
      <p className="eyebrow">{mode === 'create' ? t('editor.eyebrow.create') : t('editor.eyebrow.edit')}</p>
      <h2 id="product-form-title">{mode === 'create' ? t('editor.titleCreate') : product?.name}</h2>

      {mode === 'edit' && existingPlacementCount > 0 && (
        <div className="status status-warning" role="status">
          {t('editor.placementWarning', { count: existingPlacementCount })}
        </div>
      )}
      {warning && (
        <div className="status status-warning" role="alert">
          {warning.message} {warning.activePlacementCount ? t('editor.activePlacementsSuffix', { count: warning.activePlacementCount }) : ''}
          <div className="action-row"><button type="button" onClick={() => savedProduct && onSaved(savedProduct)}>{t('editor.backToProducts')}</button></div>
        </div>
      )}

      <form className="product-form" onSubmit={handleSubmit}>
        <div className="product-form-grid">
          <label>{t('editor.fields.defaultPluCode')}<input value={values.defaultPluCode} onChange={(event) => updateValue('defaultPluCode', event.target.value)} placeholder={t('editor.placeholders.defaultPluCode')} /></label>
          <label>{t('editor.fields.name')}<input value={values.name} onChange={(event) => updateValue('name', event.target.value)} placeholder={t('editor.placeholders.name')} /></label>
          <label>{t('editor.fields.shortName')}<input value={values.shortName} onChange={(event) => updateValue('shortName', event.target.value)} placeholder={t('editor.placeholders.shortName')} /></label>
          <label>{t('editor.fields.unit')}<select value={values.unit} onChange={(event) => updateValue('unit', event.target.value as ProductUnit)}><option value="kg">{t('unit.kg')}</option><option value="g">{t('unit.g')}</option><option value="piece">{t('unit.piece')}</option></select></label>
          <label>{t('editor.fields.status')}<select value={values.status} onChange={(event) => updateValue('status', event.target.value as ProductStatus)}><option value="active">{t('statuses.active', { ns: 'common' })}</option><option value="inactive">{t('statuses.inactive', { ns: 'common' })}</option><option value="archived">{t('statuses.archived', { ns: 'common' })}</option></select></label>
          <label>{t('editor.fields.sku')}<input value={values.sku ?? ''} onChange={(event) => updateValue('sku', event.target.value)} placeholder={t('editor.placeholders.sku')} /></label>
          <label>{t('editor.fields.barcode')}<input value={values.barcode ?? ''} onChange={(event) => updateValue('barcode', event.target.value)} placeholder={t('editor.placeholders.barcode')} /></label>
          <label>{t('editor.fields.imageUrl')}<input value={values.imageUrl ?? ''} onChange={(event) => updateValue('imageUrl', event.target.value)} placeholder={t('editor.placeholders.imageUrl')} /></label>
        </div>
        <label>{t('editor.fields.description')}<input value={values.description ?? ''} onChange={(event) => updateValue('description', event.target.value)} placeholder={t('editor.placeholders.description')} /></label>
        <div className="product-image-upload">
          <label>
            {t('editor.upload.label')}
            <input accept="image/png,image/jpeg,image/webp" disabled={uploadingImage || isSaving} onChange={handleImageUpload} type="file" />
          </label>
          <p className="muted">{t('editor.upload.hint')}</p>
          {values.imageUrl && (
            <div className="product-image-preview">
              <img src={values.imageUrl} alt={t('editor.preview.alt')} />
              <div>
                <strong>{t('editor.preview.label')}</strong>
                <small>{values.imageUrl}</small>
              </div>
            </div>
          )}
          {uploadingImage && <div className="status status-loading">{t('editor.upload.uploading')}</div>}
          {uploadNotice && <div className="status status-ok" role="status">{uploadNotice}</div>}
          {uploadError && <div className="form-error" role="alert">{uploadError}</div>}
        </div>

        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="action-row">
          <button type="submit" disabled={isSaving}>{isSaving ? t('editor.saving') : t('editor.submit')}</button>
          <button className="secondary-button" type="button" onClick={onCancel}>{t('editor.cancel')}</button>
        </div>
      </form>
    </section>
  );
}

function ProductEditRoute({ productId, onNavigate }: { productId: string; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('products');
  const hasValidProductId = isValidRouteId(productId);
  const { currentData, error, isLoading } = useGetProductQuery(productId, {
    skip: !hasValidProductId,
  });
  const errorMessage = error && 'message' in error ? error.message : null;

  if (!hasValidProductId) {
    return <RouteNotFoundPanel returnTo="products" messageKey="editInvalid" onNavigate={onNavigate} />;
  }

  if (isLoading) {
    return <section className="panel"><div className="status status-loading">{t('edit.loading')}</div></section>;
  }

  if (errorMessage || !currentData?.product) {
    return <section className="panel"><div className="form-error" role="alert">{errorMessage ?? t('edit.notFound')}</div></section>;
  }

  return (
    <ProductForm
      mode="edit"
      product={currentData.product}
      onCancel={() => onNavigate({ name: 'products' })}
      onSaved={() => onNavigate({ name: 'products' })}
    />
  );
}

function StoreForm({ mode, store, onCancel, onSaved }: { mode: 'create' | 'edit'; store?: Store; onCancel: () => void; onSaved: (store: Store) => void }) {
  const { t } = useTranslation('stores');
  const [values, setValues] = useState<StoreFormValues>({
    code: store?.code ?? '',
    name: store?.name ?? '',
    address: store?.address ?? '',
    timezone: store?.timezone ?? 'Europe/Moscow',
    status: store?.status ?? 'active',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createStore, { isLoading: creating }] = useCreateStoreMutation();
  const [updateStore, { isLoading: updating }] = useUpdateStoreMutation();
  const isSaving = creating || updating;

  function updateValue(field: keyof StoreFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!values.code.trim() || !values.name.trim()) {
      setFormError(t('form.errors.missingFields'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('form.errors.csrf'));
      return;
    }

    const payload = {
      ...values,
      code: values.code.trim(),
      name: values.name.trim(),
      address: values.address?.trim(),
      timezone: values.timezone?.trim() || 'Europe/Moscow',
      status: values.status,
      csrfToken: csrfData.csrfToken,
      csrfHeaderName: csrfData.headerName,
    };

    try {
      const response = mode === 'create'
        ? await createStore(payload).unwrap()
        : await updateStore({ ...payload, storeId: store!.id }).unwrap();
      onSaved(response.store);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : t('form.errors.saveFailed');
      setFormError(message);
    }
  }

  return (
    <section className="panel" aria-labelledby="store-form-title">
      <button className="link-button" type="button" onClick={onCancel}>{t('form.back')}</button>
      <p className="eyebrow">{mode === 'create' ? t('form.eyebrow.create') : t('form.eyebrow.edit')}</p>
      <h2 id="store-form-title">{mode === 'create' ? t('form.titleCreate') : store?.name}</h2>

      <form className="store-form" onSubmit={handleSubmit}>
        <label>
          {t('form.fields.code')}
          <input value={values.code} onChange={(event) => updateValue('code', event.target.value)} placeholder={t('form.placeholders.code')} />
        </label>
        <label>
          {t('form.fields.name')}
          <input value={values.name} onChange={(event) => updateValue('name', event.target.value)} placeholder={t('form.placeholders.name')} />
        </label>
        <label>
          {t('form.fields.address')}
          <input value={values.address ?? ''} onChange={(event) => updateValue('address', event.target.value)} placeholder={t('form.placeholders.address')} />
        </label>
        <label>
          {t('form.fields.timezone')}
          <input value={values.timezone ?? ''} onChange={(event) => updateValue('timezone', event.target.value)} placeholder={t('form.placeholders.timezone')} />
        </label>
        <label>
          {t('form.fields.status')}
          <select value={values.status} onChange={(event) => updateValue('status', event.target.value as StoreStatus)}>
            <option value="active">{t('form.statusOptions.active')}</option>
            <option value="inactive">{t('form.statusOptions.inactive')}</option>
            <option value="archived">{t('form.statusOptions.archived')}</option>
          </select>
        </label>

        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="action-row">
          <button type="submit" disabled={isSaving}>{isSaving ? t('form.saving') : t('form.submit')}</button>
          <button className="secondary-button" type="button" onClick={onCancel}>{t('form.cancel')}</button>
        </div>
      </form>
    </section>
  );
}

function StoreEditRoute({ storeId, onNavigate }: { storeId: string; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('stores');
  const hasValidStoreId = isValidRouteId(storeId);
  const { currentData, error, isLoading } = useGetStoreQuery(storeId, {
    skip: !hasValidStoreId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });
  const errorMessage = error && 'message' in error ? error.message : null;

  if (!hasValidStoreId) {
    return <RouteNotFoundPanel returnTo="stores" messageKey="editInvalid" onNavigate={onNavigate} />;
  }

  if (isLoading) {
    return <section className="panel"><div className="status status-loading">{t('edit.loading')}</div></section>;
  }

  if (errorMessage || !currentData?.store) {
    return <section className="panel"><div className="form-error" role="alert">{errorMessage ?? t('edit.notFound')}</div></section>;
  }

  return (
    <StoreForm
      mode="edit"
      store={currentData.store}
      onCancel={() => onNavigate({ name: 'store-details', storeId })}
      onSaved={(savedStore) => onNavigate({ name: 'store-details', storeId: savedStore.id })}
    />
  );
}

function RouteNotFoundPanel({
  returnTo,
  messageKey,
  onNavigate,
}: {
  returnTo: 'stores' | 'products';
  messageKey: 'listInvalid' | 'detailsInvalid' | 'editInvalid';
  onNavigate: (view: DashboardView) => void;
}) {
  const { t } = useTranslation(returnTo);
  return (
    <section className="panel" aria-labelledby="route-not-found-title">
      <p className="eyebrow">{t('routeNotFound.eyebrow')}</p>
      <h2 id="route-not-found-title">{t('routeNotFound.title')}</h2>
      <p className="muted">{t(`routeNotFound.${messageKey}`)}</p>
      <button type="button" onClick={() => onNavigate({ name: returnTo })}>
        {t('routeNotFound.backToList')}
      </button>
    </section>
  );
}

type AccessDeniedRoute = 'global-logs' | 'users-access' | 'store-management';

function AccessDeniedPanel({ route }: { route: AccessDeniedRoute }) {
  const { t } = useTranslation('dashboard');
  return (
    <section className="panel" aria-labelledby="access-denied-title">
      <p className="eyebrow">{t('accessDenied.eyebrow')}</p>
      <h2 id="access-denied-title">{t(`accessDenied.${route}.heading`)}</h2>
      <p className="muted">{t(`accessDenied.${route}.description`)}</p>
    </section>
  );
}

function getDefaultInviteExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 16);
}

function UsersAccessPage({ currentUser }: { currentUser: AuthUser }) {
  const { t } = useTranslation('users');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const { data, error, isLoading, isFetching, refetch } = useListUsersQuery({ includeDeleted });
  const users = data?.users ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel" aria-labelledby="users-access-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('page.eyebrow')}</p>
          <h2 id="users-access-title">{t('page.title')}</h2>
          <p className="muted">{t('page.description')}</p>
        </div>
        <div className="action-row">
          <label className="compact-checkbox">
            <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
            {t('page.showDeleted')}
          </label>
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? t('page.refreshing') : t('page.refresh')}
          </button>
        </div>
      </div>

      <InviteForm />

      {isLoading && <div className="status status-loading">{t('page.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && users.length === 0 && <div className="empty-state">{t('page.empty')}</div>}
      {users.length > 0 && (
        <div className="users-list">
          {users.map((managedUser) => (
            <UserAccessCard key={managedUser.id} user={managedUser} currentUser={currentUser} />
          ))}
        </div>
      )}
    </section>
  );
}

function InviteForm() {
  const { t } = useTranslation('users');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AuthUser['role']>('operator');
  const [expiresAt, setExpiresAt] = useState(getDefaultInviteExpiry());
  const [formError, setFormError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ id: string; email: string; expiresAt: string } | null>(null);
  const [cancelledInviteEmail, setCancelledInviteEmail] = useState<string | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createInvite, { isLoading }] = useCreateInviteMutation();
  const [cancelInvite, { isLoading: isCancelling }] = useCancelInviteMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setCreatedInvite(null);
    setCancelledInviteEmail(null);

    if (!email.trim()) {
      setFormError(t('invite.errors.missingEmail'));
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError(t('invite.errors.csrf'));
      return;
    }

    try {
      const response = await createInvite({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role,
        expiresAt: new Date(expiresAt).toISOString(),
        locale: normalizeLocale(i18n.resolvedLanguage ?? i18n.language),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setCreatedInvite({ id: response.invite.id, email: response.invite.email, expiresAt: response.invite.expiresAt });
      setEmail('');
      setFullName('');
      setRole('operator');
      setExpiresAt(getDefaultInviteExpiry());
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('invite.errors.createFailed');
      setFormError(message);
    }
  }

  return (
    <form className="invite-form" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">{t('invite.eyebrow')}</p>
        <p className="muted">{t('invite.description')}</p>
      </div>
      <div className="invite-grid">
        <label>{t('invite.fields.email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operator@example.com" /></label>
        <label>{t('invite.fields.fullName')}<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t('invite.fields.fullNamePlaceholder')} /></label>
        <label>{t('invite.fields.role')}<select value={role} onChange={(event) => setRole(event.target.value as AuthUser['role'])}><option value="operator">{t('roles.operator')}</option><option value="admin">{t('roles.admin')}</option></select></label>
        <label>{t('invite.fields.expiresAt')}<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      </div>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {createdInvite && (
        <div className="status status-ok" role="status">
          <Trans
            i18nKey="invite.created.message"
            ns="users"
            values={{ email: createdInvite.email, date: formatDateTime(createdInvite.expiresAt) }}
            components={{ 1: <strong /> }}
          />
          <br />
          {t('invite.created.emailNote')}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="secondary-button"
              disabled={isCancelling}
              onClick={async () => {
                const confirmed = window.confirm(t('invite.cancel.confirm'));
                if (!confirmed) return;
                setFormError(null);
                try {
                  const csrfData = csrf ?? (await refetchCsrf()).data;
                  if (!csrfData) {
                    setFormError(t('invite.errors.csrf'));
                    return;
                  }
                  await cancelInvite({
                    inviteId: createdInvite.id,
                    csrfToken: csrfData.csrfToken,
                    csrfHeaderName: csrfData.headerName,
                  }).unwrap();
                  setCancelledInviteEmail(createdInvite.email);
                  setCreatedInvite(null);
                } catch (error) {
                  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('invite.errors.cancelFailed');
                  setFormError(message);
                }
              }}
            >
              {isCancelling ? t('invite.cancel.cancelling') : t('invite.cancel.button')}
            </button>
          </div>
        </div>
      )}
      {cancelledInviteEmail && (
        <div className="status status-ok" role="status">
          <Trans
            i18nKey="invite.cancelled"
            ns="users"
            values={{ email: cancelledInviteEmail }}
            components={{ 1: <strong /> }}
          />
        </div>
      )}
      <button type="submit" disabled={isLoading}>{isLoading ? t('invite.submitting') : t('invite.submit')}</button>
    </form>
  );
}

function UserAccessCard({ user, currentUser }: { user: ManagedUser; currentUser: AuthUser }) {
  const { t } = useTranslation('users');
  const [rowError, setRowError] = useState<string | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [changeRole, { isLoading: changingRole }] = useChangeUserRoleMutation();
  const [blockUser, { isLoading: blocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();
  const isDeleted = Boolean(user.deletedAt);
  const isSelf = currentUser.id === user.id;
  const statusClass = user.status === 'blocked' ? 'badge-blocked' : user.status === 'active' ? 'badge-active' : 'badge-inactive';

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) throw new Error(t('card.errors.csrf'));
    return csrfData;
  }

  async function runAction(action: (csrfData: { csrfToken: string; headerName: string }) => Promise<unknown>) {
    setRowError(null);
    try {
      await action(await getCsrfOrThrow());
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('card.errors.updateFailed');
      setRowError(message);
    }
  }

  return (
    <article className="user-card">
      <div className="user-card-main">
        <div>
          <p className="store-code">{user.email}</p>
          <h3>{user.fullName || t('card.noName')}</h3>
          <p className="muted">{t('card.createdAndLastLogin', { created: formatDateTime(user.createdAt), lastLogin: formatDateTime(user.lastLoginAt) })}</p>
        </div>
        <div className="store-actions">
          <span className={`badge ${statusClass}`}>{formatStatusLabel(isDeleted ? 'deleted' : user.status)}</span>
          <label className="role-control">
            {t('card.role')}
            <select
              value={user.role}
              disabled={isDeleted || changingRole}
              onChange={(event) => runAction((csrfData) => changeRole({ userId: user.id, role: event.target.value as AuthUser['role'], csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}
            >
              <option value="operator">{t('roles.operator')}</option>
              <option value="admin">{t('roles.admin')}</option>
            </select>
          </label>
          {user.status === 'blocked' ? (
            <button className="secondary-button" type="button" disabled={isDeleted || unblocking} onClick={() => runAction((csrfData) => unblockUser({ userId: user.id, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}>
              {unblocking ? t('card.unblocking') : t('card.unblock')}
            </button>
          ) : (
            <button className="secondary-button" type="button" disabled={isDeleted || blocking || isSelf} onClick={() => runAction((csrfData) => blockUser({ userId: user.id, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}>
              {blocking ? t('card.blocking') : t('card.block')}
            </button>
          )}
        </div>
      </div>
      {rowError && <div className="inline-error" role="alert">{rowError}</div>}
      {user.role === 'operator' && !isDeleted && <OperatorStoreAccess userId={user.id} />}
    </article>
  );
}

function OperatorStoreAccess({ userId }: { userId: string }) {
  const { t } = useTranslation('users');
  const [storeId, setStoreId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: accessData, error: accessError, isLoading: accessLoading } = useListUserStoreAccessesQuery(userId);
  const { data: storesData } = useListStoresQuery();
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [grantStoreAccess, { isLoading: granting }] = useGrantStoreAccessMutation();
  const [revokeStoreAccess, { isLoading: revoking }] = useRevokeStoreAccessMutation();
  const activeAccesses = (accessData?.storeAccesses ?? []).filter((access) => !access.revokedAt);
  const activeStoreIds = new Set(activeAccesses.map((access) => access.storeId));
  const availableStores = (storesData?.stores ?? []).filter((store) => store.status !== 'archived' && !activeStoreIds.has(store.id));
  const accessErrorMessage = accessError && 'message' in accessError ? accessError.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) throw new Error(t('access.errors.csrf'));
    return csrfData;
  }

  async function handleGrant() {
    setActionError(null);
    if (!storeId) {
      setActionError(t('access.errors.selectStore'));
      return;
    }
    try {
      const csrfData = await getCsrfOrThrow();
      await grantStoreAccess({ userId, storeId, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap();
      setStoreId('');
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('access.errors.grantFailed');
      setActionError(message);
    }
  }

  async function handleRevoke(revokeStoreId: string) {
    setActionError(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await revokeStoreAccess({ userId, storeId: revokeStoreId, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap();
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('access.errors.revokeFailed');
      setActionError(message);
    }
  }

  return (
    <div className="store-access-box">
      <div className="store-access-header">
        <h4>{t('access.heading')}</h4>
        <div className="access-grant-row">
          <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label={t('access.storeSelectAriaLabel')}>
            <option value="">{t('access.storeSelectPlaceholder')}</option>
            {availableStores.map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
          </select>
          <button type="button" disabled={granting || !storeId} onClick={handleGrant}>{granting ? t('access.granting') : t('access.grant')}</button>
        </div>
      </div>
      {accessLoading && <div className="status status-loading">{t('access.loading')}</div>}
      {accessErrorMessage && <div className="form-error" role="alert">{accessErrorMessage}</div>}
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      {!accessLoading && activeAccesses.length === 0 && <div className="empty-state">{t('access.empty')}</div>}
      {activeAccesses.length > 0 && (
        <div className="access-list">
          {activeAccesses.map((access) => (
            <div className="access-item" key={access.id}>
              <span><strong>{access.store.code}</strong> · {access.store.name}</span>
              <button className="secondary-button" type="button" disabled={revoking} onClick={() => handleRevoke(access.storeId)}>
                {revoking ? t('access.revoking') : t('access.revoke')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function OverviewDashboard({ user, onNavigate }: { user: AuthUser; onNavigate: (view: DashboardView) => void }) {
  return user.role === 'admin'
    ? <AdminDashboardOverview onNavigate={onNavigate} />
    : <OperatorDashboardOverview onNavigate={onNavigate} />;
}

function AdminDashboardOverview({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('dashboard');
  const { data, error, isLoading, isFetching, refetch } = useGetAdminDashboardQuery();
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel dashboard-overview" aria-labelledby="admin-dashboard-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h2 id="admin-dashboard-title">{t('admin.title')}</h2>
          <p className="muted">{t('admin.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('admin.refreshing') : t('admin.refresh')}
        </button>
      </div>

      {isLoading && <div className="status status-loading">{t('admin.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}

      {data && (
        <>
          <div className="metric-grid" aria-label={t('admin.summaryAriaLabel')}>
            <MetricCard label={t('admin.metrics.stores')} value={data.counts.stores} />
            <MetricCard label={t('admin.metrics.scales')} value={data.counts.scaleDevices} />
            <MetricCard label={t('admin.metrics.scalesWithErrors')} value={data.counts.scaleDevicesWithErrors} tone={data.counts.scaleDevicesWithErrors > 0 ? 'danger' : 'ok'} />
            <MetricCard label={t('admin.metrics.scalesMissingSync')} value={data.counts.scaleDevicesWithoutSynchronization} tone={data.counts.scaleDevicesWithoutSynchronization > 0 ? 'warning' : 'ok'} />
          </div>

          <div className="dashboard-section-grid">
            <DashboardList title={t('admin.sections.latestVersions')} emptyText={t('admin.sections.latestVersionsEmpty')}>
              {data.latestPublishedVersions.map((version) => (
                <li className="dashboard-list-item" key={version.id}>
                  <div>
                    <strong>{version.storeCode} · {version.storeName}</strong>
                    <span className="muted block">{version.catalogName} · v{version.versionNumber}</span>
                  </div>
                  <span className="muted">{formatDateTime(version.publishedAt ?? version.createdAt)}</span>
                </li>
              ))}
            </DashboardList>

            <DashboardList title={t('admin.sections.latestSyncErrors')} emptyText={t('admin.sections.latestSyncErrorsEmpty')}>
              {data.latestSyncErrors.map((syncError) => (
                <LatestSyncErrorItem error={syncError} key={syncError.id} onNavigate={onNavigate} />
              ))}
            </DashboardList>
          </div>

          <section className="dashboard-subsection" aria-labelledby="problematic-scales-title">
            <div className="section-heading-row">
              <div>
                <h3 id="problematic-scales-title">{t('admin.sections.problemScalesTitle')}</h3>
                <p className="muted">{t('admin.sections.problemScalesDescription')}</p>
              </div>
            </div>
            {data.problematicScaleDevices.length === 0 ? (
              <div className="empty-state">{t('admin.sections.problemScalesEmpty')}</div>
            ) : (
              <div className="problem-scale-grid">
                {data.problematicScaleDevices.map((device) => (
                  <ProblematicScaleCard device={device} key={device.id} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </section>

          <section className="quick-links" aria-labelledby="quick-links-title">
            <h3 id="quick-links-title">{t('admin.sections.quickLinksTitle')}</h3>
            <div className="action-row">
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'stores' })}>{t('admin.quickLinks.stores')}</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'products' })}>{t('admin.quickLinks.products')}</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'global-logs' })}>{t('admin.quickLinks.globalLogs')}</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'users-access' })}>{t('admin.quickLinks.usersAccess')}</button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'ok' | 'warning' | 'danger' }) {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardList({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;

  return (
    <section className="dashboard-subsection" aria-label={title}>
      <h3>{title}</h3>
      {isEmpty ? <div className="empty-state">{emptyText}</div> : <ul className="dashboard-list">{items}</ul>}
    </section>
  );
}

function LatestSyncErrorItem({ error, onNavigate }: { error: AdminDashboardLatestSyncError; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <li className="dashboard-list-item dashboard-list-item-danger">
      <div>
        <strong>{error.deviceCode} · {error.deviceName}</strong>
        <span className="muted block">{error.storeCode} · {error.storeName}</span>
        <span className="inline-error block">{error.message ?? error.status}</span>
      </div>
      <div className="dashboard-list-actions">
        <span className="muted">{formatDateTime(error.createdAt)}</span>
        <button className="secondary-button table-action" type="button" onClick={() => onNavigate({ name: 'store-details', storeId: error.storeId })}>
          {t('admin.openStore')}
        </button>
      </div>
    </li>
  );
}

function ProblematicScaleCard({ device, onNavigate }: { device: AdminDashboardProblematicScaleDevice; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <article className="problem-scale-card">
      <div className="problem-scale-heading">
        <div>
          <p className="store-code">{device.storeCode} · {device.storeName}</p>
          <h4>{device.deviceCode} · {device.name}</h4>
        </div>
        <span className={`badge badge-${device.status}`}>{formatStatusLabel(device.status)}</span>
      </div>
      <div className="reason-row">
        {device.reasons.map((reason) => <span className="badge badge-danger" key={reason}>{t(`admin.problemReasons.${reason}`, { defaultValue: reason.replace(/_/g, ' ') })}</span>)}
      </div>
      <dl className="compact-details">
        <div><dt>{t('admin.problematicScale.currentVersion')}</dt><dd>{device.currentCatalogVersionId ?? '—'}</dd></div>
        <div><dt>{t('admin.problematicScale.expectedVersion')}</dt><dd>{device.expectedCatalogVersionId ?? '—'}</dd></div>
        <div><dt>{t('admin.problematicScale.lastSync')}</dt><dd>{formatDateTime(device.lastSyncAt)}</dd></div>
      </dl>
      {device.lastSyncError?.message && <div className="inline-error">{device.lastSyncError.message}</div>}
      <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-details', storeId: device.storeId })}>
        {t('admin.openStore')}
      </button>
    </article>
  );
}

function OperatorDashboardOverview({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('dashboard');
  const { data, error, isLoading, isFetching, refetch } = useListStoresQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });
  const stores = data?.stores ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel dashboard-overview" aria-labelledby="operator-dashboard-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('operator.eyebrow')}</p>
          <h2 id="operator-dashboard-title">{t('operator.title')}</h2>
          <p className="muted">{t('operator.description')}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? t('operator.refreshing') : t('operator.refresh')}
        </button>
      </div>

      {isLoading && <div className="status status-loading">{t('operator.loading')}</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && stores.length === 0 && <div className="empty-state">{t('operator.empty')}</div>}

      {stores.length > 0 && (
        <div className="operator-store-grid">
          {stores.map((store) => <OperatorStoreDashboardCard key={store.id} store={store} onNavigate={onNavigate} />)}
        </div>
      )}
    </section>
  );
}

function OperatorStoreDashboardCard({ store, onNavigate }: { store: Store; onNavigate: (view: DashboardView) => void }) {
  const { t } = useTranslation('dashboard');
  const { data: versionsData, error: versionsError, isLoading: versionsLoading } = useGetCatalogVersionsQuery(store.id);
  const { data: scalesData, error: scalesError, isLoading: scalesLoading } = useListScaleDevicesQuery(store.id);
  const currentVersion = versionsData?.currentVersion ?? null;
  const devices = scalesData?.devices ?? [];
  const devicesWithErrors = devices.filter((device) => device.lastSyncError || device.lastSyncStatus === 'error' || device.lastSyncStatus === 'auth_failed');
  const devicesMissingSync = devices.filter((device) => !device.lastSyncAt || !device.currentCatalogVersionId);
  const devicesOutdated = devices.filter((device) => currentVersion?.id && device.currentCatalogVersionId && device.currentCatalogVersionId !== currentVersion.id);
  const problematicDeviceIds = new Set([...devicesWithErrors, ...devicesMissingSync, ...devicesOutdated].map((device) => device.id));
  const hasProblems = problematicDeviceIds.size > 0;
  const errorMessage = [versionsError, scalesError].map((apiError) => apiError && 'message' in apiError ? apiError.message : null).filter(Boolean).join(' ');

  return (
    <article className={hasProblems ? 'operator-store-card operator-store-card-problem' : 'operator-store-card'}>
      <div className="problem-scale-heading">
        <div>
          <p className="store-code">{store.code}</p>
          <h3>{store.name}</h3>
          <p className="muted">{store.address || t('operator.storeCard.addressMissing')} · {store.timezone}</p>
        </div>
        <span className={`badge badge-${store.status}`}>{formatStatusLabel(store.status)}</span>
      </div>

      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {(versionsLoading || scalesLoading) && <div className="status status-loading">{t('operator.storeCard.loadingPanel')}</div>}

      <dl className="compact-details">
        <div><dt>{t('operator.storeCard.currentVersion')}</dt><dd>{versionsLoading ? t('operator.storeCard.versionLoading') : formatVersionLabel(currentVersion, t('operator.storeCard.noVersion'))}</dd></div>
        <div><dt>{t('operator.storeCard.publicationStatus')}</dt><dd>{currentVersion?.status ? formatStatusLabel(currentVersion.status) : t('operator.storeCard.publicationNone')}</dd></div>
        <div><dt>{t('operator.storeCard.syncStatus')}</dt><dd>
          {devices.length === 0
            ? t('operator.storeCard.syncSummary.noScales')
            : problematicDeviceIds.size === 0
              ? t('operator.storeCard.syncSummary.allSynced', { count: devices.length })
              : t('operator.storeCard.syncSummary.attention', { problematic: problematicDeviceIds.size, total: devices.length })}
        </dd></div>
        <div><dt>{t('operator.storeCard.errors')}</dt><dd>{devicesWithErrors.length}</dd></div>
      </dl>

      {hasProblems && (
        <div className="reason-row">
          {devicesWithErrors.length > 0 && <span className="badge badge-danger">{t('operator.storeCard.badges.errors', { count: devicesWithErrors.length })}</span>}
          {devicesMissingSync.length > 0 && <span className="badge badge-warning">{t('operator.storeCard.badges.missingSync', { count: devicesMissingSync.length })}</span>}
          {devicesOutdated.length > 0 && <span className="badge badge-warning">{t('operator.storeCard.badges.outdated', { count: devicesOutdated.length })}</span>}
        </div>
      )}

      {devicesWithErrors.length > 0 && (
        <ul className="dashboard-list compact-error-list">
          {devicesWithErrors.slice(0, 3).map((device) => (
            <li className="dashboard-list-item dashboard-list-item-danger" key={device.id}>
              <div>
                <strong>{device.deviceCode} · {device.name}</strong>
                <span className="inline-error block">{device.lastSyncError?.message ?? formatSyncStatusLabel(device.lastSyncStatus) ?? t('operator.storeCard.syncErrorFallback')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => onNavigate({ name: 'store-details', storeId: store.id })}>
        {t('operator.openCatalog')}
      </button>
    </article>
  );
}

function DashboardContent({ user, view, onNavigate }: { user: AuthUser; view: DashboardView; onNavigate: (view: DashboardView) => void }) {
  if (view.name === 'global-logs') {
    return user.role === 'admin' ? <GlobalLogsPage user={user} /> : <AccessDeniedPanel route="global-logs" />;
  }

  if (view.name === 'users-access') {
    return user.role === 'admin' ? <UsersAccessPage currentUser={user} /> : <AccessDeniedPanel route="users-access" />;
  }

  if (view.name === 'stores') {
    return <StoresList user={user} onNavigate={onNavigate} />;
  }

  if (view.name === 'products') {
    return <ProductsPage onNavigate={onNavigate} />;
  }

  if (view.name === 'route-not-found') {
    return <RouteNotFoundPanel returnTo={view.returnTo} messageKey={view.messageKey} onNavigate={onNavigate} />;
  }

  if (view.name === 'product-create') {
    return <ProductForm mode="create" onCancel={() => onNavigate({ name: 'products' })} onSaved={() => onNavigate({ name: 'products' })} />;
  }

  if (view.name === 'product-edit') {
    return <ProductEditRoute productId={view.productId} onNavigate={onNavigate} />;
  }

  if (view.name === 'store-details') {
    return <StoreDetails user={user} storeId={view.storeId} onNavigate={onNavigate} />;
  }

  if (view.name === 'store-create') {
    return user.role === 'admin' ? (
      <StoreForm mode="create" onCancel={() => onNavigate({ name: 'stores' })} onSaved={(store) => onNavigate({ name: 'store-details', storeId: store.id })} />
    ) : (
      <AccessDeniedPanel route="store-management" />
    );
  }

  if (view.name === 'store-edit') {
    return user.role === 'admin' ? <StoreEditRoute storeId={view.storeId} onNavigate={onNavigate} /> : <AccessDeniedPanel route="store-management" />;
  }

  return <OverviewDashboard user={user} onNavigate={onNavigate} />;
}

function viewFromLocationHash(): DashboardView {
  return dashboardViewFromHash(window.location.hash);
}

function Dashboard({ user }: { user: AuthUser }) {
  const { t } = useTranslation(['navigation', 'common', 'auth']);
  const [view, setView] = useState<DashboardView>(viewFromLocationHash);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [logout, { isLoading: logoutLoading, error: logoutError }] = useLogoutMutation();

  useEffect(() => {
    function handleHashChange() {
      setView(viewFromLocationHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function handleNavigate(nextView: DashboardView) {
    const hash = hashFromView(nextView);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setView(nextView);
  }

  async function handleLogout() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      return;
    }

    try {
      await logout({ csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap();
    } catch {
      // RTK Query exposes the logout error through logoutError for rendering below.
    }
  }

  const displayName = user.fullName || user.email;
  const logoutErrorMessage = logoutError && 'message' in logoutError ? logoutError.message : null;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-header">
        <div>
          <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
          <h1>{t('shell.welcome', { ns: 'navigation', name: displayName })}</h1>
          <p className="description">
            {t('shell.sessionPrefix', { ns: 'navigation' })} {user.email} · {t('shell.rolePrefix', { ns: 'navigation' })} <strong>{t(`shell.roles.${user.role}`, { ns: 'navigation' })}</strong>
          </p>
        </div>
        <div className="dashboard-header-actions">
          <LanguageSwitcher />
          <button type="button" onClick={handleLogout} disabled={logoutLoading}>
            {logoutLoading ? t('logout.submitting', { ns: 'auth' }) : t('logout.submit', { ns: 'auth' })}
          </button>
        </div>
      </section>

      <Navigation user={user} activeView={view} onNavigate={handleNavigate} />
      {logoutErrorMessage && <div className="form-error" role="alert">{logoutErrorMessage}</div>}
      <DashboardContent user={user} view={view} onNavigate={handleNavigate} />
    </main>
  );
}

type LoginNoticeKind = 'inviteAccepted' | 'passwordReset';

function normalizedPathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isAcceptInvitePath(pathname: string) {
  return normalizedPathname(pathname) === '/accept-invite';
}

function isPasswordResetRequestPath(pathname: string) {
  const routePath = normalizedPathname(pathname);
  return routePath === '/forgot-password' || routePath === '/password-reset';
}

function isPasswordResetConfirmPath(pathname: string) {
  return normalizedPathname(pathname) === '/reset-password';
}

function loginNoticeKindFromQuery(): LoginNoticeKind | null {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('passwordReset') === '1') {
    return 'passwordReset';
  }
  if (searchParams.get('inviteAccepted') === '1') {
    return 'inviteAccepted';
  }
  return null;
}

function loginNoticeRoute(notice?: LoginNoticeKind) {
  if (notice === 'passwordReset') {
    return '/?passwordReset=1';
  }
  if (notice === 'inviteAccepted') {
    return '/?inviteAccepted=1';
  }
  return '/';
}

function App() {
  const { t, i18n: i18nInstance } = useTranslation(['auth', 'common']);

  useEffect(() => {
    const applyHtmlLang = (language: string | undefined) => {
      document.documentElement.lang = normalizeLocale(language);
    };

    applyHtmlLang(i18nInstance.resolvedLanguage ?? i18nInstance.language);
    i18nInstance.on('languageChanged', applyHtmlLang);
    return () => {
      i18nInstance.off('languageChanged', applyHtmlLang);
    };
  }, [i18nInstance]);

  useEffect(() => subscribeAuthSessionEvents((event) => {
    if (event.type === 'session-cleared') {
      clearProtectedClientState(store.dispatch, false);
      return;
    }

    store.dispatch(backendApi.util.invalidateTags(['Session']));
  }), []);

  useEffect(() => subscribeStoreListChangedEvents((event) => {
    store.dispatch(backendApi.util.invalidateTags([
      { type: 'Stores', id: 'LIST' },
      ...(event.storeId ? [{ type: 'Stores' as const, id: event.storeId }] : []),
    ]));
  }), []);

  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [loginNoticeKind, setLoginNoticeKind] = useState<LoginNoticeKind | null>(loginNoticeKindFromQuery);
  const loginNotice = loginNoticeKind === 'passwordReset'
    ? t('notices.passwordReset', { ns: 'auth' })
    : loginNoticeKind === 'inviteAccepted'
      ? t('notices.inviteAccepted', { ns: 'auth' })
      : null;
  const acceptInviteRouteActive = isAcceptInvitePath(pathname);
  const passwordResetRequestRouteActive = isPasswordResetRequestPath(pathname);
  const passwordResetConfirmRouteActive = isPasswordResetConfirmPath(pathname);
  const publicAuthRouteActive = acceptInviteRouteActive || passwordResetRequestRouteActive || passwordResetConfirmRouteActive;
  const { data: session, isLoading, isFetching, error } = useGetSessionQuery(undefined, {
    skip: publicAuthRouteActive,
  });
  const hasActiveSession = Boolean(session?.user);

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
      setLoginNoticeKind(loginNoticeKindFromQuery());
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function routeToLogin(notice?: LoginNoticeKind) {
    window.history.replaceState(null, '', loginNoticeRoute(notice));
    setPathname('/');
    setLoginNoticeKind(loginNoticeKindFromQuery());
  }

  function routeToPasswordResetRequest() {
    window.history.pushState(null, '', '/forgot-password');
    setPathname('/forgot-password');
    setLoginNoticeKind(null);
  }

  function clearLoginNoticeAfterLogin() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('inviteAccepted') || searchParams.has('passwordReset')) {
      window.history.replaceState(null, '', '/');
      setPathname('/');
    }
    setLoginNoticeKind(null);
  }

  if (acceptInviteRouteActive) {
    return (
      <AcceptInviteScreen
        onAccepted={() => routeToLogin('inviteAccepted')}
        onBackToLogin={() => routeToLogin()}
      />
    );
  }

  if (passwordResetRequestRouteActive) {
    return <PasswordResetRequestScreen onBackToLogin={() => routeToLogin()} />;
  }

  if (passwordResetConfirmRouteActive) {
    return (
      <PasswordResetConfirmScreen
        onBackToLogin={() => routeToLogin()}
        onConfirmed={() => routeToLogin('passwordReset')}
      />
    );
  }

  if (isLoading || (isFetching && !session && !error)) {
    return (
      <main className="app-shell">
        <section className="card">
          <div className="auth-language-row">
            <LanguageSwitcher />
          </div>
          <p className="eyebrow">{t('productName', { ns: 'common' })}</p>
          <h1>{t('login.sessionCheck.title')}</h1>
          <div className="status status-loading">{t('login.sessionCheck.description')}</div>
        </section>
      </main>
    );
  }

  if (!hasActiveSession || loginNotice) {
    return (
      <LoginScreen
        notice={loginNotice}
        onForgotPassword={routeToPasswordResetRequest}
        onLoginSuccess={clearLoginNoticeAfterLogin}
      />
    );
  }

  return <Dashboard user={session!.user} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <Suspense fallback={<div className="app-shell"><div className="status status-loading">{i18n.t('states.loading', { ns: 'common' })}</div></div>}>
        <App />
      </Suspense>
    </Provider>
  </StrictMode>,
);
