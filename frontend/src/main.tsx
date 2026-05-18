import { type ChangeEvent, type FormEvent, type ReactNode, StrictMode, useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import { store } from './app/store';
import {
  backendApi,
  clearProtectedClientState,
  subscribeAuthSessionEvents,
  subscribeStoreListChangedEvents,
} from './shared/api/backendApi';
import {
  useGetCsrfTokenQuery,
  useGetSessionQuery,
  useLoginMutation,
  useLogoutMutation,
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
import { useGetHealthQuery } from './features/health/healthApi';
import {
  useListGlobalLogsQuery,
  useListStoreLogsQuery,
  type AuditLogEntry,
  type LogsFilters,
  type ScaleSyncLogEntry,
} from './features/logs/logsApi';
import {
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

function HealthStatus() {
  const { data: health, error, isLoading, isFetching, refetch } = useGetHealthQuery();
  const isHealthy = health?.status === 'ok';
  const errorMessage = error && 'message' in error ? error.message : 'Unexpected health response';

  return (
    <section className="panel" aria-labelledby="system-status-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">System status</p>
          <h2 id="system-status-title">Backend health</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Checking...' : 'Check again'}
        </button>
      </div>

      <div
        className={`status status-${isLoading ? 'loading' : isHealthy ? 'ok' : 'error'}`}
        data-testid="backend-health-status"
      >
        <strong>Health endpoint:</strong>{' '}
        {isLoading && 'checking via RTK Query...'}
        {!isLoading && isHealthy && `OK (${health.service})`}
        {!isLoading && !isHealthy && `Error: ${errorMessage}`}
      </div>

      {isHealthy && <p className="timestamp">Last checked: {health.timestamp}</p>}
      {!isHealthy && !isLoading && (
        <p className="help-text">Health check is handled by the shared RTK Query backend API client.</p>
      )}
    </section>
  );
}

function LoginScreen() {
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
      setFormError('Введите email и пароль.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError('Не удалось подготовить защищённую форму входа. Повторите попытку.');
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
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Не удалось войти. Проверьте email и пароль.';
      setFormError(message);
    }
  }

  const csrfErrorMessage = csrfError && 'message' in csrfError ? csrfError.message : null;

  return (
    <main className="auth-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Scale Admin</p>
        <h1 id="login-title">Вход в систему</h1>
        <p className="description">Войдите, чтобы открыть защищённую панель администрирования.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              type="email"
              value={email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
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
            {loginLoading ? 'Входим...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Navigation({ user, activeView, onNavigate }: { user: AuthUser; activeView: DashboardView; onNavigate: (view: DashboardView) => void }) {
  const storesActive = activeView.name.startsWith('store');
  const productsActive = activeView.name.startsWith('product');

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <button
        className={activeView.name === 'overview' ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'overview' })}
      >
        Overview
      </button>
      <button
        className={storesActive ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'stores' })}
      >
        Stores
      </button>
      <button
        className={productsActive ? 'nav-button nav-button-active' : 'nav-button'}
        type="button"
        onClick={() => onNavigate({ name: 'products' })}
      >
        Products
      </button>
      {user.role === 'admin' ? (
        <>
          <button className="nav-button" type="button" onClick={() => onNavigate({ name: 'store-create' })}>
            Create store
          </button>
          <button
            className={activeView.name === 'global-logs' ? 'nav-button nav-button-active' : 'nav-button'}
            type="button"
            onClick={() => onNavigate({ name: 'global-logs' })}
          >
            Global Logs
          </button>
          <button
            className={activeView.name === 'users-access' ? 'nav-button nav-button-active' : 'nav-button'}
            type="button"
            onClick={() => onNavigate({ name: 'users-access' })}
          >
            Users & Access
          </button>
        </>
      ) : (
        <span className="nav-note">Operator navigation: assigned stores only</span>
      )}
    </nav>
  );
}

