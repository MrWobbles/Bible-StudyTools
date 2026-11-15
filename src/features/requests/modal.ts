import { escapeHTML } from './render';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface RequestModalDeps {
  searchInput: HTMLElement | null;
  searchResults: HTMLElement | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  fetchQueue: () => Promise<void>;
}

export function initRequestModal({ searchInput, searchResults, showToast, fetchQueue }: RequestModalDeps): void {
  const requestModal = document.getElementById('requestModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const requestForm = document.getElementById('requestForm');
  const selectedTrackDisplay = document.getElementById('selectedTrackDisplay');

  let currentSelectedTrack: DjTrack | null = null;

  window.selectTrackForRequest = (track: DjTrack, isPreApproved = false): void => {
    currentSelectedTrack = { ...track, isPreApproved };

    searchResults?.classList.add('hidden');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = '';
    }

    if (selectedTrackDisplay) {
      selectedTrackDisplay.innerHTML = `
            <div class="track-item" style="border: none; padding: 0;">
                ${track.thumbnail ? `<img class="track-art" src="${track.thumbnail}" alt="Art">` : ''}
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                    ${isPreApproved ? '<div class="track-meta"><i class="fas fa-check-circle"></i> DJ Approved</div>' : ''}
                </div>
            </div>
        `;
    }

    const savedName = localStorage.getItem('djGuestName');
    const guestNameInput = document.getElementById('guestName');
    if (savedName && guestNameInput instanceof HTMLInputElement) {
      guestNameInput.value = savedName;
    }

    requestModal?.classList.remove('hidden');
  };

  closeModalBtn?.addEventListener('click', () => {
    requestModal?.classList.add('hidden');
  });

  requestForm?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();

    const guestNameEl = document.getElementById('guestName');
    const dedicationEl = document.getElementById('dedication');
    const guestName = guestNameEl instanceof HTMLInputElement ? guestNameEl.value.trim() : '';
    const dedication = dedicationEl instanceof HTMLInputElement || dedicationEl instanceof HTMLTextAreaElement
      ? dedicationEl.value.trim()
      : '';

    if (!currentSelectedTrack || !guestName) return;

    localStorage.setItem('djGuestName', guestName);

    const payload = {
      id: currentSelectedTrack.id,
      title: currentSelectedTrack.title,
      artist: currentSelectedTrack.artist,
      url: currentSelectedTrack.url,
      requestedBy: guestName,
      dedication,
      status: currentSelectedTrack.isPreApproved ? 'approved' : 'pending'
    };

    const submitBtn = requestForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }

    try {
      const res = await fetch('/api/dj/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to submit request');

      showToast(currentSelectedTrack.isPreApproved ? 'Song added to queue!' : 'Request sent to DJ!', 'success');
      requestModal?.classList.add('hidden');
      if (requestForm instanceof HTMLFormElement) {
        requestForm.reset();
      }
      void fetchQueue();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to submit request'), 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send to DJ';
      }
    }
  });
}
