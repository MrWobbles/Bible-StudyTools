import {
  approveSignupRequest,
  getErrorMessage,
  rejectSignupRequest,
  setStatus,
} from './api';
import { openAccountDeleteModal, openAccountPasswordModal } from './modals';

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRequestCard(
  request: SignupRequest,
  resolved: boolean,
  onReloadRequests: () => Promise<void>,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'admin-request-card';
  article.dataset.requestId = String(request.id || '');

  const message = request.message
    ? `<p class="admin-request-card__message">${escapeHtml(request.message)}</p>`
    : '<p class="admin-request-card__message admin-request-card__message--muted">No request message provided.</p>';
  const inviteCode = request.invite_code
    ? `<code class="admin-request-card__code">${escapeHtml(request.invite_code)}</code>`
    : '';

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
    ${
      resolved
        ? `<div class="admin-request-card__resolved"><span>Invite Code</span>${inviteCode || '<span class="admin-request-card__message--muted">Not recorded</span>'}</div>`
        : `<form class="admin-request-card__form">
            <label>Invite Code<input name="inviteCode" maxlength="32" placeholder="Auto-generate if blank" /></label>
            <label>Expires (days)<input name="expiresInDays" type="number" min="1" max="90" value="7" /></label>
            <label>Reject Reason (optional)<input name="rejectReason" maxlength="240" placeholder="Reason visible in request notes" /></label>
            <div class="admin-request-card__actions">
              <button type="submit" class="btn-primary">Approve &amp; Generate Invite</button>
              <button type="button" class="btn-danger admin-request-card__reject-btn">Reject Request</button>
            </div>
          </form>`
    }
  `;

  if (!resolved) {
    article.querySelector('form')?.addEventListener('submit', async (event: Event) => {
      event.preventDefault();
      if (!(event.currentTarget instanceof HTMLFormElement)) return;
      const form = event.currentTarget;
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      const formData = new FormData(form);
      if (submitButton) submitButton.disabled = true;
      setStatus(`Approving ${request.email || ''}...`, 'info');

      try {
        const code = await approveSignupRequest(
          request.id,
          String(formData.get('inviteCode') || '').trim(),
          Number.parseInt(String(formData.get('expiresInDays') || '7'), 10),
        );
        setStatus(`Approved ${request.email || ''}. Invite code: ${code}`, 'success');
        if (code && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(code).catch(() => undefined);
        }
        await onReloadRequests();
      } catch (err: unknown) {
        setStatus(getErrorMessage(err, 'Approval failed.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });

    article
      .querySelector('.admin-request-card__reject-btn')
      ?.addEventListener('click', async () => {
        const form = article.querySelector('form');
        const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
        const rejectButton = article.querySelector<HTMLButtonElement>(
          '.admin-request-card__reject-btn',
        );
        const reasonInput = form?.querySelector<HTMLInputElement>('input[name="rejectReason"]');
        const reason = String(reasonInput?.value || '').trim();

        if (!window.confirm(`Reject signup request from ${request.email || ''}?`)) return;
        if (submitButton) submitButton.disabled = true;
        if (rejectButton) rejectButton.disabled = true;

        setStatus(`Rejecting ${request.email || ''}...`, 'info');
        try {
          await rejectSignupRequest(request.id, reason);
          setStatus(`Rejected ${request.email || ''}.`, 'success');
          await onReloadRequests();
        } catch (err: unknown) {
          setStatus(getErrorMessage(err, 'Reject failed.'), 'error');
        } finally {
          if (submitButton) submitButton.disabled = false;
          if (rejectButton) rejectButton.disabled = false;
        }
      });
  }

  return article;
}

function buildAccountCard(account: UserAccount): HTMLElement {
  const article = document.createElement('article');
  article.className = 'admin-request-card';
  const hasIdentifier = Boolean(
    String(account?.email || '').trim() || String(account?.username || '').trim(),
  );

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

  article
    .querySelector('.account-reset-action')
    ?.addEventListener('click', () => openAccountPasswordModal(account));
  article
    .querySelector('.account-delete-action')
    ?.addEventListener('click', () => openAccountDeleteModal(account));

  return article;
}

export function renderRequests(
  requests: SignupRequest[],
  onReloadRequests: () => Promise<void>,
): void {
  const pendingListEl = document.getElementById('pending-requests-list');
  const resolvedListEl = document.getElementById('resolved-requests-list');
  const pending = requests.filter(
    (r) => String(r.status || '').trim().toLowerCase() === 'pending',
  );
  const resolved = requests.filter(
    (r) => String(r.status || '').trim().toLowerCase() !== 'pending',
  );

  if (pendingListEl) {
    pendingListEl.innerHTML = '';
    if (pending.length === 0) {
      pendingListEl.innerHTML =
        '<p class="admin-request-card__empty">No pending signup requests.</p>';
    } else {
      pending.forEach((req) =>
        pendingListEl.appendChild(buildRequestCard(req, false, onReloadRequests)),
      );
    }
  }

  if (resolvedListEl) {
    resolvedListEl.innerHTML = '';
    if (resolved.length === 0) {
      resolvedListEl.innerHTML =
        '<p class="admin-request-card__empty">No approved or processed requests yet.</p>';
    } else {
      resolved.forEach((req) =>
        resolvedListEl.appendChild(buildRequestCard(req, true, onReloadRequests)),
      );
    }
  }
}

export function renderAccounts(accounts: UserAccount[]): void {
  const activeAccountsListEl = document.getElementById('active-accounts-list');
  if (!activeAccountsListEl) return;

  activeAccountsListEl.innerHTML = '';
  if (!Array.isArray(accounts) || accounts.length === 0) {
    activeAccountsListEl.innerHTML =
      '<p class="admin-request-card__empty">No active accounts found.</p>';
    return;
  }

  accounts.forEach((account) => {
    activeAccountsListEl.appendChild(buildAccountCard(account));
  });
}
