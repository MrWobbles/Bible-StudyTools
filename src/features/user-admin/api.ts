export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function setStatus(message: string, tone: string): void {
  const statusEl = document.getElementById('requests-status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.tone = tone || '';
}

export async function fetchRequests(): Promise<SignupRequest[]> {
  if (!window.BSTApi) return [];
  const payload = await window.BSTApi.listSignupRequests();
  return Array.isArray(payload?.requests) ? payload.requests : [];
}

export async function fetchAccounts(): Promise<UserAccount[]> {
  if (!window.BSTApi) return [];
  const payload = await window.BSTApi.listUserAccounts();
  return Array.isArray(payload?.accounts) ? payload.accounts : [];
}

export async function approveSignupRequest(
  requestId: string,
  inviteCode: string,
  expiresInDays: number,
): Promise<string> {
  if (!window.BSTApi) throw new Error('API client unavailable');
  const payload = await window.BSTApi.approveSignupRequest(requestId, {
    inviteCode,
    expiresInDays,
  });
  return String(payload?.inviteCode || '').trim();
}

export async function rejectSignupRequest(
  requestId: string,
  reason: string,
): Promise<void> {
  if (!window.BSTApi) throw new Error('API client unavailable');
  await window.BSTApi.rejectSignupRequest(requestId, { reason });
}

export async function resetAccountPassword(
  identifier: string,
  newPassword: string,
): Promise<void> {
  if (!window.BSTApi) throw new Error('API client unavailable');
  await window.BSTApi.resetAccountPassword(identifier, newPassword);
}

export async function removeAccount(identifier: string): Promise<void> {
  if (!window.BSTApi) throw new Error('API client unavailable');
  await window.BSTApi.removeAccount(identifier);
}
