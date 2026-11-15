import { initQrModal } from './qr';
import { renderDashboard } from './render';
import { initUploadModal } from './upload';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
  const pendingList = document.getElementById('pendingList');
  const activeList = document.getElementById('activeList');
  const historyList = document.getElementById('historyList');
  const pendingCount = document.getElementById('pendingCount');
  const activeCount = document.getElementById('activeCount');
  const historyCount = document.getElementById('historyCount');
  const toastEl = document.getElementById('toast');

  function showToast(message: string, isError = false): void {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.backgroundColor = isError ? 'var(--error)' : 'var(--text-primary)';
    toastEl.style.color = isError ? '#fff' : 'var(--bg-dark)';
    toastEl.classList.remove('hidden');

    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3000);
  }

  async function fetchQueue(): Promise<void> {
    try {
      const res = await fetch('/api/dj/queue');
      const data: unknown = await res.json();
      renderDashboard(data, {
        pendingList,
        activeList,
        historyList,
        pendingCount,
        activeCount,
        historyCount
      });
    } catch (err: unknown) {
      console.error('Failed to fetch queue', err);
      showToast('Connection error. Retrying...', true);
    }
  }

  void fetchQueue();
  setInterval(() => {
    void fetchQueue();
  }, 5000);

  window.updateStatus = async (id: string, status: DjTrackStatus): Promise<void> => {
    try {
      const res = await fetch(`/api/dj/queue/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Update failed');
      void fetchQueue();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Update failed'), true);
    }
  };

  window.deleteTrack = async (id: string): Promise<void> => {
    if (!confirm('Are you sure you want to permanently delete this request?')) return;
    try {
      const res = await fetch(`/api/dj/queue/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      void fetchQueue();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Delete failed'), true);
    }
  };

  initUploadModal(showToast);
  initQrModal();
});
