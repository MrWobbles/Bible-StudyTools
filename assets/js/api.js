(function () {
  const STORAGE_KEY_ADMIN = 'bst-admin-token';
  const STORAGE_KEY_ACCESS = 'bst-supabase-access-token';
  const STORAGE_KEY_REFRESH = 'bst-supabase-refresh-token';
  const STORAGE_KEY_CSRF = 'bst-csrf-token';
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

  function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
  }

  function isAdminUser(user) {
    if (!user || typeof user !== 'object') {
      return false;
    }

    return Boolean(user.isAdmin || String(user.role || '').trim().toLowerCase() === 'admin');
  }

  function getAdminToken() {
    return localStorage.getItem(STORAGE_KEY_ADMIN)?.trim() || '';
  }

  function setAdminToken(token) {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (normalized) {
      localStorage.setItem(STORAGE_KEY_ADMIN, normalized);
    } else {
      localStorage.removeItem(STORAGE_KEY_ADMIN);
    }
  }

  function getAccessToken() {
    return localStorage.getItem(STORAGE_KEY_ACCESS)?.trim() || '';
  }

  function getCsrfToken() {
    const localToken = localStorage.getItem(STORAGE_KEY_CSRF)?.trim() || '';
    if (localToken) {
      return localToken;
    }

    const globalToken = typeof window.BST_CSRF_TOKEN === 'string'
      ? window.BST_CSRF_TOKEN.trim()
      : '';
    return globalToken;
  }

  function setCsrfToken(token) {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (normalized) {
      localStorage.setItem(STORAGE_KEY_CSRF, normalized);
    } else {
      localStorage.removeItem(STORAGE_KEY_CSRF);
    }
  }

  function getRefreshToken() {
    return localStorage.getItem(STORAGE_KEY_REFRESH)?.trim() || '';
  }

  function setAuthSession(session) {
    const accessToken = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    const refreshToken = typeof session?.refreshToken === 'string' ? session.refreshToken.trim() : '';

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

  function clearAuthSession() {
    localStorage.removeItem(STORAGE_KEY_ACCESS);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
  }

  async function loginWithPassword(identifier, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, password })
    });

    if (!response.ok) {
      const message = await getErrorMessage(response);
      throw new Error(message || 'Login failed');
    }

    const payload = await response.json();
    setAuthSession(payload.session);
    return payload;
  }

  async function refreshAuthSession() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      clearAuthSession();
      return false;
    }

    const payload = await response.json();
    setAuthSession(payload.session);
    return true;
  }

  async function promptAndLogin() {
    const promptPrefix = isLoopbackHost(window.location.hostname)
      ? 'Sign in with Supabase credentials for admin actions on this server.'
      : 'Sign in with Supabase credentials for this server.';

    const identifier = window.prompt(`${promptPrefix}\nUsername or email:`);
    if (!identifier || !identifier.trim()) {
      return false;
    }

    const password = window.prompt('Password:');
    if (!password) {
      return false;
    }

    await loginWithPassword(identifier.trim(), password);
    return true;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // Ignore network failures while still clearing local state.
    }

    clearAuthSession();
    setAdminToken('');
  }

  async function ensureAuthenticated(options = {}) {
    const { redirectTo = '/auth.html' } = options;

    try {
      const payload = await getCurrentUser();
      return payload?.user || null;
    } catch (err) {
      clearAuthSession();
      if (redirectTo) {
        const target = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        window.location.replace(target);
      }
      return null;
    }
  }

  async function ensureAdminAccess(options = {}) {
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
    } catch (err) {
      clearAuthSession();
      if (redirectTo) {
        const target = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        window.location.replace(target);
      }
      return null;
    }
  }

  function buildHeaders(existingHeaders, requireAdmin, requestMethod = 'GET') {
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

    const method = String(requestMethod || '').trim().toUpperCase();
    const inferredMethod = method || 'GET';
    if (inferredMethod !== 'GET' && inferredMethod !== 'HEAD') {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers.set('x-bst-csrf-token', csrfToken);
      }
    }

    return headers;
  }

  async function fetchWithSecurity(url, options = {}, config = {}) {
    const {
      requireAdmin = false,
      retryOnUnauthorized = true,
      tryRefreshOnUnauthorized = true,
      tryInteractiveLoginOnUnauthorized = true,
      promptForAdminTokenOnUnauthorized = true
    } = config;

    const runRequest = () => fetch(url, {
      ...options,
      headers: buildHeaders(options.headers, requireAdmin, options.method)
    });

    let response = await runRequest();

    if (requireAdmin && retryOnUnauthorized && response.status === 401) {
      if (tryRefreshOnUnauthorized) {
        const refreshed = await refreshAuthSession();
        if (refreshed) {
          response = await fetchWithSecurity(url, options, {
            ...config,
            retryOnUnauthorized: false,
            tryRefreshOnUnauthorized: false,
            tryInteractiveLoginOnUnauthorized
          });
          return response;
        }
      }

      if (tryInteractiveLoginOnUnauthorized) {
        try {
          const loggedIn = await promptAndLogin();
          if (loggedIn) {
            response = await fetchWithSecurity(url, options, {
              ...config,
              retryOnUnauthorized: false,
              tryRefreshOnUnauthorized: false,
              tryInteractiveLoginOnUnauthorized: false
            });
            return response;
          }
        } catch (err) {
          // Keep original response on failed interactive login.
        }
      }

      if (promptForAdminTokenOnUnauthorized) {
        const enteredToken = window.prompt('Enter the admin token for this server (optional fallback):', getAdminToken());
        if (enteredToken && enteredToken.trim()) {
          setAdminToken(enteredToken);
          response = await fetchWithSecurity(url, options, {
            ...config,
            retryOnUnauthorized: false,
            tryRefreshOnUnauthorized: false,
            tryInteractiveLoginOnUnauthorized: false,
            promptForAdminTokenOnUnauthorized: false
          });
        }
      }
    }

    return response;
  }

  async function getErrorMessage(response) {
    try {
      const json = await response.clone().json();
      if (json?.error) {
        return json.error;
      }
    } catch (err) {
      // Ignore JSON parse failures and fall back to text.
    }

    try {
      const text = await response.text();
      if (text) {
        return text;
      }
    } catch (err) {
      // Ignore text read failures.
    }

    return `Request failed: ${response.status}`;
  }

  async function fetchJson(url, options = {}, config = {}) {
    const response = await fetchWithSecurity(url, options, config);
    if (!response.ok) {
      const error = new Error(await getErrorMessage(response));
      error.response = response;
      throw error;
    }
    return response.json();
  }

  async function getClasses() {
    return fetchJson('/api/data/classes');
  }

  async function getLessonPlans() {
    return fetchJson('/api/data/lessonPlans');
  }

  async function getNotes() {
    return fetchJson('/api/data/notes');
  }

  async function upsertSupabaseClass(classId, classPayload) {
    return fetchJson(`/api/supabase/classes/${encodeURIComponent(classId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(classPayload)
    }, {
      requireAdmin: true
    });
  }

  async function deleteSupabaseClass(classId) {
    return fetchJson(`/api/supabase/classes/${encodeURIComponent(classId)}`, {
      method: 'DELETE'
    }, {
      requireAdmin: true
    });
  }

  async function upsertSupabaseLessonPlan(planId, lessonPlanPayload) {
    return fetchJson(`/api/supabase/lessonPlans/${encodeURIComponent(planId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(lessonPlanPayload)
    }, {
      requireAdmin: true
    });
  }

  async function deleteSupabaseLessonPlan(planId) {
    return fetchJson(`/api/supabase/lessonPlans/${encodeURIComponent(planId)}`, {
      method: 'DELETE'
    }, {
      requireAdmin: true
    });
  }

  async function upsertSupabaseNote(noteId, notePayload) {
    return fetchJson(`/api/supabase/notes/${encodeURIComponent(noteId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notePayload)
    }, {
      requireAdmin: true
    });
  }

  async function deleteSupabaseNote(noteId) {
    return fetchJson(`/api/supabase/notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE'
    }, {
      requireAdmin: true
    });
  }

  async function getCurrentUser() {
    return fetchJson('/api/auth/me', {}, {
      requireAdmin: true,
      tryInteractiveLoginOnUnauthorized: false,
      promptForAdminTokenOnUnauthorized: false
    });
  }

  async function listSignupRequests(status) {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchJson(`/api/admin/signup-requests${suffix}`, {}, {
      requireAdmin: true
    });
  }

  async function listUserAccounts() {
    return fetchJson('/api/admin/accounts', {}, {
      requireAdmin: true
    });
  }

  async function approveSignupRequest(requestId, payload = {}) {
    return fetchJson(`/api/admin/signup-requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, {
      requireAdmin: true
    });
  }

  async function rejectSignupRequest(requestId, payload = {}) {
    return fetchJson(`/api/admin/signup-requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, {
      requireAdmin: true
    });
  }

  async function resetAccountPassword(identifier, newPassword) {
    return fetchJson('/api/admin/accounts/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, newPassword })
    }, {
      requireAdmin: true
    });
  }

  async function removeAccount(identifier) {
    return fetchJson(`/api/admin/accounts/${encodeURIComponent(identifier)}`, {
      method: 'DELETE'
    }, {
      requireAdmin: true
    });
  }

  window.BSTApi = {
    fetch: fetchWithSecurity,
    fetchJson,
    getClasses,
    getLessonPlans,
    getNotes,
    upsertSupabaseClass,
    deleteSupabaseClass,
    upsertSupabaseLessonPlan,
    deleteSupabaseLessonPlan,
    upsertSupabaseNote,
    deleteSupabaseNote,
    getCurrentUser,
    listSignupRequests,
    listUserAccounts,
    approveSignupRequest,
    rejectSignupRequest,
    resetAccountPassword,
    removeAccount,
    loginWithPassword,
    refreshAuthSession,
    ensureAuthenticated,
    ensureAdminAccess,
    logout,
    getAdminToken,
    setAdminToken,
    getAccessToken,
    getRefreshToken,
    setAuthSession,
    clearAuthSession,
    clearAdminToken: () => setAdminToken(''),
    getCsrfToken,
    setCsrfToken,
    isLoopbackHost: () => isLoopbackHost(window.location.hostname),
    isAdminUser
  };
})();
