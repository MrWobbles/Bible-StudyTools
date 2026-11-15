import {
  clearAuthSession,
  fetchJson,
  getErrorMessage,
  getRefreshToken,
  isAdminUser,
  isLoopbackHost,
  registerAuthHandlers,
  setAdminToken,
  setAuthSession,
} from './client';

let refreshInProgress: Promise<boolean> | null = null;

export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<Record<string, unknown>> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response);
    throw new Error(message || 'Login failed');
  }

  const payload = (await response.json()) as Record<string, unknown> & {
    session?: AuthSession;
  };
  setAuthSession(payload.session);
  return payload;
}

export async function refreshAuthSession(): Promise<boolean> {
  if (refreshInProgress) return refreshInProgress;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInProgress = (async (): Promise<boolean> => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const currentRefreshToken = getRefreshToken();
      if (currentRefreshToken && currentRefreshToken !== refreshToken) {
        return true;
      }
      clearAuthSession();
      return false;
    }

    const payload = (await response.json()) as { session?: AuthSession };
    setAuthSession(payload.session);
    return true;
  })();

  try {
    return await refreshInProgress;
  } finally {
    refreshInProgress = null;
  }
}

export async function promptAndLogin(): Promise<boolean> {
  const promptPrefix = isLoopbackHost(window.location.hostname)
    ? 'Sign in with Supabase credentials for admin actions on this server.'
    : 'Sign in with Supabase credentials for this server.';

  const identifier = window.prompt(`${promptPrefix}\nUsername or email:`);
  if (!identifier || !identifier.trim()) return false;

  const password = window.prompt('Password:');
  if (!password) return false;

  await loginWithPassword(identifier.trim(), password);
  return true;
}

registerAuthHandlers(refreshAuthSession, promptAndLogin);

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network failures while still clearing local state.
  }

  clearAuthSession();
  setAdminToken('');
}

export async function getCurrentUser(): Promise<{ user?: AuthUser }> {
  return fetchJson<{ user?: AuthUser }>(
    '/api/auth/me',
    {},
    {
      requireAdmin: true,
      tryInteractiveLoginOnUnauthorized: false,
      promptForAdminTokenOnUnauthorized: false,
    },
  );
}

export async function ensureAuthenticated(
  options: { redirectTo?: string } = {},
): Promise<AuthUser | null> {
  const { redirectTo = '/auth.html' } = options;

  try {
    const payload = await getCurrentUser();
    return payload?.user || null;
  } catch {
    clearAuthSession();
    if (redirectTo) {
      const target = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.location.replace(target);
    }
    return null;
  }
}

export async function ensureAdminAccess(
  options: { redirectTo?: string } = {},
): Promise<AuthUser | null> {
  const { redirectTo = '/auth.html' } = options;

  try {
    const payload = await getCurrentUser();
    if (isAdminUser(payload?.user)) {
      return payload.user;
    }

    if (redirectTo) {
      const target = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.location.replace(target);
    }
    return null;
  } catch {
    clearAuthSession();
    if (redirectTo) {
      const target = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.location.replace(target);
    }
    return null;
  }
}

export async function listSignupRequests(
  status?: string,
): Promise<{ requests?: SignupRequest[] }> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<{ requests?: SignupRequest[] }>(
    `/api/admin/signup-requests${suffix}`,
    {},
    { requireAdmin: true },
  );
}

export async function listUserAccounts(): Promise<{ accounts?: UserAccount[] }> {
  return fetchJson<{ accounts?: UserAccount[] }>(
    '/api/admin/accounts',
    {},
    { requireAdmin: true },
  );
}

export async function approveSignupRequest(
  requestId: string,
  payload: Record<string, unknown> = {},
): Promise<{ inviteCode?: string }> {
  return fetchJson<{ inviteCode?: string }>(
    `/api/admin/signup-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { requireAdmin: true },
  );
}

export async function rejectSignupRequest(
  requestId: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  return fetchJson(
    `/api/admin/signup-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { requireAdmin: true },
  );
}

export async function resetAccountPassword(
  identifier: string,
  newPassword: string,
): Promise<unknown> {
  return fetchJson(
    '/api/admin/accounts/reset-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, newPassword }),
    },
    { requireAdmin: true },
  );
}

export async function removeAccount(identifier: string): Promise<unknown> {
  return fetchJson(
    `/api/admin/accounts/${encodeURIComponent(identifier)}`,
    { method: 'DELETE' },
    { requireAdmin: true },
  );
}
