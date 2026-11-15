(function () {
  interface AuthPayload {
    error?: string;
    message?: string;
    defaultRedirect?: string;
    session?: AuthSession;
  }

  function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return fallback;
  }

  function getInputValue(id: string): string {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value;
    }
    return '';
  }

  function getRedirectTarget(): string {
    const query = new URLSearchParams(window.location.search);
    const redirect = String(query.get('redirect') || '/admin.html').trim();
    if (!redirect.startsWith('/')) {
      return '/admin.html';
    }
    return redirect;
  }

  function setStatus(message: string, isError: boolean): void {
    const statusEl = document.getElementById('auth-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('auth-status--error', Boolean(isError));
    statusEl.classList.toggle('auth-status--success', !isError && Boolean(message));
  }

  function activateTab(tabName: string | null): void {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-auth-tab') === tabName);
    });

    document.querySelectorAll<HTMLElement>('[data-auth-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-auth-panel') !== tabName;
    });
  }

  async function handleLoginSubmit(event: Event): Promise<void> {
    event.preventDefault();
    setStatus('Signing in...', false);

    const identifier = getInputValue('login-identifier').trim();
    const password = getInputValue('login-password');

    if (!identifier || !password) {
      setStatus('Enter your username/email and password.', true);
      return;
    }

    try {
      if (!window.BSTApi) {
        throw new Error('API client is not initialized.');
      }
      const payload = await window.BSTApi.loginWithPassword(identifier, password);
      setStatus('Signed in. Redirecting...', false);
      const nextUrl = typeof payload?.defaultRedirect === 'string' && payload.defaultRedirect
        ? payload.defaultRedirect
        : getRedirectTarget();
      window.location.replace(nextUrl);
    } catch (err: unknown) {
      setStatus(getErrorMessage(err, 'Sign in failed.'), true);
    }
  }

  async function handleSignupSubmit(event: Event): Promise<void> {
    event.preventDefault();
    setStatus('Creating account...', false);

    const username = getInputValue('signup-username').trim();
    const email = getInputValue('signup-email').trim();
    const password = getInputValue('signup-password');
    const inviteCode = getInputValue('signup-invite').trim();

    if (!username || !email || !password || !inviteCode) {
      setStatus('All sign up fields are required.', true);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password, inviteCode })
      });

      const payload = (await response.json().catch(() => ({}))) as AuthPayload;
      if (!response.ok) {
        throw new Error(payload?.error || 'Sign up failed.');
      }

      setStatus(payload?.message || 'Account created. You can now sign in.', false);
      activateTab('signin');
      const loginIdentifier = document.getElementById('login-identifier');
      if (loginIdentifier instanceof HTMLInputElement) {
        loginIdentifier.value = username;
      }
    } catch (err: unknown) {
      setStatus(getErrorMessage(err, 'Sign up failed.'), true);
    }
  }

  async function handleRequestSubmit(event: Event): Promise<void> {
    event.preventDefault();
    setStatus('Submitting request...', false);

    const displayName = getInputValue('request-name').trim();
    const username = getInputValue('request-username').trim();
    const email = getInputValue('request-email').trim();
    const message = getInputValue('request-message').trim();

    if (!username || !email) {
      setStatus('Username and email are required for requests.', true);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName, username, email, message })
      });

      const payload = (await response.json().catch(() => ({}))) as AuthPayload;
      if (!response.ok) {
        throw new Error(payload?.error || 'Request failed.');
      }

      setStatus(payload?.message || 'Request submitted successfully.', false);
      if (event.target instanceof HTMLFormElement) {
        event.target.reset();
      }
    } catch (err: unknown) {
      setStatus(getErrorMessage(err, 'Request failed.'), true);
    }
  }

  function setupTabs(): void {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activateTab(button.getAttribute('data-auth-tab'));
      });
    });
  }

  async function handleOAuthReturn(): Promise<boolean> {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = hash.get('error_description') || hash.get('error');
    const accessToken = hash.get('access_token');
    if (!oauthError && !accessToken) {
      return false;
    }

    history.replaceState(null, '', window.location.pathname + window.location.search);

    if (oauthError) {
      setStatus(oauthError.replace(/\+/g, ' '), true);
      return true;
    }

    setStatus('Signing in with Google...', false);
    try {
      const response = await fetch('/api/auth/google-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          refreshToken: hash.get('refresh_token') || '',
          expiresIn: Number(hash.get('expires_in')) || 3600
        })
      });
      const payload = (await response.json().catch(() => ({}))) as AuthPayload;
      if (!response.ok) {
        throw new Error(payload?.error || 'Google sign in failed.');
      }
      window.BSTApi?.setAuthSession(payload.session);
      setStatus('Signed in. Redirecting...', false);
      window.location.replace(getRedirectTarget());
    } catch (err: unknown) {
      window.BSTApi?.clearAuthSession?.();
      setStatus(getErrorMessage(err, 'Google sign in failed.'), true);
    }
    return true;
  }

  async function init(): Promise<void> {
    setupTabs();
    activateTab('signin');

    document.getElementById('signin-form')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('signup-form')?.addEventListener('submit', handleSignupSubmit);
    document.getElementById('request-form')?.addEventListener('submit', handleRequestSubmit);

    if (await handleOAuthReturn()) {
      return;
    }

    try {
      await window.BSTApi?.getCurrentUser();
      window.location.replace(getRedirectTarget());
    } catch {
      // Expected for signed-out users.
    }
  }

  void init();
})();