function StoresList({ user, onNavigate }: { user: AuthUser; onNavigate: (view: DashboardView) => void }) {
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
          <p className="eyebrow">{user.role === 'admin' ? 'Admin stores' : 'Assigned stores'}</p>
          <h2 id="stores-title">Stores</h2>
          <p className="muted">
            {user.role === 'admin'
              ? 'Admins can see every non-archived store and manage store records.'
              : 'Operators see only stores assigned to their account.'}
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          {user.role === 'admin' && (
            <button type="button" onClick={() => onNavigate({ name: 'store-create' })}>
              Create store
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="status status-loading">Loading stores via RTK Query...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && stores.length === 0 && <div className="empty-state">No stores available.</div>}

      {stores.length > 0 && (
        <div className="store-list" data-testid="stores-list">
          {stores.map((store) => (
            <article className="store-card" key={store.id}>
              <div>
                <p className="store-code">{store.code}</p>
                <h3>{store.name}</h3>
                <p className="muted">{store.address || 'No address'} · {store.timezone}</p>
              </div>
              <div className="store-actions">
                <span className={`badge badge-${store.status}`}>{store.status}</span>
                <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-details', storeId: store.id })}>
                  Details
                </button>
                {user.role === 'admin' && (
                  <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-edit', storeId: store.id })}>
                    Edit
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
  function setFilter(key: keyof LogsFilters, value: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="logs-filters" aria-label="Logs filters">
      {showStoreFilter && (
        <label>
          Store
          <select value={filters.storeId ?? ''} onChange={(event) => setFilter('storeId', event.target.value)}>
            <option value="">All stores</option>
            {(stores ?? []).map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Entity type
        <input value={filters.entityType ?? ''} onChange={(event) => setFilter('entityType', event.target.value)} placeholder="product, store, scale_device…" />
      </label>
      <label>
        Action / audit status
        <input value={filters.action ?? ''} onChange={(event) => setFilter('action', event.target.value)} placeholder="created, updated, login…" />
      </label>
      <label>
        Sync status
        <select value={filters.status ?? ''} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Any sync status</option>
          {scaleSyncStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <label>
        From date
        <input type="date" value={filters.dateFrom ?? ''} onChange={(event) => setFilter('dateFrom', event.target.value)} />
      </label>
      <label>
        To date
        <input type="date" value={filters.dateTo ?? ''} onChange={(event) => setFilter('dateTo', event.target.value)} />
      </label>
      <button className="secondary-button" type="button" onClick={() => onChange({})}>Clear filters</button>
    </div>
  );
}

function LogsTables({ auditLogs, scaleSyncLogs }: { auditLogs: AuditLogEntry[]; scaleSyncLogs: ScaleSyncLogEntry[] }) {
  return (
    <div className="logs-grid">
      <section className="logs-card" aria-labelledby="audit-logs-title">
        <h4 id="audit-logs-title">AuditLog entries</h4>
        {auditLogs.length === 0 ? <div className="empty-state">No audit logs for the selected filters.</div> : (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr><th>Time</th><th>Store</th><th>Actor</th><th>Entity</th><th>Action</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.store ? `${log.store.code} · ${log.store.name}` : 'Global'}</td>
                    <td>{log.actor ? (log.actor.fullName || log.actor.email) : 'System'}</td>
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
        <h4 id="sync-logs-title">ScaleSyncLog entries</h4>
        {scaleSyncLogs.length === 0 ? <div className="empty-state">No scale sync logs for the selected filters.</div> : (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr><th>Time</th><th>Store</th><th>Scale</th><th>Status</th><th>Versions / error</th></tr>
              </thead>
              <tbody>
                {scaleSyncLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.store ? `${log.store.code} · ${log.store.name}` : '—'}</td>
                    <td>{log.scaleDevice ? `${log.scaleDevice.deviceCode} · ${log.scaleDevice.name}` : 'Unknown scale'}</td>
                    <td><span className={`badge ${log.status === 'error' || log.status === 'auth_failed' ? 'badge-danger' : 'badge-neutral'}`}>{log.status}</span></td>
                    <td>
                      <span className="muted block">requested: {log.requestedVersionId ?? '—'}</span>
                      <span className="muted block">delivered: {log.deliveredVersionId ?? '—'}</span>
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
  const [filters, setFilters] = useState<LogsFilters>({});
  const { data: storesData } = useListStoresQuery(undefined, { skip: user.role !== 'admin' });
  const { data, error, isLoading, isFetching, refetch } = useListGlobalLogsQuery(filters, { skip: user.role !== 'admin' });
  const errorMessage = error && 'message' in error ? error.message : null;

  if (user.role !== 'admin') {
    return <AccessDeniedPanel route="global-logs" />;
  }

  return (
    <section className="panel" aria-labelledby="global-logs-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Admin only</p>
          <h2 id="global-logs-title">Global Logs</h2>
          <p className="muted">Read-only AuditLog and ScaleSyncLog activity. Sensitive payload fields are not exposed.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing...' : 'Refresh logs'}</button>
      </div>
      <LogsFiltersForm filters={filters} onChange={setFilters} stores={storesData?.stores ?? []} showStoreFilter />
      {isLoading && <div className="status status-loading">Loading logs...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {data && <LogsTables auditLogs={data.auditLogs} scaleSyncLogs={data.scaleSyncLogs} />}
    </section>
  );
}

function StoreLogsTab({ storeId }: { storeId: string }) {
  const [filters, setFilters] = useState<LogsFilters>({});
  const { data, error, isLoading, isFetching, refetch } = useListStoreLogsQuery({ storeId, filters });
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="logs-tab" aria-labelledby="store-logs-title">
      <div className="panel-heading logs-heading">
        <div>
          <p className="eyebrow">Store logs</p>
          <h3 id="store-logs-title">Logs</h3>
          <p className="muted">Activity scoped to this store. Operators only reach stores assigned to them.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing...' : 'Refresh logs'}</button>
      </div>
      <LogsFiltersForm filters={filters} onChange={setFilters} />
      {isLoading && <div className="status status-loading">Loading store logs...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {data && <LogsTables auditLogs={data.auditLogs} scaleSyncLogs={data.scaleSyncLogs} />}
    </section>
  );
}

function StoreDetails({ user, storeId, onNavigate }: { user: AuthUser; storeId: string; onNavigate: (view: DashboardView) => void }) {
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
    return <RouteNotFoundPanel returnTo="stores" message="The store link is empty or malformed. Open a store from the list instead." onNavigate={onNavigate} />;
  }

  return (
    <section className="panel store-details-panel" aria-labelledby="store-details-title">
      <button className="link-button" type="button" onClick={() => onNavigate({ name: 'stores' })}>
        ← Back to stores
      </button>
      {isLoading && <div className="status status-loading">Loading store details...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {versionsErrorMessage && <div className="form-error" role="alert">{versionsErrorMessage}</div>}
      {store && (
        <>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Store details</p>
              <h2 id="store-details-title">{store.name}</h2>
              <p className="muted">{store.code}</p>
            </div>
            <div className="action-row">
              <span className={`badge badge-${store.status}`}>{store.status}</span>
              {user.role === 'admin' && (
                <button type="button" onClick={() => onNavigate({ name: 'store-edit', storeId: store.id })}>
                  Edit store
                </button>
              )}
            </div>
          </div>
          <dl className="details-grid">
            <div><dt>Address</dt><dd>{store.address || '—'}</dd></div>
            <div><dt>Timezone</dt><dd>{store.timezone}</dd></div>
            <div><dt>Published catalog</dt><dd>{versionsLoading ? 'Loading…' : formatVersionLabel(currentVersion)}</dd></div>
            <div><dt>Created</dt><dd>{new Date(store.createdAt).toLocaleString()}</dd></div>
            <div><dt>Updated</dt><dd>{new Date(store.updatedAt).toLocaleString()}</dd></div>
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
  const { data, error, isLoading, isFetching, refetch } = useListAdvertisingBannersQuery(storeId);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [uploadBannerImage, { isLoading: uploading }] = useUploadBannerImageMutation();
  const [createBanner, { isLoading: creating }] = useCreateAdvertisingBannerMutation();
  const [updateStatus, { isLoading: changingStatus }] = useUpdateAdvertisingBannerStatusMutation();
  const [reorderBanners, { isLoading: reordering }] = useReorderAdvertisingBannersMutation();
  const [newStatus, setNewStatus] = useState<BannerStatus>('active');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const banners = data?.banners ?? [];
  const busy = uploading || creating || changingStatus || reordering;
  const listError = error && 'message' in error ? error.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error('Не удалось подготовить защищённое действие. Повторите попытку.');
    }
    return csrfData;
  }

  function validateBannerFile(file: File): string | null {
    const filename = file.name.toLowerCase();
    const hasSupportedExtension = supportedBannerExtensions.some((extension) => filename.endsWith(extension));
    const hasSupportedMimeType = file.type === '' || supportedBannerMimeTypes.has(file.type);

    if (!hasSupportedExtension || !hasSupportedMimeType) {
      return 'Unsupported banner format. Upload JPG, PNG or WebP.';
    }

    if (file.size > maxBannerImageBytes) {
      return 'Banner image is too large. Upload an image up to 2 MB.';
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
        sortOrder: banners.length,
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setActionNotice('Banner uploaded and added. Publish a new catalog version to send this change to scales.');
    } catch (uploadError) {
      setActionError(errorMessageFromUnknown(uploadError, 'Banner could not be uploaded.'));
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
      setActionNotice('Banner status changed. Publish a new catalog version to send this change to scales.');
    } catch (statusError) {
      setActionError(errorMessageFromUnknown(statusError, 'Banner status could not be changed.'));
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
      setActionNotice('Banner order changed. Publish a new catalog version to send this change to scales.');
    } catch (reorderError) {
      setActionError(errorMessageFromUnknown(reorderError, 'Banner order could not be changed.'));
    }
  }

  return (
    <section className="advertising-tab" aria-labelledby="advertising-title">
      <div className="panel-heading advertising-heading">
        <div>
          <p className="eyebrow">Advertising tab</p>
          <h3 id="advertising-title">Advertising banners</h3>
          <p className="muted">Upload JPG, PNG or WebP banners up to 2 MB.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh banners'}
        </button>
      </div>

      <div className="status status-warning publication-required" role="note">
        Banner uploads, status changes and order changes require a new catalog publication before scales receive them.
      </div>

      {listError && <div className="form-error" role="alert">{listError}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {actionNotice && <div className="status status-ok">{actionNotice}</div>}
      {isLoading && <div className="status status-loading">Loading advertising banners...</div>}

      <div className="banner-upload-card">
        <label>
          New banner status
          <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as BannerStatus)} disabled={busy}>
            {bannerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          Upload banner image
          <input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={handleBannerUpload} type="file" />
        </label>
      </div>

      {!isLoading && banners.length === 0 && <div className="empty-state">No advertising banners yet.</div>}

      {banners.length > 0 && (
        <div className="banner-table-wrap">
          <table className="banner-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Status</th>
                <th>Order</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((banner, index) => (
                <tr key={banner.id}>
                  <td>
                    <div className="banner-preview">
                      <img src={banner.imageUrl} alt="Advertising banner preview" />
                      <small>{banner.imageUrl}</small>
                    </div>
                  </td>
                  <td>
                    <select
                      aria-label={`Status for banner ${banner.id}`}
                      value={banner.status}
                      onChange={(event) => handleStatusChange(banner, event.target.value as BannerStatus)}
                      disabled={busy}
                    >
                      {bannerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>#{banner.sortOrder}</td>
                  <td>{new Date(banner.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button className="secondary-button table-action" type="button" disabled={busy || index === 0} onClick={() => moveBanner(index, -1)}>Move up</button>
                      <button className="secondary-button table-action" type="button" disabled={busy || index === banners.length - 1} onClick={() => moveBanner(index, 1)}>Move down</button>
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
    take: 10,
  });
  const selectableProducts = (productsData?.products ?? []).filter((product) => product.status === 'active' && !product.unavailableForNewActivePlacements);
  const selectedProduct = selectableProducts.find((product) => product.id === selectedProductId) ?? null;
  const placementBusy = creatingPlacement || movingPlacement || reorderingPlacements;
  const errorMessage = error && 'message' in error ? error.message : null;
  const placementsErrorMessage = placementsError && 'message' in placementsError ? placementsError.message : null;

  async function getCsrfOrThrow() {
    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      throw new Error('Не удалось подготовить защищённую форму. Повторите попытку.');
    }
    return csrfData;
  }

  function categoryPayload(form: CategoryFormState, includeParent: boolean) {
    const name = form.name.trim();
    const shortName = form.shortName.trim();
    if (!name) {
      throw new Error('Category name is required.');
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
      setActionNotice('Root category created.');
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, 'Category could not be created.'));
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
      setActionNotice('Child category created.');
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, 'Child category could not be created.'));
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
      const confirmed = window.confirm('Archiving this category can affect active products: archived/inactive categories cannot accept active placements. Continue?');
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
      setActionNotice('Category updated.');
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, 'Category could not be updated.'));
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
      setActionNotice('Category order updated.');
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, 'Category order could not be updated.'));
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
      setActionError('Choose an active category that can accept placements.');
      return;
    }
    if (!selectedProduct) {
      setActionError('Choose an active product from the master catalog.');
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
      setActionNotice(`${selectedProduct.name} added to ${selectedCategory.name}.`);
    } catch (error) {
      const existingPlacement = existingPlacementFromError(error);
      if (existingPlacement) {
        const confirmed = window.confirm(
          `This product is already actively placed in ${existingPlacement.category?.name ?? 'another category'}. Move it to ${selectedCategory.name}?`,
        );
        if (!confirmed) {
          setActionError(errorMessageFromUnknown(error, 'Product already has an active placement in this catalog.'));
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
          setActionNotice(`${selectedProduct.name} moved to ${selectedCategory.name}.`);
        } catch (moveError) {
          setActionError(errorMessageFromUnknown(moveError, 'Product placement could not be moved.'));
        }
        return;
      }
      setActionError(errorMessageFromUnknown(error, 'Product placement could not be created.'));
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
      setActionNotice('Product order updated.');
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, 'Product order could not be updated.'));
    }
  }

  return (
    <section className="catalog-tab" aria-labelledby="catalog-title">
      <div className="panel-heading catalog-heading">
        <div>
          <p className="eyebrow">Catalog tab</p>
          <h3 id="catalog-title">Active catalog categories</h3>
          <p className="muted">Manage the category tree used by prices, product placements and publishing.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh catalog'}
        </button>
      </div>

      {data?.catalog && (
        <div className="catalog-summary">
          <strong>{data.catalog.name}</strong>
          <span className={`badge badge-${data.catalog.status}`}>{data.catalog.status}</span>
          <small>Catalog ID: <code>{data.catalog.id}</code></small>
        </div>
      )}

      <form className="category-form category-root-form" onSubmit={handleCreateRoot}>
        <CategoryFields form={rootForm} onChange={setRootForm} />
        <button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create root category'}</button>
      </form>

      <div className="status status-warning category-archive-warning">
        Archiving warning: categories with status archived or inactive cannot accept active product placements. If active products are already placed here, validation/publishing can be blocked until placements are moved or deactivated.
      </div>

      <section className="placement-panel" aria-labelledby="placements-title">
        <div className="panel-heading placement-heading">
          <div>
            <p className="eyebrow">Product placements</p>
            <h4 id="placements-title">Products in selected category</h4>
            <p className="muted">Search active master products, add them to active categories, and reorder by sortOrder.</p>
          </div>
          {placementsFetching && <span className="muted">Refreshing placements…</span>}
        </div>

        <form className="placement-form" onSubmit={handleAddPlacement}>
          <label>
            Category
            <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={placementBusy || activeCategoryOptions.length === 0}>
              {activeCategoryOptions.length === 0 && <option value="">No active categories available</option>}
              {activeCategoryOptions.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            Search product
            <input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setSelectedProductId('');
              }}
              placeholder="Name, PLU, barcode or SKU"
            />
          </label>
          <label>
            Product
            <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} disabled={placementBusy || selectableProducts.length === 0}>
              <option value="">{productsFetching ? 'Searching…' : 'Choose active product'}</option>
              {selectableProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.defaultPluCode} · {product.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={placementBusy || !selectedCategory || !selectedProduct}>
            {creatingPlacement || movingPlacement ? 'Saving placement…' : 'Add to category'}
          </button>
        </form>
        <p className="muted">Archived/inactive products and archived/inactive categories are intentionally unavailable for active placements.</p>

        {placementsErrorMessage && <div className="form-error" role="alert">{placementsErrorMessage}</div>}
        {placementsLoading && <div className="status status-loading">Loading category products...</div>}
        {!selectedCategoryId && <div className="empty-state">Create or activate a category before adding products.</div>}
        {selectedCategoryId && !placementsLoading && placements.length === 0 && <div className="empty-state">No active products in this category yet.</div>}
        {placements.length > 0 && (
          <ul className="placement-list">
            {placements.map((placement, index) => (
              <li key={placement.id} className="placement-card">
                <div>
                  <strong>{placement.product?.name ?? placement.productId}</strong>
                  <p className="muted">
                    PLU {placement.product?.defaultPluCode ?? '—'} · Order: {placement.sortOrder} · <span className={`badge badge-${placement.status}`}>{placement.status}</span>
                  </p>
                  {placement.product?.status !== 'active' && <span className="price-warning">Product is no longer active</span>}
                </div>
                <div className="category-actions">
                  <button className="secondary-button" type="button" onClick={() => moveProductPlacement(placement, -1)} disabled={placementBusy || index === 0}>↑</button>
                  <button className="secondary-button" type="button" onClick={() => moveProductPlacement(placement, 1)} disabled={placementBusy || index === placements.length - 1}>↓</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionNotice && <div className="status status-ok" role="status">{actionNotice}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {isLoading && <div className="status status-loading">Loading active catalog categories...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && categories.length === 0 && <div className="empty-state">No categories yet. Create the first root category above.</div>}
      {categories.length > 0 && (
        <div className="category-tree" role="tree" aria-label="Active catalog category tree">
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
  return (
    <ul className="category-list">
      {categories.map((category, index) => (
        <li className="category-node" key={category.id} role="treeitem" aria-expanded={category.children.length > 0}>
          <div className={category.status === 'archived' ? 'category-card category-card-archived' : 'category-card'}>
            {editingId === category.id ? (
              <form className="category-edit-form" onSubmit={(event) => onUpdate(category, event)}>
                <CategoryFields form={editForm} onChange={onEditFormChange} showParent allCategories={allCategories} currentCategory={category} />
                <div className="category-actions">
                  <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save category'}</button>
                  <button className="secondary-button" type="button" onClick={onCancelEdit}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="category-card-main">
                  <div>
                    <div className="category-title-row">
                      <strong>{category.name}</strong>
                      <span className={`badge badge-${category.status}`}>{category.status}</span>
                      {!category.canAcceptActivePlacements && <span className="price-warning">No active placements</span>}
                    </div>
                    <p className="muted">Short: {category.shortName} · Order: {category.sortOrder}</p>
                    <small><code>{category.id}</code></small>
                  </div>
                  <div className="category-actions">
                    <button className="secondary-button" type="button" onClick={() => onMove(category, categories, -1)} disabled={busy || index === 0}>↑</button>
                    <button className="secondary-button" type="button" onClick={() => onMove(category, categories, 1)} disabled={busy || index === categories.length - 1}>↓</button>
                    <button className="secondary-button" type="button" onClick={() => onSelectCategory(category)} disabled={busy || !category.canAcceptActivePlacements || category.status !== 'active'}>{selectedCategoryId === category.id ? 'Selected' : 'Manage products'}</button>
                    <button className="secondary-button" type="button" onClick={() => onAddChild(category)} disabled={busy}>Add child</button>
                    <button type="button" onClick={() => onEdit(category)} disabled={busy}>Edit</button>
                  </div>
                </div>
                {childParentId === category.id && (
                  <form className="category-form category-child-form" onSubmit={onCreateChild}>
                    <CategoryFields form={childForm} onChange={onChildFormChange} />
                    <div className="category-actions">
                      <button type="submit" disabled={busy}>{busy ? 'Creating...' : `Create child of ${category.name}`}</button>
                      <button className="secondary-button" type="button" onClick={onCancelChild}>Cancel</button>
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
  const descendantIds = useMemo(() => currentCategory ? collectDescendantIds(currentCategory) : new Set<string>(), [currentCategory]);
  const parentOptions = allCategories.filter((category) => category.id !== currentCategory?.id && !descendantIds.has(category.id));

  return (
    <div className="category-fields">
      <label>
        Name
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Bakery" />
      </label>
      <label>
        Short name
        <input value={form.shortName} onChange={(event) => onChange({ ...form, shortName: event.target.value })} placeholder="Optional display name" />
      </label>
      <label>
        Status
        <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as CategoryStatus })}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="archived">archived</option>
        </select>
      </label>
      {showParent && (
        <label>
          Parent
          <select value={form.parentId} onChange={(event) => onChange({ ...form, parentId: event.target.value })}>
            <option value="">Root level</option>
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
      throw new Error('Не удалось подготовить защищённую форму. Повторите попытку.');
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
      setFormError('Device code and name are required.');
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
        : 'Scale device could not be registered.';
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
        : 'Scale device could not be blocked.';
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
        : 'Scale device token could not be regenerated.';
      setActionError(message);
    }
  }

  return (
    <section className="scale-devices-tab" aria-labelledby="scale-devices-title">
      <div className="panel-heading scale-devices-heading">
        <div>
          <p className="eyebrow">Scale Devices</p>
          <h3 id="scale-devices-title">Store scale devices</h3>
          <p className="muted">{isAdmin ? 'Register devices, block access and rotate API tokens.' : 'Publication and sync status for this store.'}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh devices'}
        </button>
      </div>

      {isAdmin && (
        <form className="scale-device-form" onSubmit={handleCreate}>
          <label>
            Device code
            <input value={deviceCode} onChange={(event) => setDeviceCode(event.target.value)} placeholder="SCALE-001" />
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Front counter scale" />
          </label>
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Optional model" />
          </label>
          <button type="submit" disabled={creating}>{creating ? 'Registering...' : 'Register device'}</button>
        </form>
      )}

      {formError && <div className="form-error" role="alert">{formError}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {issuedToken && (
        <div className="token-notice" role="status">
          <strong>API token {issuedToken.action === 'created' ? 'created' : 'regenerated'} for {issuedToken.deviceCode}.</strong>
          <span>Copy it now. This plain token is shown only once and is not stored in the UI.</span>
          <code>{issuedToken.apiToken}</code>
          <button className="secondary-button" type="button" onClick={() => setIssuedToken(null)}>Hide token</button>
        </div>
      )}

      {isLoading && <div className="status status-loading">Loading scale devices...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && devices.length === 0 && <div className="empty-state">No scale devices registered for this store.</div>}
      {devices.length > 0 && (
        <div className="scale-device-table-wrap">
          <table className="scale-device-table">
            <thead>
              <tr>
                <th>Device code</th>
                {isAdmin && <th>Name</th>}
                {isAdmin && <th>Model</th>}
                <th>Status</th>
                <th>Last seen</th>
                <th>Last sync</th>
                <th>Catalog version</th>
                <th>Sync status</th>
                {isAdmin && <th>Actions</th>}
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
                      {isOutdated && <span className="sync-note">Not updated to current version</span>}
                    </td>
                    <td><ScaleSyncStatusCell device={device} /></td>
                    {isAdmin && (
                      <td>
                        <div className="table-actions">
                          <button className="secondary-button" type="button" onClick={() => handleBlock(device)} disabled={updatingStatus || device.status === 'blocked'}>
                            {device.status === 'blocked' ? 'Blocked' : 'Block'}
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleRegenerate(device)} disabled={regenerating}>
                            Regenerate token
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
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function ScaleSyncStatusCell({ device }: { device: ScaleDevice }) {
  if (device.lastSyncError) {
    return (
      <div className="sync-status sync-status-error">
        <span className="badge badge-sync-error">{device.lastSyncError.status}</span>
        <small>{device.lastSyncError.message || 'Scale reported a synchronization error.'}</small>
        <small>{formatDateTime(device.lastSyncError.createdAt)}</small>
      </div>
    );
  }

  return (
    <div className="sync-status">
      <span className={`badge badge-sync-${device.lastSyncStatus ?? 'unknown'}`}>{device.lastSyncStatus ?? 'no sync yet'}</span>
    </div>
  );
}

function formatVersionLabel(version: CatalogVersionHistoryItem | null | undefined) {
  if (!version) {
    return 'No published version';
  }

  return `v${version.versionNumber} (${version.id})`;
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

function shortChecksum(value: string | null | undefined) {
  return value ? `${value.slice(0, 12)}…` : '—';
}

function PublishingTab({ storeId, userRole, currentVersion }: { storeId: string; userRole: AuthUser['role']; currentVersion: CatalogVersionHistoryItem | null }) {
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
      throw new Error('Не удалось подготовить защищённую форму. Повторите попытку.');
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
        : 'Catalog validation could not be completed.';
      setActionError(message);
    }
  }

  async function handlePublish() {
    setActionError(null);

    if (!canPublish) {
      setActionError('Run validation and resolve blocking errors before publishing.');
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
        : 'Catalog could not be published.';
      setActionError(message);
    }
  }

  return (
    <section className="publishing-tab" aria-labelledby="publishing-title">
      <div className="panel-heading publishing-heading">
        <div>
          <p className="eyebrow">Versions / Publishing</p>
          <h3 id="publishing-title">Validate and publish catalog versions</h3>
          <p className="muted">After a catalog is published, later changes require a new validation and a new version.</p>
        </div>
        {isAdmin && (
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={handleValidate} disabled={validating || publishing}>
              {validating ? 'Validating...' : 'Run validation'}
            </button>
            <button type="button" onClick={handlePublish} disabled={publishing || validating || !canPublish}>
              {publishing ? 'Publishing...' : 'Publish catalog'}
            </button>
          </div>
        )}
      </div>

      <div className="publication-status-card">
        <strong>Current published catalog</strong>
        <span>{formatVersionLabel(displayedCurrentVersion)}</span>
        {displayedCurrentVersion?.publishedAt && <small>Published at {formatDateTime(displayedCurrentVersion.publishedAt)}</small>}
      </div>

      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {lastPublished && (
        <div className="status status-ok" role="status">
          Published version <strong>v{lastPublished.versionNumber}</strong> at {formatDateTime(lastPublished.publishedAt)}.
        </div>
      )}

      {isAdmin && validation ? (
        <div className="validation-grid">
          <div className={`validation-summary ${validation.canPublish ? 'validation-summary-ok' : 'validation-summary-blocked'}`}>
            <strong>{validation.canPublish ? 'Ready to publish' : 'Publication blocked'}</strong>
            <span>{validation.blockingErrors.length} blocking errors · {validation.warnings.length} warnings</span>
            <span>{validation.summary.categoryCount} categories · {validation.summary.activePlacementCount} active products · {validation.summary.activeBannerCount} active banners</span>
          </div>
          <IssueList title="Blocking errors" issues={validation.blockingErrors} emptyText="No blocking errors found." tone="error" />
          <IssueList title="Warnings" issues={validation.warnings} emptyText="No warnings found." tone="warning" />
        </div>
      ) : isAdmin ? (
        <div className="empty-state">Run validation to see blocking errors, warnings and publishing readiness.</div>
      ) : (
        <div className="empty-state">Operators can monitor the published version and scale sync status. Publishing controls are admin-only.</div>
      )}

      <div className="version-history-heading">
        <div>
          <h4>Version history</h4>
          <p className="muted">Published versions include version number, publication date, publisher and package checksum.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={versionsFetching}>
          {versionsFetching ? 'Refreshing...' : 'Refresh history'}
        </button>
      </div>

      {versionsLoading && <div className="status status-loading">Loading version history...</div>}
      {versionsErrorMessage && <div className="form-error" role="alert">{versionsErrorMessage}</div>}
      {!versionsLoading && !versionsErrorMessage && versions.length === 0 && <div className="empty-state">No published versions yet.</div>}
      {versions.length > 0 && (
        <div className="version-table-wrap">
          <table className="version-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Published at</th>
                <th>Published by</th>
                <th>Checksum</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>v{version.versionNumber}</td>
                  <td>{formatDateTime(version.publishedAt)}</td>
                  <td>{version.publishedBy ?? 'System'}</td>
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
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [missingPrice, setMissingPrice] = useState<'all' | 'missing' | 'priced'>('all');
  const missingPriceFilter = missingPrice === 'all' ? '' : missingPrice === 'missing';
  const { data, error, isLoading, isFetching, refetch } = useListStorePricesQuery({
    storeId,
    search,
    categoryId,
    missingPrice: missingPriceFilter,
  });
  const { data: unfilteredData } = useListStorePricesQuery({ storeId });
  const prices = data?.prices ?? [];
  const categoryOptions = useMemo(() => {
    const byId = new Map<string, PriceRow['category']>();
    for (const row of unfilteredData?.prices ?? prices) {
      byId.set(row.category.id, row.category);
    }
    return [...byId.values()].sort((first, second) => first.name.localeCompare(second.name));
  }, [prices, unfilteredData?.prices]);
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="prices-tab" aria-labelledby="prices-title">
      <div className="panel-heading prices-heading">
        <div>
          <p className="eyebrow">Prices tab</p>
          <h3 id="prices-title">Store product prices</h3>
          <p className="muted">Products from the active catalog for this store.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh prices'}
        </button>
      </div>

      <div className="price-filters">
        <label>
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, short name, PLU, SKU or barcode"
          />
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          Price status
          <select value={missingPrice} onChange={(event) => setMissingPrice(event.target.value as 'all' | 'missing' | 'priced')}>
            <option value="all">All products</option>
            <option value="missing">Missing price only</option>
            <option value="priced">With price only</option>
          </select>
        </label>
      </div>

      {isLoading && <div className="status status-loading">Loading active catalog prices...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && prices.length === 0 && <div className="empty-state">No products match these price filters.</div>}
      {prices.length > 0 && (
        <div className="price-table-wrap">
          <table className="price-table">
            <thead>
              <tr>
                <th>Product name</th>
                <th>Short name</th>
                <th>PLU</th>
                <th>SKU/barcode</th>
                <th>Category</th>
                <th>Current price</th>
                <th>Unit</th>
                <th>Status</th>
                <th>UpdatedAt</th>
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
      setRowError('Enter a price greater than 0.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setRowError('Не удалось подготовить защищённую форму. Повторите попытку.');
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
        : 'Price could not be saved.';
      setRowError(message);
    }
  }

  return (
    <tr className={rowClassName}>
      <td>
        <strong>{row.product.name}</strong>
        {row.missingPrice && <span className="price-warning">No price</span>}
        {(hasInvalidPrice || hasInvalidSavedPrice) && <span className="price-warning">Invalid price</span>}
      </td>
      <td>{row.product.shortName}</td>
      <td>{row.product.defaultPluCode}</td>
      <td>{[row.product.sku, row.product.barcode].filter(Boolean).join(' / ') || '—'}</td>
      <td>{row.category.name}</td>
      <td>
        <form className="inline-price-form" onSubmit={handleSubmit}>
          <input
            aria-label={`Price for ${row.product.name}`}
            inputMode="decimal"
            min="0.01"
            onChange={(event) => setPriceValue(event.target.value)}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={priceValue}
          />
          <select
            aria-label={`Currency for ${row.product.name}`}
            disabled={currencyLocked}
            onChange={(event) => setCurrency(event.target.value as AllowedCurrency)}
            value={currency}
          >
            {ALLOWED_CURRENCIES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <button type="submit" disabled={isLoading || hasInvalidPrice || !isDirty}>
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </form>
        {rowError && <div className="inline-error" role="alert">{rowError}</div>}
      </td>
      <td>{row.product.unit}</td>
      <td><span className={`badge badge-${row.product.status}`}>{row.product.status}</span></td>
      <td>{row.currentPrice ? new Date(row.currentPrice.updatedAt).toLocaleString() : '—'}</td>
    </tr>
  );
}


function ProductsPage({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const { data, error, isLoading, isFetching, refetch } = useListProductsQuery({ search, status, take: 100 });
  const products = data?.products ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <section className="panel" aria-labelledby="products-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Products</p>
          <h2 id="products-title">Product catalog</h2>
          <p className="muted">Search and manage PLU-backed products available to catalogs and prices.</p>
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={() => onNavigate({ name: 'product-create' })}>Create product</button>
        </div>
      </div>

      <form className="product-search" onSubmit={handleSearch}>
        <label>
          Search
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name, short name, PLU, SKU or barcode" />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as ProductStatus | 'all')}>
            <option value="all">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>

      {isLoading && <div className="status status-loading">Loading products...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && products.length === 0 && <div className="empty-state">No products found.</div>}

      {products.length > 0 && (
        <div className="product-table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>PLU</th>
                <th>Name</th>
                <th>Short name</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Actions</th>
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
                  <td>{product.unit}</td>
                  <td><span className={`badge badge-${product.status}`}>{product.status}</span></td>
                  <td>
                    <button className="secondary-button table-action" type="button" onClick={() => onNavigate({ name: 'product-edit', productId: product.id })}>
                      Edit
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
      setUploadError('GIF images are not supported. Upload JPG, PNG or WebP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Image file is too large. Upload an image up to 2 MB.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setUploadError('Не удалось подготовить защищённую загрузку. Повторите попытку.');
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
      setUploadNotice(`Uploaded ${response.fileAsset.originalFileName}. Save the product to persist the image URL.`);
    } catch (error) {
      setUploadError(errorMessageFromUnknown(error, 'Image could not be uploaded.'));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setWarning(null);
    setSavedProduct(null);

    if (!values.defaultPluCode.trim() || !values.name.trim() || !values.shortName.trim() || !values.unit || !values.status) {
      setFormError('defaultPluCode, name, shortName, unit and status are required.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError('Не удалось подготовить защищённую форму. Повторите попытку.');
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
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Product could not be saved.';
      setFormError(message);
    }
  }

  return (
    <section className="panel" aria-labelledby="product-form-title">
      <button className="link-button" type="button" onClick={onCancel}>← Back to products</button>
      <p className="eyebrow">{mode === 'create' ? 'Create product' : 'Edit product'}</p>
      <h2 id="product-form-title">{mode === 'create' ? 'New product' : product?.name}</h2>

      {mode === 'edit' && existingPlacementCount > 0 && (
        <div className="status status-warning" role="status">
          This product is used in {existingPlacementCount} active catalog placement{existingPlacementCount === 1 ? '' : 's'}. Editing it may affect catalog consumers.
        </div>
      )}
      {warning && (
        <div className="status status-warning" role="alert">
          {warning.message} {warning.activePlacementCount ? `Active placements: ${warning.activePlacementCount}.` : ''}
          <div className="action-row"><button type="button" onClick={() => savedProduct && onSaved(savedProduct)}>Back to products</button></div>
        </div>
      )}

      <form className="product-form" onSubmit={handleSubmit}>
        <div className="product-form-grid">
          <label>PLU / defaultPluCode *<input value={values.defaultPluCode} onChange={(event) => updateValue('defaultPluCode', event.target.value)} placeholder="1001" /></label>
          <label>Name *<input value={values.name} onChange={(event) => updateValue('name', event.target.value)} placeholder="Bananas" /></label>
          <label>Short name *<input value={values.shortName} onChange={(event) => updateValue('shortName', event.target.value)} placeholder="Bananas" /></label>
          <label>Unit *<select value={values.unit} onChange={(event) => updateValue('unit', event.target.value as ProductUnit)}><option value="kg">kg</option><option value="g">g</option><option value="piece">piece</option></select></label>
          <label>Status *<select value={values.status} onChange={(event) => updateValue('status', event.target.value as ProductStatus)}><option value="active">active</option><option value="inactive">inactive</option><option value="archived">archived</option></select></label>
          <label>SKU<input value={values.sku ?? ''} onChange={(event) => updateValue('sku', event.target.value)} placeholder="Optional SKU" /></label>
          <label>Barcode<input value={values.barcode ?? ''} onChange={(event) => updateValue('barcode', event.target.value)} placeholder="Optional barcode" /></label>
          <label>Image URL<input value={values.imageUrl ?? ''} onChange={(event) => updateValue('imageUrl', event.target.value)} placeholder="Optional image URL" /></label>
        </div>
        <label>Description<input value={values.description ?? ''} onChange={(event) => updateValue('description', event.target.value)} placeholder="Optional description" /></label>
        <div className="product-image-upload">
          <label>
            Product image upload
            <input accept="image/png,image/jpeg,image/webp" disabled={uploadingImage || isSaving} onChange={handleImageUpload} type="file" />
          </label>
          <p className="muted">Upload JPG, PNG or WebP up to 2 MB. The uploaded public URL is saved to Image URL when you save the product.</p>
          {values.imageUrl && (
            <div className="product-image-preview">
              <img src={values.imageUrl} alt="Selected product" />
              <div>
                <strong>Selected image</strong>
                <small>{values.imageUrl}</small>
              </div>
            </div>
          )}
          {uploadingImage && <div className="status status-loading">Uploading image...</div>}
          {uploadNotice && <div className="status status-ok" role="status">{uploadNotice}</div>}
          {uploadError && <div className="form-error" role="alert">{uploadError}</div>}
        </div>

        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="action-row">
          <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save product'}</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

function ProductEditRoute({ productId, onNavigate }: { productId: string; onNavigate: (view: DashboardView) => void }) {
  const hasValidProductId = isValidRouteId(productId);
  const { currentData, error, isLoading } = useGetProductQuery(productId, {
    skip: !hasValidProductId,
  });
  const errorMessage = error && 'message' in error ? error.message : null;

  if (!hasValidProductId) {
    return <RouteNotFoundPanel returnTo="products" message="The product edit link is empty or malformed. Open a product from the list instead." onNavigate={onNavigate} />;
  }

  if (isLoading) {
    return <section className="panel"><div className="status status-loading">Loading product for editing...</div></section>;
  }

  if (errorMessage || !currentData?.product) {
    return <section className="panel"><div className="form-error" role="alert">{errorMessage ?? 'Product not found.'}</div></section>;
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
      setFormError('Store code and name are required.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError('Не удалось подготовить защищённую форму. Повторите попытку.');
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
        : 'Store could not be saved.';
      setFormError(message);
    }
  }

  return (
    <section className="panel" aria-labelledby="store-form-title">
      <button className="link-button" type="button" onClick={onCancel}>← Back to stores</button>
      <p className="eyebrow">{mode === 'create' ? 'Create store' : 'Edit store'}</p>
      <h2 id="store-form-title">{mode === 'create' ? 'New store' : store?.name}</h2>

      <form className="store-form" onSubmit={handleSubmit}>
        <label>
          Store code
          <input value={values.code} onChange={(event) => updateValue('code', event.target.value)} placeholder="STORE-002" />
        </label>
        <label>
          Store name
          <input value={values.name} onChange={(event) => updateValue('name', event.target.value)} placeholder="Central Store" />
        </label>
        <label>
          Address
          <input value={values.address ?? ''} onChange={(event) => updateValue('address', event.target.value)} placeholder="City, street" />
        </label>
        <label>
          Timezone
          <input value={values.timezone ?? ''} onChange={(event) => updateValue('timezone', event.target.value)} placeholder="Europe/Moscow" />
        </label>
        <label>
          Status
          <select value={values.status} onChange={(event) => updateValue('status', event.target.value as StoreStatus)}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="archived">archived</option>
          </select>
        </label>

        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="action-row">
          <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save store'}</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

function StoreEditRoute({ storeId, onNavigate }: { storeId: string; onNavigate: (view: DashboardView) => void }) {
  const hasValidStoreId = isValidRouteId(storeId);
  const { currentData, error, isLoading } = useGetStoreQuery(storeId, {
    skip: !hasValidStoreId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });
  const errorMessage = error && 'message' in error ? error.message : null;

  if (!hasValidStoreId) {
    return <RouteNotFoundPanel returnTo="stores" message="The store edit link is empty or malformed. Open a store from the list instead." onNavigate={onNavigate} />;
  }

  if (isLoading) {
    return <section className="panel"><div className="status status-loading">Loading store for editing...</div></section>;
  }

  if (errorMessage || !currentData?.store) {
    return <section className="panel"><div className="form-error" role="alert">{errorMessage ?? 'Store not found.'}</div></section>;
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

function RouteNotFoundPanel({ returnTo, message, onNavigate }: { returnTo: 'stores' | 'products'; message: string; onNavigate: (view: DashboardView) => void }) {
  return (
    <section className="panel" aria-labelledby="route-not-found-title">
      <p className="eyebrow">Not found</p>
      <h2 id="route-not-found-title">Catalog route unavailable</h2>
      <p className="muted">{message}</p>
      <button type="button" onClick={() => onNavigate({ name: returnTo })}>
        Back to {returnTo}
      </button>
    </section>
  );
}

const accessDeniedCopy = {
  'global-logs': {
    heading: 'Global Logs is admin-only',
    description: 'Operators cannot open global audit and scale sync logs. Ask an admin if your account needs global log access.',
  },
  'users-access': {
    heading: 'Users & Access is admin-only',
    description: 'Operators cannot open user management controls. Ask an admin if your account needs additional store access.',
  },
  'store-management': {
    heading: 'Store management is admin-only',
    description: 'Operators cannot create or edit stores. Ask an admin if this store needs to be changed.',
  },
} as const;

function AccessDeniedPanel({ route }: { route: keyof typeof accessDeniedCopy }) {
  const copy = accessDeniedCopy[route];

  return (
    <section className="panel" aria-labelledby="access-denied-title">
      <p className="eyebrow">Access denied</p>
      <h2 id="access-denied-title">{copy.heading}</h2>
      <p className="muted">{copy.description}</p>
    </section>
  );
}

function getDefaultInviteExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 16);
}

function UsersAccessPage({ currentUser }: { currentUser: AuthUser }) {
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const { data, error, isLoading, isFetching, refetch } = useListUsersQuery({ includeDeleted });
  const users = data?.users ?? [];
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel" aria-labelledby="users-access-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Users & Access</p>
          <h2 id="users-access-title">Invites, roles and operator stores</h2>
          <p className="muted">Create admin/operator invites, change roles, block users and manage operator store assignments.</p>
        </div>
        <div className="action-row">
          <label className="compact-checkbox">
            <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
            Include deleted
          </label>
          <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh users'}
          </button>
        </div>
      </div>

      <InviteForm />

      {isLoading && <div className="status status-loading">Loading users...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && users.length === 0 && <div className="empty-state">No users found.</div>}
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
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AuthUser['role']>('operator');
  const [expiresAt, setExpiresAt] = useState(getDefaultInviteExpiry());
  const [formError, setFormError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ email: string; token?: string; expiresAt: string } | null>(null);
  const { data: csrf, refetch: refetchCsrf } = useGetCsrfTokenQuery();
  const [createInvite, { isLoading }] = useCreateInviteMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setCreatedInvite(null);

    if (!email.trim()) {
      setFormError('Email is required.');
      return;
    }

    const csrfData = csrf ?? (await refetchCsrf()).data;
    if (!csrfData) {
      setFormError('Не удалось подготовить защищённую форму. Повторите попытку.');
      return;
    }

    try {
      const response = await createInvite({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role,
        expiresAt: new Date(expiresAt).toISOString(),
        csrfToken: csrfData.csrfToken,
        csrfHeaderName: csrfData.headerName,
      }).unwrap();
      setCreatedInvite({ email: response.invite.email, token: response.token, expiresAt: response.invite.expiresAt });
      setEmail('');
      setFullName('');
      setRole('operator');
      setExpiresAt(getDefaultInviteExpiry());
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Invite could not be created.';
      setFormError(message);
    }
  }

  return (
    <form className="invite-form" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Create invite</p>
        <p className="muted">Send this one-time token to the invited user through a secure channel.</p>
      </div>
      <div className="invite-grid">
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operator@example.com" /></label>
        <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Optional" /></label>
        <label>Role<select value={role} onChange={(event) => setRole(event.target.value as AuthUser['role'])}><option value="operator">operator</option><option value="admin">admin</option></select></label>
        <label>Expires at<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      </div>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {createdInvite && (
        <div className="status status-ok" role="status">
          Invite for <strong>{createdInvite.email}</strong> expires {formatDateTime(createdInvite.expiresAt)}.<br />
          {createdInvite.token ? (
            <>Token: <code>{createdInvite.token}</code></>
          ) : (
            'Invite created. The invite token is not shown in production.'
          )}
        </div>
      )}
      <button type="submit" disabled={isLoading}>{isLoading ? 'Creating invite...' : 'Create invite'}</button>
    </form>
  );
}

function UserAccessCard({ user, currentUser }: { user: ManagedUser; currentUser: AuthUser }) {
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
    if (!csrfData) throw new Error('Не удалось подготовить защищённую форму. Повторите попытку.');
    return csrfData;
  }

  async function runAction(action: (csrfData: { csrfToken: string; headerName: string }) => Promise<unknown>) {
    setRowError(null);
    try {
      await action(await getCsrfOrThrow());
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'User update failed.';
      setRowError(message);
    }
  }

  return (
    <article className="user-card">
      <div className="user-card-main">
        <div>
          <p className="store-code">{user.email}</p>
          <h3>{user.fullName || 'Unnamed user'}</h3>
          <p className="muted">Created {formatDateTime(user.createdAt)} · Last login {formatDateTime(user.lastLoginAt)}</p>
        </div>
        <div className="store-actions">
          <span className={`badge ${statusClass}`}>{isDeleted ? 'deleted' : user.status}</span>
          <label className="role-control">
            Role
            <select
              value={user.role}
              disabled={isDeleted || changingRole}
              onChange={(event) => runAction((csrfData) => changeRole({ userId: user.id, role: event.target.value as AuthUser['role'], csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}
            >
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
          </label>
          {user.status === 'blocked' ? (
            <button className="secondary-button" type="button" disabled={isDeleted || unblocking} onClick={() => runAction((csrfData) => unblockUser({ userId: user.id, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}>
              {unblocking ? 'Unblocking...' : 'Unblock'}
            </button>
          ) : (
            <button className="secondary-button" type="button" disabled={isDeleted || blocking || isSelf} onClick={() => runAction((csrfData) => blockUser({ userId: user.id, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap())}>
              {blocking ? 'Blocking...' : 'Block'}
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
    if (!csrfData) throw new Error('Не удалось подготовить защищённую форму. Повторите попытку.');
    return csrfData;
  }

  async function handleGrant() {
    setActionError(null);
    if (!storeId) {
      setActionError('Choose a store to assign.');
      return;
    }
    try {
      const csrfData = await getCsrfOrThrow();
      await grantStoreAccess({ userId, storeId, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap();
      setStoreId('');
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Store access could not be assigned.';
      setActionError(message);
    }
  }

  async function handleRevoke(revokeStoreId: string) {
    setActionError(null);
    try {
      const csrfData = await getCsrfOrThrow();
      await revokeStoreAccess({ userId, storeId: revokeStoreId, csrfToken: csrfData.csrfToken, csrfHeaderName: csrfData.headerName }).unwrap();
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Store access could not be revoked.';
      setActionError(message);
    }
  }

  return (
    <div className="store-access-box">
      <div className="store-access-header">
        <h4>Operator store access</h4>
        <div className="access-grant-row">
          <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="Store to assign">
            <option value="">Choose store</option>
            {availableStores.map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
          </select>
          <button type="button" disabled={granting || !storeId} onClick={handleGrant}>{granting ? 'Assigning...' : 'Assign store'}</button>
        </div>
      </div>
      {accessLoading && <div className="status status-loading">Loading store access...</div>}
      {accessErrorMessage && <div className="form-error" role="alert">{accessErrorMessage}</div>}
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      {!accessLoading && activeAccesses.length === 0 && <div className="empty-state">No active stores assigned.</div>}
      {activeAccesses.length > 0 && (
        <div className="access-list">
          {activeAccesses.map((access) => (
            <div className="access-item" key={access.id}>
              <span><strong>{access.store.code}</strong> · {access.store.name}</span>
              <button className="secondary-button" type="button" disabled={revoking} onClick={() => handleRevoke(access.storeId)}>
                {revoking ? 'Revoking...' : 'Revoke'}
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
  const { data, error, isLoading, isFetching, refetch } = useGetAdminDashboardQuery();
  const errorMessage = error && 'message' in error ? error.message : null;

  return (
    <section className="panel dashboard-overview" aria-labelledby="admin-dashboard-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h2 id="admin-dashboard-title">Fleet overview</h2>
          <p className="muted">Stores, scale health, published versions and recent sync failures.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh dashboard'}
        </button>
      </div>

      {isLoading && <div className="status status-loading">Loading admin dashboard...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}

      {data && (
        <>
          <div className="metric-grid" aria-label="Admin dashboard totals">
            <MetricCard label="Stores" value={data.counts.stores} />
            <MetricCard label="Scales" value={data.counts.scaleDevices} />
            <MetricCard label="Scales with errors" value={data.counts.scaleDevicesWithErrors} tone={data.counts.scaleDevicesWithErrors > 0 ? 'danger' : 'ok'} />
            <MetricCard label="Without synchronization" value={data.counts.scaleDevicesWithoutSynchronization} tone={data.counts.scaleDevicesWithoutSynchronization > 0 ? 'warning' : 'ok'} />
          </div>

          <div className="dashboard-section-grid">
            <DashboardList title="Latest published versions" emptyText="No published catalog versions yet.">
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

            <DashboardList title="Latest sync errors" emptyText="No recent sync errors.">
              {data.latestSyncErrors.map((syncError) => (
                <LatestSyncErrorItem error={syncError} key={syncError.id} onNavigate={onNavigate} />
              ))}
            </DashboardList>
          </div>

          <section className="dashboard-subsection" aria-labelledby="problematic-scales-title">
            <div className="section-heading-row">
              <div>
                <h3 id="problematic-scales-title">Problematic scales</h3>
                <p className="muted">Highlighted scales have a sync error, missing sync or outdated catalog.</p>
              </div>
            </div>
            {data.problematicScaleDevices.length === 0 ? (
              <div className="empty-state">No problematic scales detected.</div>
            ) : (
              <div className="problem-scale-grid">
                {data.problematicScaleDevices.map((device) => (
                  <ProblematicScaleCard device={device} key={device.id} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </section>

          <section className="quick-links" aria-labelledby="quick-links-title">
            <h3 id="quick-links-title">Quick links</h3>
            <div className="action-row">
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'stores' })}>Stores</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'products' })}>Products</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'global-logs' })}>Global logs</button>
              <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'users-access' })}>Users & access</button>
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
          Open store
        </button>
      </div>
    </li>
  );
}

function ProblematicScaleCard({ device, onNavigate }: { device: AdminDashboardProblematicScaleDevice; onNavigate: (view: DashboardView) => void }) {
  return (
    <article className="problem-scale-card">
      <div className="problem-scale-heading">
        <div>
          <p className="store-code">{device.storeCode} · {device.storeName}</p>
          <h4>{device.deviceCode} · {device.name}</h4>
        </div>
        <span className={`badge badge-${device.status}`}>{device.status}</span>
      </div>
      <div className="reason-row">
        {device.reasons.map((reason) => <span className="badge badge-danger" key={reason}>{reason.replace(/_/g, ' ')}</span>)}
      </div>
      <dl className="compact-details">
        <div><dt>Current version</dt><dd>{device.currentCatalogVersionId ?? '—'}</dd></div>
        <div><dt>Expected version</dt><dd>{device.expectedCatalogVersionId ?? '—'}</dd></div>
        <div><dt>Last sync</dt><dd>{formatDateTime(device.lastSyncAt)}</dd></div>
      </dl>
      {device.lastSyncError?.message && <div className="inline-error">{device.lastSyncError.message}</div>}
      <button className="secondary-button" type="button" onClick={() => onNavigate({ name: 'store-details', storeId: device.storeId })}>
        Open store
      </button>
    </article>
  );
}

function OperatorDashboardOverview({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
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
          <p className="eyebrow">Operator dashboard</p>
          <h2 id="operator-dashboard-title">Assigned stores</h2>
          <p className="muted">Only stores assigned to your account are shown here.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh stores'}
        </button>
      </div>

      {isLoading && <div className="status status-loading">Loading assigned stores...</div>}
      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {!isLoading && !errorMessage && stores.length === 0 && <div className="empty-state">No stores are assigned to your account.</div>}

      {stores.length > 0 && (
        <div className="operator-store-grid">
          {stores.map((store) => <OperatorStoreDashboardCard key={store.id} store={store} onNavigate={onNavigate} />)}
        </div>
      )}
    </section>
  );
}

function OperatorStoreDashboardCard({ store, onNavigate }: { store: Store; onNavigate: (view: DashboardView) => void }) {
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
          <p className="muted">{store.address || 'No address'} · {store.timezone}</p>
        </div>
        <span className={`badge badge-${store.status}`}>{store.status}</span>
      </div>

      {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}
      {(versionsLoading || scalesLoading) && <div className="status status-loading">Loading store dashboard...</div>}

      <dl className="compact-details">
        <div><dt>Current version</dt><dd>{versionsLoading ? 'Loading…' : formatVersionLabel(currentVersion)}</dd></div>
        <div><dt>Publication status</dt><dd>{currentVersion?.status ?? 'not published'}</dd></div>
        <div><dt>Sync status</dt><dd>{syncSummary(devices.length, problematicDeviceIds.size)}</dd></div>
        <div><dt>Errors</dt><dd>{devicesWithErrors.length}</dd></div>
      </dl>

      {hasProblems && (
        <div className="reason-row">
          {devicesWithErrors.length > 0 && <span className="badge badge-danger">{devicesWithErrors.length} error</span>}
          {devicesMissingSync.length > 0 && <span className="badge badge-warning">{devicesMissingSync.length} missing sync</span>}
          {devicesOutdated.length > 0 && <span className="badge badge-warning">{devicesOutdated.length} outdated</span>}
        </div>
      )}

      {devicesWithErrors.length > 0 && (
        <ul className="dashboard-list compact-error-list">
          {devicesWithErrors.slice(0, 3).map((device) => (
            <li className="dashboard-list-item dashboard-list-item-danger" key={device.id}>
              <div>
                <strong>{device.deviceCode} · {device.name}</strong>
                <span className="inline-error block">{device.lastSyncError?.message ?? device.lastSyncStatus ?? 'sync error'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => onNavigate({ name: 'store-details', storeId: store.id })}>
        Open catalog
      </button>
    </article>
  );
}

function syncSummary(totalDevices: number, problematicCount: number) {
  if (totalDevices === 0) {
    return 'No scales connected';
  }

  return problematicCount === 0 ? `${totalDevices} synced` : `${problematicCount} of ${totalDevices} need attention`;
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
    return <RouteNotFoundPanel returnTo={view.returnTo} message={view.message} onNavigate={onNavigate} />;
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
          <p className="eyebrow">Dashboard</p>
          <h1>Добро пожаловать, {displayName}</h1>
          <p className="description">
            Active session for {user.email} · role: <strong>{user.role}</strong>
          </p>
        </div>
        <button type="button" onClick={handleLogout} disabled={logoutLoading}>
          {logoutLoading ? 'Logging out...' : 'Logout'}
        </button>
      </section>

      <Navigation user={user} activeView={view} onNavigate={handleNavigate} />
      {logoutErrorMessage && <div className="form-error" role="alert">{logoutErrorMessage}</div>}
      <DashboardContent user={user} view={view} onNavigate={handleNavigate} />
    </main>
  );
}

function App() {
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

  const { data: session, isLoading, isFetching, error } = useGetSessionQuery();
  const hasActiveSession = Boolean(session?.user);

  if (isLoading || (isFetching && !session && !error)) {
    return (
      <main className="app-shell">
        <section className="card">
          <p className="eyebrow">Scale Admin</p>
          <h1>Checking session...</h1>
          <div className="status status-loading">Loading protected session state via RTK Query.</div>
        </section>
      </main>
    );
  }

  if (!hasActiveSession) {
    return <LoginScreen />;
  }

  return <Dashboard user={session!.user} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
