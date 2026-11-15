export interface HttpError extends Error {
  response?: Response;
  status?: number;
  payload?: unknown;
}

const STORAGE_KEY_ADMIN = 'bst-admin-token';
const STORAGE_KEY_ACCESS = 'bst-supabase-access-token';
const STORAGE_KEY_REFRESH = 'bst-supabase-refresh-token';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let refreshHandler: (() => Promise<boolean>) | null = null;
let promptLoginHandler: (() => Promise<boolean>) | null = null;

export function registerAuthHandlers(
  onRefresh: () => Promise<boolean>,
  onPromptLogin: () => Promise<boolean>,
): void {
  refreshHandler = onRefresh;
  promptLoginHandler = onPromptLogin;
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

export function isAdminUser(user: unknown): user is AuthUser {
  if (!user || typeof user !== 'object') return false;
  const candidate = user as AuthUser;
  return Boolean(
    candidate.isAdmin || String(candidate.role || '').trim().toLowerCase() === 'admin',
  );
}

export function getAdminToken(): string {
  return localStorage.getItem(STORAGE_KEY_ADMIN)?.trim() || '';
}

export function setAdminToken(token: string): void {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (normalized) {
    localStorage.setItem(STORAGE_KEY_ADMIN, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY_ADMIN);
  }
}

export function getAccessToken(): string {
  return localStorage.getItem(STORAGE_KEY_ACCESS)?.trim() || '';
}

export function getRefreshToken(): string {
  return localStorage.getItem(STORAGE_KEY_REFRESH)?.trim() || '';
}

export function setAuthSession(session: AuthSession | null | undefined): void {
  const accessToken =
    typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
  const refreshToken =
    typeof session?.refreshToken === 'string' ? session.refreshToken.trim() : '';

  if (accessToken) {
    localStorage.setItem(STORAGE_KEY_ACCESS, accessToken);
  } else {
    localStorage.removeItem(STORAGE_KEY_ACCESS);
  }

  if (refreshToken) {
    localStorage.setItem(STORAGE_KEY_REFRESH, refreshToken);
  } else {
    localStorage.removeItem(STORAGE_KEY_REFRESH);
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(STORAGE_KEY_ACCESS);
  localStorage.removeItem(STORAGE_KEY_REFRESH);
}

export function buildHeaders(
  existingHeaders: HeadersInit | undefined,
  requireAdmin: boolean,
): Headers {
  const headers = new Headers(existingHeaders || {});

  if (requireAdmin) {
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    } else {
      const token = getAdminToken();
      if (token) {
        headers.set('x-bst-admin-token', token);
      }
    }
  }

  return headers;
}

export async function getErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.clone().json()) as { error?: string };
    if (json?.error) return json.error;
  } catch {
    // Ignore JSON parse failures and fall back to text.
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // Ignore text read failures.
  }

  return `Request failed: ${response.status}`;
}

export async function fetchWithSecurity(
  url: string,
  options: RequestInit = {},
  config: ApiSecurityConfig = {},
): Promise<Response> {
  const {
    requireAdmin = false,
    retryOnUnauthorized = true,
    tryRefreshOnUnauthorized = true,
    tryInteractiveLoginOnUnauthorized = true,
    promptForAdminTokenOnUnauthorized = true,
  } = config;

  const runRequest = (): Promise<Response> =>
    fetch(url, {
      ...options,
      headers: buildHeaders(options.headers, requireAdmin),
    });

  let response = await runRequest();

  if (requireAdmin && retryOnUnauthorized && response.status === 401) {
    if (tryRefreshOnUnauthorized && refreshHandler) {
      const refreshed = await refreshHandler();
      if (refreshed) {
        return fetchWithSecurity(url, options, {
          ...config,
          retryOnUnauthorized: false,
          tryRefreshOnUnauthorized: false,
          tryInteractiveLoginOnUnauthorized,
        });
      }
    }

    if (tryInteractiveLoginOnUnauthorized && promptLoginHandler) {
      try {
        const loggedIn = await promptLoginHandler();
        if (loggedIn) {
          return fetchWithSecurity(url, options, {
            ...config,
            retryOnUnauthorized: false,
            tryRefreshOnUnauthorized: false,
            tryInteractiveLoginOnUnauthorized: false,
          });
        }
      } catch {
        // Keep original response on failed interactive login.
      }
    }

    if (promptForAdminTokenOnUnauthorized) {
      const enteredToken = window.prompt(
        'Enter the admin token for this server (optional fallback):',
        getAdminToken(),
      );
      if (enteredToken && enteredToken.trim()) {
        setAdminToken(enteredToken);
        response = await fetchWithSecurity(url, options, {
          ...config,
          retryOnUnauthorized: false,
          tryRefreshOnUnauthorized: false,
          tryInteractiveLoginOnUnauthorized: false,
          promptForAdminTokenOnUnauthorized: false,
        });
      }
    }
  }

  return response;
}

export async function fetchJson<T = unknown>(
  url: string,
  options: RequestInit = {},
  config: ApiSecurityConfig = {},
): Promise<T> {
  const response = await fetchWithSecurity(url, options, config);
  if (!response.ok) {
    const error: HttpError = new Error(await getErrorMessage(response));
    error.response = response;
    throw error;
  }
  return response.json() as Promise<T>;
}
