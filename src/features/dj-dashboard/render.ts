export function escapeHTML(str: string | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderTrackCard(track: DjTrack, type: 'pending' | 'active' | 'history'): string {
  const hasDedication = Boolean(track.dedication && track.dedication.trim().length > 0);

  let actionButtons = '';
  if (type === 'pending') {
    actionButtons = `
                <button class="btn btn-block btn-success" onclick="updateStatus('${track.id}', 'approved')"><i class="fas fa-check"></i> Approve</button>
                <button class="btn btn-block btn-danger" onclick="updateStatus('${track.id}', 'rejected')"><i class="fas fa-times"></i> Reject</button>
            `;
  } else if (type === 'active') {
    const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(`${track.title} ${track.artist}`)}`;
    actionButtons = `
                <a href="${spotifySearchUrl}" target="_blank" class="btn btn-block btn-link" style="background-color: #1DB954; color: white; border: none;"><i class="fab fa-spotify"></i> Spotify</a>
                <button class="btn btn-block btn-outline" onclick="updateStatus('${track.id}', 'played')"><i class="fas fa-play-circle"></i> Mark Played</button>
                <button class="btn btn-block btn-danger" onclick="deleteTrack('${track.id}')"><i class="fas fa-trash"></i> Delete</button>
            `;
  } else if (type === 'history') {
    actionButtons = `
                <button class="btn btn-block btn-outline" onclick="updateStatus('${track.id}', 'approved')"><i class="fas fa-undo"></i> Requeue</button>
            `;
  }

  return `
            <div class="track-card status-${track.status || 'pending'}">
                <div class="track-header">
                    <div class="track-info">
                        <div class="track-title">${escapeHTML(track.title)}</div>
                        <div class="track-artist">${escapeHTML(track.artist)}</div>
                    </div>
                    ${type === 'active' ? `<div class="track-votes"><i class="fas fa-arrow-up"></i> ${track.votes || 0}</div>` : ''}
                    ${track.status === 'rejected' ? '<div class="badge" style="background:var(--error);color:black;">Rejected</div>' : ''}
                </div>
                
                <div class="track-meta-row">
                    <div><i class="fas fa-user"></i> <strong>Req by:</strong> ${escapeHTML(track.requestedBy || 'Guest')}</div>
                    ${hasDedication ? `
                        <div class="dedication-box">
                            <i class="fas fa-comment-dots"></i> "${escapeHTML(track.dedication)}"
                        </div>
                    ` : ''}
                </div>

                <div class="track-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
}

export interface DashboardElements {
  pendingList: HTMLElement | null;
  activeList: HTMLElement | null;
  historyList: HTMLElement | null;
  pendingCount: HTMLElement | null;
  activeCount: HTMLElement | null;
  historyCount: HTMLElement | null;
}

export function renderDashboard(queue: unknown, els: DashboardElements): void {
  if (!Array.isArray(queue)) return;

  const tracks = queue as DjTrack[];
  const pending = tracks.filter((q) => q.status === 'pending');
  const active = tracks.filter((q) => q.status === 'approved').sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const history = tracks.filter((q) => q.status === 'played' || q.status === 'rejected').reverse();

  if (els.pendingCount) els.pendingCount.textContent = String(pending.length);
  if (els.activeCount) els.activeCount.textContent = String(active.length);
  if (els.historyCount) els.historyCount.textContent = String(history.length);

  if (els.pendingList) {
    els.pendingList.innerHTML = pending.length
      ? pending.map((track) => renderTrackCard(track, 'pending')).join('')
      : '<div class="loading">No pending requests</div>';
  }
  if (els.activeList) {
    els.activeList.innerHTML = active.length
      ? active.map((track) => renderTrackCard(track, 'active')).join('')
      : '<div class="loading">Queue is empty</div>';
  }
  if (els.historyList) {
    els.historyList.innerHTML = history.length
      ? history.map((track) => renderTrackCard(track, 'history')).join('')
      : '<div class="loading">No history</div>';
  }
}
