export function escapeHTML(str: string | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSearchResults(searchResults: HTMLElement | null, results: DjTrack[] | undefined): void {
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

export function renderPreApproved(preApprovedListEl: HTMLElement | null, list: DjTrack[] | undefined): void {
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

export function renderQueue(queueListEl: HTMLElement | null, queue: DjTrack[], votedSongs: readonly string[]): void {
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
