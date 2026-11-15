function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function initUploadModal(showToast: (message: string, isError?: boolean) => void): void {
  const uploadPicksBtn = document.getElementById('uploadPicksBtn');
  const uploadModal = document.getElementById('uploadModal');
  const closeUploadBtn = document.getElementById('closeUploadBtn');
  const picksFileInput = document.getElementById('picksFileInput');
  const processUploadBtn = document.getElementById('processUploadBtn');
  const uploadProgress = document.getElementById('uploadProgress');

  uploadPicksBtn?.addEventListener('click', () => {
    uploadModal?.classList.remove('hidden');
    if (picksFileInput instanceof HTMLInputElement) {
      picksFileInput.value = '';
    }
    uploadProgress?.classList.add('hidden');
  });

  closeUploadBtn?.addEventListener('click', () => {
    uploadModal?.classList.add('hidden');
  });

  uploadModal?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === uploadModal) uploadModal.classList.add('hidden');
  });

  processUploadBtn?.addEventListener('click', async () => {
    const file = picksFileInput instanceof HTMLInputElement ? picksFileInput.files?.[0] : undefined;
    if (!file) {
      showToast('Please select a file first.', true);
      return;
    }

    if (processUploadBtn instanceof HTMLButtonElement) {
      processUploadBtn.disabled = true;
    }

    try {
      const text = await file.text();
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

      if (lines.length === 0) throw new Error('File is empty.');

      uploadProgress?.classList.remove('hidden');
      const resolvedTracks: unknown[] = [];

      for (let i = 0; i < lines.length; i++) {
        const query = lines[i];
        if (uploadProgress) {
          uploadProgress.textContent = `Resolving track ${i + 1} of ${lines.length}...`;
        }

        try {
          const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = (await res.json()) as { results?: unknown[] };
            if (data.results && data.results.length > 0) {
              resolvedTracks.push(data.results[0]);
            }
          }
        } catch {
          console.warn('Failed to resolve:', query);
        }

        await new Promise<void>((r) => setTimeout(r, 200));
      }

      if (uploadProgress) {
        uploadProgress.textContent = 'Saving to database...';
      }

      const saveRes = await fetch('/api/dj/pre-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: resolvedTracks })
      });

      if (!saveRes.ok) throw new Error('Failed to save pre-approved list.');

      showToast(`Successfully updated Quick Picks with ${resolvedTracks.length} tracks!`);
      uploadModal?.classList.add('hidden');
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to process upload'), true);
    } finally {
      if (processUploadBtn instanceof HTMLButtonElement) {
        processUploadBtn.disabled = false;
      }
    }
  });
}
