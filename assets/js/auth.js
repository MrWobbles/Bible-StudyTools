(function () {
  function getRedirectTarget() {
    const query = new URLSearchParams(window.location.search);
    const redirect = String(query.get('redirect') || '/admin.html').trim();
    if (!redirect.startsWith('/')) {
      return '/admin.html';
    }
    return redirect;
  }

  function setStatus(message, isError) {
    const statusEl = document.getElementById('auth-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('auth-status--error', Boolean(isError));
    statusEl.classList.toggle('auth-status--success', !isError && Boolean(message));
  }

  function activateTab(tabName) {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-auth-tab') === tabName);
    });

    document.querySelectorAll('[data-auth-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-auth-panel') !== tabName;
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setStatus('Signing in...', false);

    const identifier = String(document.getElementById('login-identifier')?.value || '').trim();
    const password = String(document.getElementById('login-password')?.value || '');

    if (!identifier || !password) {
      setStatus('Enter your username/email and password.', true);
      return;
    }

    try {
      const payload = await window.BSTApi.loginWithPassword(identifier, password);
      setStatus('Signed in. Redirecting...', false);
      window.location.replace(payload?.defaultRedirect || getRedirectTarget());
    } catch (err) {
      setStatus(err?.message || 'Sign in failed.', true);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    setStatus('Creating account...', false);

    const username = String(document.getElementById('signup-username')?.value || '').trim();
    const email = String(document.getElementById('signup-email')?.value || '').trim();
    const password = String(document.getElementById('signup-password')?.value || '');
    const inviteCode = String(document.getElementById('signup-invite')?.value || '').trim();

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

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Sign up failed.');
      }

      setStatus(payload?.message || 'Account created. You can now sign in.', false);
      activateTab('signin');
      const loginIdentifier = document.getElementById('login-identifier');
      if (loginIdentifier) {
        loginIdentifier.value = username;
      }
    } catch (err) {
      setStatus(err?.message || 'Sign up failed.', true);
    }
  }

  async function handleRequestSubmit(event) {
    event.preventDefault();
    setStatus('Submitting request...', false);

    const displayName = String(document.getElementById('request-name')?.value || '').trim();
    const username = String(document.getElementById('request-username')?.value || '').trim();
    const email = String(document.getElementById('request-email')?.value || '').trim();
    const message = String(document.getElementById('request-message')?.value || '').trim();

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

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Request failed.');
      }

      setStatus(payload?.message || 'Request submitted successfully.', false);
      event.target.reset();
    } catch (err) {
      setStatus(err?.message || 'Request failed.', true);
    }
  }

  function setupTabs() {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activateTab(button.getAttribute('data-auth-tab'));
      });
    });
  }

  async function handleOAuthReturn() {
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Google sign in failed.');
      }
      window.BSTApi.setAuthSession(payload.session);
      setStatus('Signed in. Redirecting...', false);
      window.location.replace(getRedirectTarget());
    } catch (err) {
      window.BSTApi.clearAuthSession?.();
      setStatus(err?.message || 'Google sign in failed.', true);
    }
    return true;
  }

  async function init() {
    setupTabs();
    activateTab('signin');

    document.getElementById('signin-form')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('signup-form')?.addEventListener('submit', handleSignupSubmit);
    document.getElementById('request-form')?.addEventListener('submit', handleRequestSubmit);

    if (await handleOAuthReturn()) {
      return;
    }

    try {
      await window.BSTApi.getCurrentUser();
      window.location.replace(getRedirectTarget());
    } catch (err) {
      // Expected for signed-out users.
    }
  }

  void init();
})();
