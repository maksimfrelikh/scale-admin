import { backendApi } from '../../shared/api/backendApi';
import type { AllowedCurrency } from '../../shared/currency';

export type ProductUnit = 'kg' | 'g' | 'piece';
export type ProductStatus = 'active' | 'inactive' | 'archived';
export type PriceStatus = 'active' | 'inactive' | 'archived';

export type PriceProduct = {
  id: string;
  defaultPluCode: string;
  name: string;
  shortName: string;
  barcode: string | null;
  sku: string | null;
  unit: ProductUnit;
  status: ProductStatus;
};

export type PriceCategory = {
  id: string;
  name: string;
  shortName: string;
  status: string;
};

export type StoreProductPrice = {
  id: string;
  storeId: string;
  productId: string;
  price: string;
  currency: string;
  status: PriceStatus;
  createdAt: string;
  updatedAt: string;
};

export type PriceRow = {
  placement: {
    id: string;
    catalogId: string;
    categoryId: string;
    productId: string;
    sortOrder: number;
    status: string;
  };
  product: PriceProduct;
  category: PriceCategory;
  currentPrice: StoreProductPrice | null;
  missingPrice: boolean;
};

export type StorePricesResponse = {
  catalog: {
    id: string;
    storeId: string;
    name: string;
    status: string;
  };
  prices: PriceRow[];
};

export type StorePricesQuery = {
  storeId: string;
  search?: string;
  categoryId?: string;
  missingPrice?: boolean | '';
};

type UpdateStoreProductPriceRequest = {
  storeId: string;
  productId: string;
  price: number;
  currency: AllowedCurrency;
  csrfToken: string;
  csrfHeaderName: string;
};

function buildPriceQuery({ storeId, search, categoryId, missingPrice }: StorePricesQuery) {
  const params = new URLSearchParams();
  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }
  if (categoryId) {
    params.set('categoryId', categoryId);
  }
  if (typeof missingPrice === 'boolean') {
    params.set('missingPrice', String(missingPrice));
  }

  const queryString = params.toString();
  return `/stores/${storeId}/prices${queryString ? `?${queryString}` : ''}`;
}

export const pricesApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listStorePrices: builder.query<StorePricesResponse, StorePricesQuery>({
      query: buildPriceQuery,
      providesTags: (_result, _error, { storeId }) => [{ type: 'Prices', id: storeId }],
    }),
    updateStoreProductPrice: builder.mutation<{ price: StoreProductPrice }, UpdateStoreProductPriceRequest>({
      query: ({ storeId, productId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}/prices/${productId}`,
        method: 'PUT',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [{ type: 'Prices', id: storeId }],
    }),
  }),
});

export const {
  useListStorePricesQuery,
  useUpdateStoreProductPriceMutation,
} = pricesApi;
