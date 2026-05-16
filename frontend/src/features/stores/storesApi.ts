import { backendApi, publishStoreListChangedEvent } from '../../shared/api/backendApi';

export type StoreStatus = 'active' | 'inactive' | 'archived';

export type Store = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
};

export type StoreFormValues = {
  code: string;
  name: string;
  address?: string;
  timezone?: string;
  status: StoreStatus;
};

type WriteStoreRequest = StoreFormValues & {
  csrfToken: string;
  csrfHeaderName: string;
};

type UpdateStoreRequest = Partial<StoreFormValues> & {
  storeId: string;
  csrfToken: string;
  csrfHeaderName: string;
};

export const storesApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listStores: builder.query<{ stores: Store[] }, void>({
      query: () => '/stores',
      providesTags: (result) => [
        { type: 'Stores', id: 'LIST' },
        ...(result?.stores.map((store) => ({ type: 'Stores' as const, id: store.id })) ?? []),
      ],
    }),
    getStore: builder.query<{ store: Store }, string>({
      query: (storeId) => `/stores/${storeId}`,
      providesTags: (_result, _error, storeId) => [{ type: 'Stores', id: storeId }],
    }),
    createStore: builder.mutation<{ store: Store }, WriteStoreRequest>({
      query: ({ csrfToken, csrfHeaderName, ...body }) => ({
        url: '/stores',
        method: 'POST',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body,
      }),
      invalidatesTags: [{ type: 'Stores', id: 'LIST' }],
      async onQueryStarted(_request, { queryFulfilled }) {
        try {
          await queryFulfilled;
          publishStoreListChangedEvent();
        } catch {
          // Failed mutations do not change store lists.
        }
      },
    }),
    updateStore: builder.mutation<{ store: Store }, UpdateStoreRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}`,
        method: 'PATCH',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: 'Stores', id: storeId },
        { type: 'Stores', id: 'LIST' },
      ],
      async onQueryStarted({ storeId }, { queryFulfilled }) {
        try {
          await queryFulfilled;
          publishStoreListChangedEvent(storeId);
        } catch {
          // Failed mutations do not change store lists.
        }
      },
    }),
  }),
});

export const {
  useListStoresQuery,
  useGetStoreQuery,
  useCreateStoreMutation,
  useUpdateStoreMutation,
} = storesApi;
