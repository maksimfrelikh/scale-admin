import { backendApi } from '../../shared/api/backendApi';
import type { Store } from '../stores/storesApi';
import type { UserRole, UserStatus } from '../auth/authApi';

export type ManagedUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type UserInvite = {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type CreateInviteResponse = {
  invite: UserInvite;
};

export type StoreAccess = {
  id: string;
  userId: string;
  storeId: string;
  grantedByUserId: string | null;
  createdAt: string;
  revokedAt: string | null;
  store: Pick<Store, 'id' | 'code' | 'name' | 'status'>;
  grantedBy: { id: string; email: string; fullName: string | null } | null;
};

type CsrfRequest = {
  csrfToken: string;
  csrfHeaderName: string;
};

export type CreateInviteRequest = CsrfRequest & {
  email: string;
  role: UserRole;
  expiresAt: string;
  fullName?: string;
};

export type ChangeUserRoleRequest = CsrfRequest & {
  userId: string;
  role: UserRole;
};

export type UserStateRequest = CsrfRequest & {
  userId: string;
};

export type GrantStoreAccessRequest = CsrfRequest & {
  userId: string;
  storeId: string;
};

export type RevokeStoreAccessRequest = CsrfRequest & {
  userId: string;
  storeId: string;
};

export type CancelInviteRequest = CsrfRequest & {
  inviteId: string;
};

export type CancelInviteResponse = {
  inviteId: string;
  cancelled: boolean;
};

export const usersApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<{ users: ManagedUser[] }, { includeDeleted?: boolean } | void>({
      query: (args) => `/users${args?.includeDeleted ? '?includeDeleted=true' : ''}`,
      providesTags: (result) => [
        { type: 'Users', id: 'LIST' },
        ...(result?.users.map((user) => ({ type: 'Users' as const, id: user.id })) ?? []),
      ],
    }),
    createInvite: builder.mutation<CreateInviteResponse, CreateInviteRequest>({
      query: ({ csrfToken, csrfHeaderName, ...body }) => ({
        url: '/auth/invites',
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
    }),
    changeUserRole: builder.mutation<{ user: ManagedUser; changed: boolean }, ChangeUserRoleRequest>({
      query: ({ userId, role, csrfToken, csrfHeaderName }) => ({
        url: `/users/${userId}/role`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
        body: { role },
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: 'Users', id: userId },
        { type: 'Users', id: 'LIST' },
        { type: 'UserStoreAccess', id: userId },
      ],
    }),
    blockUser: builder.mutation<{ user: ManagedUser; changed: boolean }, UserStateRequest>({
      query: ({ userId, csrfToken, csrfHeaderName }) => ({
        url: `/users/${userId}/block`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: 'Users', id: userId }, { type: 'Users', id: 'LIST' }],
    }),
    unblockUser: builder.mutation<{ user: ManagedUser; changed: boolean }, UserStateRequest>({
      query: ({ userId, csrfToken, csrfHeaderName }) => ({
        url: `/users/${userId}/unblock`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: 'Users', id: userId }, { type: 'Users', id: 'LIST' }],
    }),
    listUserStoreAccesses: builder.query<{ storeAccesses: StoreAccess[] }, string>({
      query: (userId) => `/users/${userId}/store-accesses`,
      providesTags: (_result, _error, userId) => [{ type: 'UserStoreAccess', id: userId }],
    }),
    grantStoreAccess: builder.mutation<{ storeAccess: StoreAccess; granted: boolean; duplicateActiveAccess: boolean }, GrantStoreAccessRequest>({
      query: ({ userId, storeId, csrfToken, csrfHeaderName }) => ({
        url: `/users/${userId}/store-accesses`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body: { storeId },
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: 'UserStoreAccess', id: userId }],
    }),
    revokeStoreAccess: builder.mutation<{ storeAccess: StoreAccess; revoked: boolean }, RevokeStoreAccessRequest>({
      query: ({ userId, storeId, csrfToken, csrfHeaderName }) => ({
        url: `/users/${userId}/store-accesses/${storeId}`,
        method: 'DELETE',
        headers: { [csrfHeaderName]: csrfToken },
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: 'UserStoreAccess', id: userId }],
    }),
    cancelInvite: builder.mutation<CancelInviteResponse, CancelInviteRequest>({
      query: ({ inviteId, csrfToken, csrfHeaderName }) => ({
        url: `/users/invites/${inviteId}`,
        method: 'DELETE',
        headers: { [csrfHeaderName]: csrfToken },
      }),
    }),
  }),
});

export const {
  useListUsersQuery,
  useCreateInviteMutation,
  useChangeUserRoleMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
  useListUserStoreAccessesQuery,
  useGrantStoreAccessMutation,
  useRevokeStoreAccessMutation,
  useCancelInviteMutation,
} = usersApi;
