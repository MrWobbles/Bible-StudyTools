// requests.ts - Frontend logic for the Guest Request UI

document.addEventListener('DOMContentLoaded', () => {
  const preApprovedListEl = document.getElementById('preApprovedList');
  const queueListEl = document.getElementById('queueList');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const requestModal = document.getElementById('requestModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const requestForm = document.getElementById('requestForm');
  const selectedTrackDisplay = document.getElementById('selectedTrackDisplay');
  const toastEl = document.getElementById('toast');

  let currentSelectedTrack: DjTrack | null = null;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;
  let votedSongs: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('djVotedSongs') || '[]');
    if (Array.isArray(parsed)) {
      votedSongs = parsed.map(String);
    }
  } catch {
    votedSongs = [];
  }

  function getErrorMessage(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  function escapeHTML(str: string | undefined): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast ${type}`;

    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3000);
  }

  function renderSearchResults(results: DjTrack[] | undefined): void {
    if (!searchResults) return;
    if (!results || results.length === 0) {
      searchResults.innerHTML = '<div style="padding:1rem;">No results found.</div>';
      return;
    }

    searchResults.innerHTML = results
      .map(
        (track) => `
            <div class="track-item" onclick='selectTrackForRequest(${JSON.stringify(track).replace(/'/g, '&apos;')})'>
                <img class="track-art" src="${track.thumbnail || '/assets/images/icon.png'}" alt="Art" onerror="this.src='/assets/images/icon.png'">
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                </div>
                <button class="btn btn-secondary btn-icon"><i class="fas fa-plus"></i></button>
            </div>
        `
      )
      .join('');
  }

  async function performSearch(query: string): Promise<void> {
    if (!searchResults) return;
    try {
      searchResults.innerHTML = '<div class="loading">Searching...</div>';
      searchResults.classList.remove('hidden');

      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { error?: string; results?: DjTrack[] };

      if (!res.ok) throw new Error(data.error || 'Search failed');

      renderSearchResults(data.results);
    } catch (err: unknown) {
      searchResults.innerHTML = `<div style="padding:1rem;color:red;">Error: ${escapeHTML(getErrorMessage(err, 'Search failed'))}</div>`;
    }
  }

  function renderPreApproved(list: DjTrack[] | undefined): void {
    if (!preApprovedListEl) return;
    if (!list || list.length === 0) {
      preApprovedListEl.innerHTML = '<div class="loading">No quick picks available.</div>';
      return;
    }

    preApprovedListEl.innerHTML = list
      .map(
        (track) => `
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                </div>
                <button class="btn btn-secondary" onclick='selectTrackForRequest(${JSON.stringify(track).replace(/'/g, '&apos;')}, true)'>
                    Request
                </button>
            </div>
        `
      )
      .join('');
  }

  function renderQueue(queue: DjTrack[]): void {
    if (!queueListEl) return;
    const upcoming = queue
      .filter((q) => q.status === 'approved')
      .sort((a, b) => (b.votes || 0) - (a.votes || 0));

    if (upcoming.length === 0) {
      queueListEl.innerHTML = '<div class="loading">Queue is currently empty. Be the first to request!</div>';
      return;
    }

    queueListEl.innerHTML = upcoming
      .map((track) => {
        const hasVoted = votedSongs.includes(track.id);
        return `
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                    ${track.requestedBy ? `<div class="track-meta">Req by: ${escapeHTML(track.requestedBy)}</div>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="vote-count">${track.votes || 0}</span>
                    <button class="btn btn-icon vote-btn ${hasVoted ? 'voted' : ''}" 
                            onclick="upvoteTrack('${track.id}')" 
                            ${hasVoted ? 'disabled' : ''}>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                </div>
            </div>
        `;
      })
      .join('');
  }

  async function fetchPreApproved(): Promise<void> {
    try {
      const res = await fetch('/api/dj/pre-approved');
      const data = (await res.json()) as DjTrack[];
      renderPreApproved(data);
    } catch {
      if (preApprovedListEl) {
        preApprovedListEl.innerHTML = '<div class="loading">Error loading list</div>';
      }
    }
  }

  async function fetchQueue(): Promise<void> {
    try {
      const res = await fetch('/api/dj/queue');
      const data = (await res.json()) as DjTrack[];
      renderQueue(data);
    } catch {
      if (queueListEl) {
        queueListEl.innerHTML = '<div class="loading">Error loading queue</div>';
      }
    }
  }

  void fetchPreApproved();
  void fetchQueue();

  // Accordion Logic
  const quickPicksHeader = document.getElementById('quickPicksHeader');
  const quickPicksContent = document.getElementById('quickPicksContent');

  quickPicksHeader?.classList.add('collapsed');

  quickPicksHeader?.addEventListener('click', () => {
    const isCollapsed = quickPicksHeader.classList.contains('collapsed');
    if (isCollapsed) {
      quickPicksHeader.classList.remove('collapsed');
      quickPicksContent?.classList.remove('hidden');
    } else {
      quickPicksHeader.classList.add('collapsed');
      quickPicksContent?.classList.add('hidden');
    }
  });

  setInterval(() => {
    void fetchQueue();
  }, 15000);

  // --- Search Logic ---
  searchInput?.addEventListener('input', (e: Event) => {
    if (searchTimeout !== undefined) {
      clearTimeout(searchTimeout);
    }
    const query = e.target instanceof HTMLInputElement ? e.target.value.trim() : '';

    if (query.length < 2) {
      searchResults?.classList.add('hidden');
      return;
    }

    searchTimeout = setTimeout(() => {
      void performSearch(query);
    }, 400);
  });

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target instanceof Node ? e.target : null;
    if (searchInput && searchResults && target && !searchInput.contains(target) && !searchResults.contains(target)) {
      searchResults.classList.add('hidden');
    }
  });

  // --- Global Handlers (attached to window for inline onclick) ---
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

  window.upvoteTrack = async (id: string): Promise<void> => {
    if (votedSongs.includes(id)) return;

    try {
      const res = await fetch(`/api/dj/queue/${id}/upvote`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to upvote');

      votedSongs.push(id);
      localStorage.setItem('djVotedSongs', JSON.stringify(votedSongs));

      showToast('Vote added!', 'success');
      void fetchQueue();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to upvote'), 'error');
    }
  };

  // --- Modal & Form Logic ---
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
});
