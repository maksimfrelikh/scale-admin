import {
  backendApi,
  clearProtectedClientState,
  publishAuthSessionEvent,
  type ApiError,
} from '../../shared/api/backendApi';

export type UserRole = 'admin' | 'operator';
export type UserStatus = 'active' | 'blocked' | string;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
};

export type SessionInfo = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export type SessionResponse = {
  session: SessionInfo;
  user: AuthUser;
};

export type LoginResponse = {
  user: AuthUser;
  expiresAt: string;
};

export type CsrfResponse = {
  csrfToken: string;
  headerName: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  csrfToken: string;
  csrfHeaderName: string;
};

export type AcceptInviteRequest = {
  token: string;
  password: string;
  csrfToken: string;
  csrfHeaderName: string;
};

export type AcceptInviteResponse = {
  user: AuthUser;
  invite: {
    id: string;
    email: string;
    role: UserRole;
    expiresAt: string;
    acceptedAt: string | null;
  };
};

export type RequestPasswordResetRequest = {
  email: string;
  csrfToken: string;
  csrfHeaderName: string;
};

export type RequestPasswordResetResponse = {
  accepted: boolean;
  tokenExpiresAt: string;
};

export type ConfirmPasswordResetRequest = {
  token: string;
  password: string;
  csrfToken: string;
  csrfHeaderName: string;
};

export type ConfirmPasswordResetResponse = {
  reset: boolean;
  passwordChangedAt: string;
  sessionsRevoked: boolean;
};

export type LogoutRequest = {
  csrfToken: string;
  csrfHeaderName: string;
};

export const authApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({
    getCsrfToken: builder.query<CsrfResponse, void>({
      query: () => '/auth/csrf',
    }),
    getSession: builder.query<SessionResponse | null, void>({
      async queryFn(_arg, _queryApi, _extraOptions, baseQuery) {
        const result = await baseQuery('/auth/session');

        if (result.error) {
          const error = result.error as ApiError;
          if (error.status === 401) {
            return { data: null };
          }
          return { error };
        }

        return { data: result.data as SessionResponse };
      },
      providesTags: ['Session'],
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: ({ email, password, csrfToken, csrfHeaderName }) => ({
        url: '/auth/login',
        method: 'POST',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body: { email, password },
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          publishAuthSessionEvent('session-changed');
        } catch {
          // Failed logins must not change auth state in other tabs.
        }
      },
      invalidatesTags: ['Session'],
    }),
    acceptInvite: builder.mutation<AcceptInviteResponse, AcceptInviteRequest>({
      query: ({ token, password, csrfToken, csrfHeaderName }) => ({
        url: '/auth/invites/accept',
        method: 'POST',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body: { token, password },
      }),
    }),
    requestPasswordReset: builder.mutation<RequestPasswordResetResponse, RequestPasswordResetRequest>({
      query: ({ email, csrfToken, csrfHeaderName }) => ({
        url: '/auth/password-reset/request',
        method: 'POST',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body: { email },
      }),
    }),
    confirmPasswordReset: builder.mutation<ConfirmPasswordResetResponse, ConfirmPasswordResetRequest>({
      query: ({ token, password, csrfToken, csrfHeaderName }) => ({
        url: '/auth/password-reset/confirm',
        method: 'POST',
        headers: {
          [csrfHeaderName]: csrfToken,
        },
        body: { token, password },
      }),
    }),
    logout: builder.mutation<{ revoked: boolean }, LogoutRequest>({
      async queryFn({ csrfToken, csrfHeaderName }, _queryApi, _extraOptions, baseQuery) {
        const logoutRequest = (token: string, headerName: string) => baseQuery({
          url: '/auth/logout',
          method: 'POST',
          headers: {
            [headerName]: token,
          },
        });

        const resolveAsLoggedOutIfSessionGone = async (error: ApiError) => {
          if (error.status === 401) {
            return { data: { revoked: false } };
          }

          const sessionResult = await baseQuery('/auth/session');
          if (sessionResult.error && (sessionResult.error as ApiError).status === 401) {
            return { data: { revoked: false } };
          }

          return { error };
        };

        const firstAttempt = await logoutRequest(csrfToken, csrfHeaderName);
        if (!firstAttempt.error) {
          return { data: firstAttempt.data as { revoked: boolean } };
        }

        const firstError = firstAttempt.error as ApiError;
        if (firstError.status !== 403) {
          return resolveAsLoggedOutIfSessionGone(firstError);
        }

        const csrfResult = await baseQuery('/auth/csrf');
        if (csrfResult.error) {
          return resolveAsLoggedOutIfSessionGone(firstError);
        }

        const freshCsrf = csrfResult.data as CsrfResponse;
        const retryAttempt = await logoutRequest(freshCsrf.csrfToken, freshCsrf.headerName);
        if (!retryAttempt.error) {
          return { data: retryAttempt.data as { revoked: boolean } };
        }

        return resolveAsLoggedOutIfSessionGone(retryAttempt.error as ApiError);
      },
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          clearProtectedClientState(dispatch);
        } catch {
          // Keep the current session state if the logout request itself fails and the session is still active.
        }
      },
      invalidatesTags: ['Session'],
    }),
  }),
});

export const {
  useAcceptInviteMutation,
  useConfirmPasswordResetMutation,
  useGetCsrfTokenQuery,
  useGetSessionQuery,
  useLoginMutation,
  useLogoutMutation,
  useRequestPasswordResetMutation,
} = authApi;
