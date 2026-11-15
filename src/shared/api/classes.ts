import { fetchJson } from './client';

export async function getClasses(): Promise<
  ClassConfig[] | { classes: ClassConfig[] } | ClassConfig
> {
  return fetchJson<ClassConfig[] | { classes: ClassConfig[] } | ClassConfig>(
    '/api/data/classes',
    {},
    { requireAdmin: true },
  );
}

export async function getLessonPlans(): Promise<unknown> {
  return fetchJson('/api/data/lessonPlans', {}, { requireAdmin: true });
}

export async function getNotes(): Promise<unknown> {
  return fetchJson('/api/data/notes', {}, { requireAdmin: true });
}

export async function deleteSupabaseClass(classId: string): Promise<unknown> {
  return fetchJson(
    `/api/supabase/classes/${encodeURIComponent(classId)}`,
    { method: 'DELETE' },
    { requireAdmin: true },
  );
}

export async function upsertSupabaseLessonPlan(
  planId: string,
  lessonPlanPayload: Record<string, unknown>,
): Promise<unknown> {
  return fetchJson(
    `/api/supabase/lessonPlans/${encodeURIComponent(planId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lessonPlanPayload),
    },
    { requireAdmin: true },
  );
}

export async function deleteSupabaseLessonPlan(planId: string): Promise<unknown> {
  return fetchJson(
    `/api/supabase/lessonPlans/${encodeURIComponent(planId)}`,
    { method: 'DELETE' },
    { requireAdmin: true },
  );
}

export async function upsertSupabaseNote(
  noteId: string,
  notePayload: Record<string, unknown>,
): Promise<unknown> {
  return fetchJson(
    `/api/supabase/notes/${encodeURIComponent(noteId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notePayload),
    },
    { requireAdmin: true },
  );
}

export async function deleteSupabaseNote(noteId: string): Promise<unknown> {
  return fetchJson(
    `/api/supabase/notes/${encodeURIComponent(noteId)}`,
    { method: 'DELETE' },
    { requireAdmin: true },
  );
}
