import { fetchJson, fetchWithSecurity, type HttpError } from './client';

export async function getEditorDocument(
  docType: string,
  recordId: string,
): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(
    `/api/editor/${encodeURIComponent(docType)}/${encodeURIComponent(recordId)}`,
    {},
    { requireAdmin: true },
  );
}

export async function listEditorVersions(
  docType: string,
  recordId: string,
): Promise<unknown> {
  return fetchJson(
    `/api/editor/${encodeURIComponent(docType)}/${encodeURIComponent(recordId)}/versions`,
    {},
    { requireAdmin: true },
  );
}

export async function getEditorVersion(
  docType: string,
  recordId: string,
  seq: string | number,
): Promise<unknown> {
  return fetchJson(
    `/api/editor/${encodeURIComponent(docType)}/${encodeURIComponent(recordId)}/versions/${encodeURIComponent(seq)}`,
    {},
    { requireAdmin: true },
  );
}

export async function saveEditorDocument(
  docType: string,
  recordId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetchWithSecurity(
    `/api/editor/${encodeURIComponent(docType)}/${encodeURIComponent(recordId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { requireAdmin: true },
  );

  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  > & { error?: string };
  if (!response.ok) {
    const error: HttpError = new Error(
      result?.error || `Request failed: ${response.status}`,
    );
    error.status = response.status;
    error.payload = result;
    throw error;
  }
  return result;
}
