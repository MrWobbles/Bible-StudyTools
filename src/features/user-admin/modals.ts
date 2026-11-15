import {
  getErrorMessage,
  removeAccount,
  resetAccountPassword,
  setStatus,
} from './api';

function getAccountIdentifier(account: UserAccount | null | undefined): string {
  const email = String(account?.email || '').trim();
  if (email) return email;
  const username = String(account?.username || '').trim();
  return username || '';
}

function getAccountLabel(account: UserAccount | null | undefined): string {
  const username = String(account?.username || '').trim();
  const email = String(account?.email || '').trim();
  if (username && email) return `${username} (${email})`;
  return username || email || 'Unknown Account';
}

export function openModal(modalEl: HTMLElement | null): void {
  if (!modalEl) return;
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
}

export function closeModal(modalEl: HTMLElement | null): void {
  if (!modalEl) return;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
}

export function closeAllModals(): void {
  closeModal(document.getElementById('account-password-modal'));
  closeModal(document.getElementById('account-delete-modal'));
}

export function openAccountPasswordModal(account: UserAccount): void {
  const identifier = getAccountIdentifier(account);
  if (!identifier) {
    setStatus(
      `Cannot reset password: ${getAccountLabel(account)} does not have an email or username.`,
      'error',
    );
    return;
  }

  const identifierEl = document.getElementById('account-password-identifier');
  const targetEl = document.getElementById('account-password-target');
  const valueEl = document.getElementById('account-password-value');
  const modalEl = document.getElementById('account-password-modal');

  if (identifierEl instanceof HTMLInputElement) identifierEl.value = identifier;
  if (targetEl) targetEl.textContent = getAccountLabel(account);
  if (valueEl instanceof HTMLInputElement) valueEl.value = '';

  openModal(modalEl);
  valueEl?.focus();
}

export function openAccountDeleteModal(account: UserAccount): void {
  const identifier = getAccountIdentifier(account);
  if (!identifier) {
    setStatus(
      `Cannot delete account: ${getAccountLabel(account)} does not have an email or username.`,
      'error',
    );
    return;
  }

  const identifierEl = document.getElementById('account-delete-identifier');
  const targetEl = document.getElementById('account-delete-target');
  const submitEl = document.getElementById('account-delete-submit');
  const modalEl = document.getElementById('account-delete-modal');

  if (identifierEl instanceof HTMLInputElement) identifierEl.value = identifier;
  if (targetEl) targetEl.textContent = getAccountLabel(account);

  openModal(modalEl);
  submitEl?.focus();
}

export function bindModalEvents(onReloadAccounts: () => Promise<void>): void {
  const passwordModalEl = document.getElementById('account-password-modal');
  const deleteModalEl = document.getElementById('account-delete-modal');
  const passwordFormEl = document.getElementById('account-password-form');
  const deleteFormEl = document.getElementById('account-delete-form');
  const passwordSubmitEl = document.getElementById('account-password-submit');
  const deleteSubmitEl = document.getElementById('account-delete-submit');

  document.querySelectorAll('[data-close-modal]').forEach((buttonEl) => {
    buttonEl.addEventListener('click', () => {
      const modalId = buttonEl.getAttribute('data-close-modal');
      if (modalId) closeModal(document.getElementById(modalId));
    });
  });

  [passwordModalEl, deleteModalEl].forEach((modalEl) => {
    modalEl?.addEventListener('click', (event: MouseEvent) => {
      if (event.target === modalEl) closeModal(modalEl);
    });
  });

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeAllModals();
  });

  passwordFormEl?.addEventListener('submit', async (event: Event) => {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLFormElement)) return;
    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get('identifier') || '').trim();
    const newPassword = String(formData.get('newPassword') || '');
    if (!identifier) {
      setStatus('Password reset failed: missing account identifier.', 'error');
      return;
    }

    if (passwordSubmitEl instanceof HTMLButtonElement) passwordSubmitEl.disabled = true;
    setStatus(`Resetting password for ${identifier}...`, 'info');
    try {
      await resetAccountPassword(identifier, newPassword);
      closeModal(passwordModalEl);
      if (passwordFormEl instanceof HTMLFormElement) passwordFormEl.reset();
      setStatus(`Password reset for ${identifier}.`, 'success');
    } catch (err: unknown) {
      setStatus(getErrorMessage(err, 'Password reset failed.'), 'error');
    } finally {
      if (passwordSubmitEl instanceof HTMLButtonElement) passwordSubmitEl.disabled = false;
    }
  });

  deleteFormEl?.addEventListener('submit', async (event: Event) => {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLFormElement)) return;
    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get('identifier') || '').trim();
    if (!identifier) {
      setStatus('Account removal failed: missing account identifier.', 'error');
      return;
    }

    if (deleteSubmitEl instanceof HTMLButtonElement) deleteSubmitEl.disabled = true;
    setStatus(`Removing account ${identifier}...`, 'info');
    try {
      await removeAccount(identifier);
      closeModal(deleteModalEl);
      if (deleteFormEl instanceof HTMLFormElement) deleteFormEl.reset();
      setStatus(`Removed account ${identifier}.`, 'success');
      await onReloadAccounts();
    } catch (err: unknown) {
      setStatus(getErrorMessage(err, 'Account removal failed.'), 'error');
    } finally {
      if (deleteSubmitEl instanceof HTMLButtonElement) deleteSubmitEl.disabled = false;
    }
  });
}
