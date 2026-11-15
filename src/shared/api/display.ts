import { fetchWithSecurity } from './client';

/**
 * Relay a display control command to all connected student screens on the same channel via the server.
 */
export async function sendDisplayCommand(
  channel: string,
  command: object
): Promise<void> {
  const normalizedChannel = String(channel || '').trim();
  if (!normalizedChannel || !command) {
    return;
  }

  try {
    await fetchWithSecurity('/api/display/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: normalizedChannel,
        command,
      }),
    });
  } catch (err) {
    console.warn('[DisplaySync] Failed to relay display command to server:', err);
  }
}
