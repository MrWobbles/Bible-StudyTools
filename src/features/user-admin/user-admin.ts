import {
  fetchAccounts,
  fetchRequests,
  getErrorMessage,
  setStatus,
} from './api';
import { bindModalEvents } from './modals';
import { renderAccounts, renderRequests } from './table';

async function loadRequests(): Promise<void> {
  if (!window.BSTApi) return;
  const pendingListEl = document.getElementById('pending-requests-list');
  const resolvedListEl = document.getElementById('resolved-requests-list');
  setStatus('Loading signup requests...', 'info');
  try {
    const requests = await fetchRequests();
    renderRequests(requests, loadRequests);
    setStatus(
      `Loaded ${requests.length} signup request${requests.length === 1 ? '' : 's'}.`,
      'success',
    );
  } catch (err: unknown) {
    if (pendingListEl) {
      pendingListEl.innerHTML =
        '<p class="admin-request-card__empty">Could not load signup requests.</p>';
    }
    if (resolvedListEl) resolvedListEl.innerHTML = '';
    setStatus(getErrorMessage(err, 'Could not load signup requests.'), 'error');
  }
}

async function loadAccounts(): Promise<void> {
  if (!window.BSTApi) return;
  const activeAccountsListEl = document.getElementById('active-accounts-list');
  try {
    const accounts = await fetchAccounts();
    renderAccounts(accounts);
  } catch (err: unknown) {
    if (activeAccountsListEl) {
      activeAccountsListEl.innerHTML =
        '<p class="admin-request-card__empty">Could not load active accounts.</p>';
    }
    setStatus(getErrorMessage(err, 'Could not load active accounts.'), 'error');
  }
}

async function setupGlobalNav(): Promise<void> {
  const nav = document.createElement('div');
  nav.id = 'floating-global-nav';
  Object.assign(nav.style, {
    position: 'fixed',
    top: '16px',
    right: '24px',
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    zIndex: '10000',
    fontFamily: 'inherit',
  });

  const themeSelect = document.createElement('select');
  themeSelect.setAttribute('data-theme-select', '');
  Object.assign(themeSelect.style, {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent, inherit)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    outline: 'none',
    padding: '0',
  });

  const themes: readonly ThemeOption[] = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'night', label: 'Night' },
    { id: 'vivid', label: 'Vivid' },
  ];

  themes.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    themeSelect.appendChild(opt);
  });

  themeSelect.value = document.documentElement.getAttribute('data-theme') || 'dark';
  themeSelect.addEventListener('change', () => {
    if (window.BSTTheme) window.BSTTheme.applyTheme(themeSelect.value);
  });

  const adminLink = document.createElement('a');
  adminLink.href = 'user-admin.html';
  Object.assign(adminLink.style, {
    color: 'var(--accent, inherit)',
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  });
  adminLink.innerHTML =
    'Admin <span id="pending-requests-badge" style="display: none; background: #e74c3c; color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; line-height: 1;">0</span>';
  adminLink.addEventListener('mouseenter', () => {
    adminLink.style.textDecoration = 'underline';
  });
  adminLink.addEventListener('mouseleave', () => {
    adminLink.style.textDecoration = 'none';
  });

  const signOutBtn = document.createElement('button');
  Object.assign(signOutBtn.style, {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent, inherit)',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    padding: '0',
    outline: 'none',
  });
  signOutBtn.textContent = 'Sign Out';
  signOutBtn.addEventListener('click', async () => {
    if (window.BSTApi) {
      await window.BSTApi.logout();
      window.location.replace('/auth.html');
    }
  });
  signOutBtn.addEventListener('mouseenter', () => {
    signOutBtn.style.textDecoration = 'underline';
  });
  signOutBtn.addEventListener('mouseleave', () => {
    signOutBtn.style.textDecoration = 'none';
  });

  nav.appendChild(themeSelect);
  nav.appendChild(adminLink);
  nav.appendChild(signOutBtn);
  document.body.appendChild(nav);

  try {
    if (window.BSTApi && typeof window.BSTApi.listSignupRequests === 'function') {
      const res = await window.BSTApi.listSignupRequests('pending');
      if (res?.requests && res.requests.length > 0) {
        const badge = document.getElementById('pending-requests-badge');
        if (badge) {
          badge.textContent = String(res.requests.length);
          badge.style.display = 'inline-block';
        }
      }
    }
  } catch (err: unknown) {
    console.warn('Could not fetch pending requests for badge:', err);
  }
}

async function init(): Promise<void> {
  if (!window.BSTApi) {
    window.location.replace('/auth.html');
    return;
  }

  void setupGlobalNav();

  const adminUser = await window.BSTApi.ensureAdminAccess({ redirectTo: '/auth.html' });
  if (!adminUser) return;

  document.getElementById('refresh-requests-btn')?.addEventListener('click', () => {
    void loadRequests();
    void loadAccounts();
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await window.BSTApi?.logout();
    window.location.replace('/auth.html');
  });

  bindModalEvents(loadAccounts);
  await Promise.all([loadRequests(), loadAccounts()]);
}

void init();
