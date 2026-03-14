(function () {
  const STORAGE_KEY = 'bst-admin-token';
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

  function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
  }

  function getAdminToken() {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  }

  function setAdminToken(token) {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function buildHeaders(existingHeaders, requireAdmin) {
    const headers = new Headers(existingHeaders || {});
    if (requireAdmin) {
      const token = getAdminToken();
      if (token) {
        headers.set('x-bst-admin-token', token);
      }
    }
    return headers;
  }

  async function fetchWithSecurity(url, options = {}, config = {}) {
    const { requireAdmin = false, retryOnUnauthorized = true } = config;

    const runRequest = () => fetch(url, {
      ...options,
      headers: buildHeaders(options.headers, requireAdmin)
    });

    let response = await runRequest();

    if (requireAdmin && retryOnUnauthorized && response.status === 401) {
      const promptMessage = isLoopbackHost(window.location.hostname)
        ? 'This action requires an admin token on this server. Enter it to continue.'
        : 'Enter the admin token for this server.';
      const enteredToken = window.prompt(promptMessage, getAdminToken());

      if (enteredToken && enteredToken.trim()) {
        setAdminToken(enteredToken);
        response = await fetchWithSecurity(url, options, {
          ...config,
          retryOnUnauthorized: false
        });
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
    return fetchJson('/api/data/lessonplans');
  }

  window.BSTApi = {
    fetch: fetchWithSecurity,
    fetchJson,
    getClasses,
    getLessonPlans,
    getAdminToken,
    setAdminToken,
    clearAdminToken: () => setAdminToken(''),
    isLoopbackHost: () => isLoopbackHost(window.location.hostname)
  };
})();
