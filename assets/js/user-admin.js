(function () {
  const statusEl = document.getElementById('requests-status');
  const pendingListEl = document.getElementById('pending-requests-list');
  const resolvedListEl = document.getElementById('resolved-requests-list');
  const activeAccountsListEl = document.getElementById('active-accounts-list');
  const accountPasswordModalEl = document.getElementById('account-password-modal');
  const accountDeleteModalEl = document.getElementById('account-delete-modal');
  const accountPasswordFormEl = document.getElementById('account-password-form');
  const accountDeleteFormEl = document.getElementById('account-delete-form');
  const accountPasswordIdentifierEl = document.getElementById('account-password-identifier');
  const accountDeleteIdentifierEl = document.getElementById('account-delete-identifier');
  const accountPasswordValueEl = document.getElementById('account-password-value');
  const accountPasswordTargetEl = document.getElementById('account-password-target');
  const accountDeleteTargetEl = document.getElementById('account-delete-target');
  const accountPasswordSubmitEl = document.getElementById('account-password-submit');
  const accountDeleteSubmitEl = document.getElementById('account-delete-submit');

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.tone = tone || '';
  }

  function formatDate(value) {
    if (!value) {
      return 'Unknown';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAccountIdentifier(account) {
    const email = String(account?.email || '').trim();
    if (email) {
      return email;
    }

    const username = String(account?.username || '').trim();
    if (username) {
      return username;
    }

    return '';
  }

  function getAccountLabel(account) {
    const username = String(account?.username || '').trim();
    const email = String(account?.email || '').trim();
    if (username && email) {
      return `${username} (${email})`;
    }
    return username || email || 'Unknown Account';
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('is-open');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('is-open');
    modalEl.setAttribute('aria-hidden', 'true');
  }

  function closeAllModals() {
    closeModal(accountPasswordModalEl);
    closeModal(accountDeleteModalEl);
  }

  function openAccountPasswordModal(account) {
    const identifier = getAccountIdentifier(account);
    if (!identifier) {
      setStatus(`Cannot reset password: ${getAccountLabel(account)} does not have an email or username.`, 'error');
      return;
    }

    if (accountPasswordIdentifierEl) {
      accountPasswordIdentifierEl.value = identifier;
    }
    if (accountPasswordTargetEl) {
      accountPasswordTargetEl.textContent = getAccountLabel(account);
    }
    if (accountPasswordValueEl) {
      accountPasswordValueEl.value = '';
    }

    openModal(accountPasswordModalEl);
    accountPasswordValueEl?.focus();
  }

  function openAccountDeleteModal(account) {
    const identifier = getAccountIdentifier(account);
    if (!identifier) {
      setStatus(`Cannot delete account: ${getAccountLabel(account)} does not have an email or username.`, 'error');
      return;
    }

    if (accountDeleteIdentifierEl) {
      accountDeleteIdentifierEl.value = identifier;
    }
    if (accountDeleteTargetEl) {
      accountDeleteTargetEl.textContent = getAccountLabel(account);
    }

    openModal(accountDeleteModalEl);
    accountDeleteSubmitEl?.focus();
  }

  function buildRequestCard(request, resolved) {
    const article = document.createElement('article');
    article.className = 'admin-request-card';
    article.dataset.requestId = String(request.id || '');

    const message = request.message ? `<p class="admin-request-card__message">${escapeHtml(request.message)}</p>` : '<p class="admin-request-card__message admin-request-card__message--muted">No request message provided.</p>';
    const inviteCode = request.invite_code ? `<code class="admin-request-card__code">${escapeHtml(request.invite_code)}</code>` : '';

    article.innerHTML = `
      <div class="admin-request-card__header">
        <div>
          <h3>${escapeHtml(request.display_name || request.username || request.email)}</h3>
          <p class="admin-request-card__meta">@${escapeHtml(request.username)} · ${escapeHtml(request.email)}</p>
        </div>
        <span class="admin-request-card__badge">${escapeHtml(request.status || 'pending')}</span>
      </div>
      <dl class="admin-request-card__details">
        <div>
          <dt>Requested</dt>
          <dd>${escapeHtml(formatDate(request.requested_at))}</dd>
        </div>
        <div>
          <dt>Source IP</dt>
          <dd>${escapeHtml(request.source_ip || 'Unknown')}</dd>
        </div>
      </dl>
      ${message}
      ${resolved ? `<div class="admin-request-card__resolved"><span>Invite Code</span>${inviteCode || '<span class="admin-request-card__message--muted">Not recorded</span>'}</div>` : `
        <form class="admin-request-card__form">
          <label>
            Invite Code
            <input name="inviteCode" maxlength="32" placeholder="Auto-generate if blank" />
          </label>
          <label>
            Expires (days)
            <input name="expiresInDays" type="number" min="1" max="90" value="7" />
          </label>
          <label>
            Reject Reason (optional)
            <input name="rejectReason" maxlength="240" placeholder="Reason visible in request notes" />
          </label>
          <div class="admin-request-card__actions">
            <button type="submit" class="btn-primary">Approve &amp; Generate Invite</button>
            <button type="button" class="btn-danger admin-request-card__reject-btn">Reject Request</button>
          </div>
        </form>
      `}
    `;

    if (!resolved) {
      article.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        submitButton.disabled = true;
        setStatus(`Approving ${request.email}...`, 'info');

        try {
          const payload = await window.BSTApi.approveSignupRequest(request.id, {
            inviteCode: String(formData.get('inviteCode') || '').trim(),
            expiresInDays: Number.parseInt(String(formData.get('expiresInDays') || '7'), 10)
          });

          const code = String(payload?.inviteCode || '').trim();
          setStatus(`Approved ${request.email}. Invite code: ${code}`, 'success');
          if (code && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).catch(() => undefined);
          }
          await loadRequests();
        } catch (err) {
          setStatus(err?.message || 'Approval failed.', 'error');
        } finally {
          submitButton.disabled = false;
        }
      });

      article.querySelector('.admin-request-card__reject-btn')?.addEventListener('click', async () => {
        const form = article.querySelector('form');
        const submitButton = form?.querySelector('button[type="submit"]');
        const rejectButton = article.querySelector('.admin-request-card__reject-btn');
        const reasonInput = form?.querySelector('input[name="rejectReason"]');
        const reason = String(reasonInput?.value || '').trim();

        const confirmed = window.confirm(`Reject signup request from ${request.email}?`);
        if (!confirmed) {
          return;
        }

        if (submitButton) submitButton.disabled = true;
        if (rejectButton) rejectButton.disabled = true;

        setStatus(`Rejecting ${request.email}...`, 'info');
        try {
          await window.BSTApi.rejectSignupRequest(request.id, {
            reason
          });
          setStatus(`Rejected ${request.email}.`, 'success');
          await loadRequests();
        } catch (err) {
          setStatus(err?.message || 'Reject failed.', 'error');
        } finally {
          if (submitButton) submitButton.disabled = false;
          if (rejectButton) rejectButton.disabled = false;
        }
      });
    }

    return article;
  }

  function buildAccountCard(account) {
    const article = document.createElement('article');
    article.className = 'admin-request-card';
    const identifier = getAccountIdentifier(account);
    const hasIdentifier = Boolean(identifier);

    article.innerHTML = `
      <div class="admin-request-card__header">
        <div>
          <h3>${escapeHtml(account.username || '(no username)')}</h3>
          <p class="admin-request-card__meta">${escapeHtml(account.email || '(no email)')}</p>
        </div>
        <span class="admin-request-card__badge">active</span>
      </div>
      <dl class="admin-request-card__details">
        <div>
          <dt>User ID</dt>
          <dd>${escapeHtml(account.user_id || 'Unknown')}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>${escapeHtml(formatDate(account.created_at))}</dd>
        </div>
      </dl>
      <div class="admin-request-card__actions admin-account-card__actions">
        <button type="button" class="btn-primary account-reset-action" ${hasIdentifier ? '' : 'disabled aria-disabled="true"'}>Reset Password</button>
        <button type="button" class="btn-danger account-delete-action" ${hasIdentifier ? '' : 'disabled aria-disabled="true"'}>Delete Account</button>
      </div>
    `;

    article.querySelector('.account-reset-action')?.addEventListener('click', () => {
      openAccountPasswordModal(account);
    });

    article.querySelector('.account-delete-action')?.addEventListener('click', () => {
      openAccountDeleteModal(account);
    });

    return article;
  }

  function renderRequests(requests) {
    const pending = requests.filter((request) => String(request.status || '').trim().toLowerCase() === 'pending');
    const resolved = requests.filter((request) => String(request.status || '').trim().toLowerCase() !== 'pending');

    pendingListEl.innerHTML = '';
    resolvedListEl.innerHTML = '';

    if (pending.length === 0) {
      pendingListEl.innerHTML = '<p class="admin-request-card__empty">No pending signup requests.</p>';
    } else {
      pending.forEach((request) => pendingListEl.appendChild(buildRequestCard(request, false)));
    }

    if (resolved.length === 0) {
      resolvedListEl.innerHTML = '<p class="admin-request-card__empty">No approved or processed requests yet.</p>';
    } else {
      resolved.forEach((request) => resolvedListEl.appendChild(buildRequestCard(request, true)));
    }
  }

  function renderAccounts(accounts) {
    if (!activeAccountsListEl) {
      return;
    }

    activeAccountsListEl.innerHTML = '';
    if (!Array.isArray(accounts) || accounts.length === 0) {
      activeAccountsListEl.innerHTML = '<p class="admin-request-card__empty">No active accounts found.</p>';
      return;
    }

    accounts.forEach((account) => {
      activeAccountsListEl.appendChild(buildAccountCard(account));
    });
  }

  async function loadRequests() {
    setStatus('Loading signup requests...', 'info');
    try {
      const payload = await window.BSTApi.listSignupRequests();
      const requests = Array.isArray(payload?.requests) ? payload.requests : [];
      renderRequests(requests);
      setStatus(`Loaded ${requests.length} signup request${requests.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      pendingListEl.innerHTML = '<p class="admin-request-card__empty">Could not load signup requests.</p>';
      resolvedListEl.innerHTML = '';
      setStatus(err?.message || 'Could not load signup requests.', 'error');
    }
  }

  async function loadAccounts() {
    try {
      const payload = await window.BSTApi.listUserAccounts();
      const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
      renderAccounts(accounts);
    } catch (err) {
      if (activeAccountsListEl) {
        activeAccountsListEl.innerHTML = '<p class="admin-request-card__empty">Could not load active accounts.</p>';
      }
      setStatus(err?.message || 'Could not load active accounts.', 'error');
    }
  }

  async function init() {
    if (!window.BSTApi) {
      window.location.replace('/auth.html');
      return;
    }

    const adminUser = await window.BSTApi.ensureAdminAccess({ redirectTo: '/auth.html' });
    if (!adminUser) {
      return;
    }

    document.getElementById('refresh-requests-btn')?.addEventListener('click', () => {
      void loadRequests();
      void loadAccounts();
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await window.BSTApi.logout();
      window.location.replace('/auth.html');
    });

    document.querySelectorAll('[data-close-modal]').forEach((buttonEl) => {
      buttonEl.addEventListener('click', () => {
        const modalId = buttonEl.getAttribute('data-close-modal');
        if (!modalId) {
          return;
        }
        closeModal(document.getElementById(modalId));
      });
    });

    [accountPasswordModalEl, accountDeleteModalEl].forEach((modalEl) => {
      modalEl?.addEventListener('click', (event) => {
        if (event.target === modalEl) {
          closeModal(modalEl);
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAllModals();
      }
    });

    accountPasswordFormEl?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const identifier = String(formData.get('identifier') || '').trim();
      const newPassword = String(formData.get('newPassword') || '');
      if (!identifier) {
        setStatus('Password reset failed: missing account identifier.', 'error');
        return;
      }

      if (accountPasswordSubmitEl) accountPasswordSubmitEl.disabled = true;
      setStatus(`Resetting password for ${identifier}...`, 'info');
      try {
        await window.BSTApi.resetAccountPassword(identifier, newPassword);
        closeModal(accountPasswordModalEl);
        if (accountPasswordFormEl) {
          accountPasswordFormEl.reset();
        }
        setStatus(`Password reset for ${identifier}.`, 'success');
      } catch (err) {
        setStatus(err?.message || 'Password reset failed.', 'error');
      } finally {
        if (accountPasswordSubmitEl) accountPasswordSubmitEl.disabled = false;
      }
    });

    accountDeleteFormEl?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const identifier = String(formData.get('identifier') || '').trim();
      if (!identifier) {
        setStatus('Account removal failed: missing account identifier.', 'error');
        return;
      }

      if (accountDeleteSubmitEl) accountDeleteSubmitEl.disabled = true;
      setStatus(`Removing account ${identifier}...`, 'info');
      try {
        await window.BSTApi.removeAccount(identifier);
        closeModal(accountDeleteModalEl);
        if (accountDeleteFormEl) {
          accountDeleteFormEl.reset();
        }
        setStatus(`Removed account ${identifier}.`, 'success');
        await loadAccounts();
      } catch (err) {
        setStatus(err?.message || 'Account removal failed.', 'error');
      } finally {
        if (accountDeleteSubmitEl) accountDeleteSubmitEl.disabled = false;
      }
    });

    await Promise.all([loadRequests(), loadAccounts()]);
  }

  void init();
})();