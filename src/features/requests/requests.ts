import { initRequestModal } from './modal';
import { escapeHTML, renderPreApproved, renderQueue, renderSearchResults } from './render';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
  const preApprovedListEl = document.getElementById('preApprovedList');
  const queueListEl = document.getElementById('queueList');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const toastEl = document.getElementById('toast');

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

  function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast ${type}`;

    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3000);
  }

  async function performSearch(query: string): Promise<void> {
    if (!searchResults) return;
    try {
      searchResults.innerHTML = '<div class="loading">Searching...</div>';
      searchResults.classList.remove('hidden');

      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { error?: string; results?: DjTrack[] };

      if (!res.ok) throw new Error(data.error || 'Search failed');

      renderSearchResults(searchResults, data.results);
    } catch (err: unknown) {
      searchResults.innerHTML = `<div style="padding:1rem;color:red;">Error: ${escapeHTML(getErrorMessage(err, 'Search failed'))}</div>`;
    }
  }

  async function fetchPreApproved(): Promise<void> {
    try {
      const res = await fetch('/api/dj/pre-approved');
      const data = (await res.json()) as DjTrack[];
      renderPreApproved(preApprovedListEl, data);
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
      renderQueue(queueListEl, data, votedSongs);
    } catch {
      if (queueListEl) {
        queueListEl.innerHTML = '<div class="loading">Error loading queue</div>';
      }
    }
  }

  void fetchPreApproved();
  void fetchQueue();

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

  initRequestModal({ searchInput, searchResults, showToast, fetchQueue });
});
