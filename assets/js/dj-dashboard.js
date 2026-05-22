// dj-dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    const pendingList = document.getElementById('pendingList');
    const activeList = document.getElementById('activeList');
    const historyList = document.getElementById('historyList');
    
    const pendingCount = document.getElementById('pendingCount');
    const activeCount = document.getElementById('activeCount');
    const historyCount = document.getElementById('historyCount');

    const showQrBtn = document.getElementById('showQrBtn');
    const qrModal = document.getElementById('qrModal');
    const closeQrBtn = document.getElementById('closeQrBtn');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrUrlEl = document.getElementById('qrUrl');
    const toastEl = document.getElementById('toast');

    // --- Data Fetching ---
    async function fetchQueue() {
        try {
            const res = await fetch('/api/dj/queue');
            const data = await res.json();
            renderDashboard(data);
        } catch (err) {
            console.error("Failed to fetch queue", err);
            showToast('Connection error. Retrying...', true);
        }
    }

    // Auto-refresh every 5 seconds for snappy updates
    fetchQueue();
    setInterval(fetchQueue, 5000);

    // --- Rendering ---
    function renderDashboard(queue) {
        if (!Array.isArray(queue)) return;

        const pending = queue.filter(q => q.status === 'pending');
        const active = queue.filter(q => q.status === 'approved').sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const history = queue.filter(q => q.status === 'played' || q.status === 'rejected').reverse(); // Newest first

        // Update counts
        pendingCount.textContent = pending.length;
        activeCount.textContent = active.length;
        historyCount.textContent = history.length;

        // Render Lists
        pendingList.innerHTML = pending.length ? pending.map(track => renderTrackCard(track, 'pending')).join('') : '<div class="loading">No pending requests</div>';
        activeList.innerHTML = active.length ? active.map(track => renderTrackCard(track, 'active')).join('') : '<div class="loading">Queue is empty</div>';
        historyList.innerHTML = history.length ? history.map(track => renderTrackCard(track, 'history')).join('') : '<div class="loading">No history</div>';
    }

    function renderTrackCard(track, type) {
        const hasDedication = track.dedication && track.dedication.trim().length > 0;
        
        let actionButtons = '';
        if (type === 'pending') {
            actionButtons = `
                <button class="btn btn-block btn-success" onclick="updateStatus('${track.id}', 'approved')"><i class="fas fa-check"></i> Approve</button>
                <button class="btn btn-block btn-danger" onclick="updateStatus('${track.id}', 'rejected')"><i class="fas fa-times"></i> Reject</button>
            `;
        } else if (type === 'active') {
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.title + ' ' + track.artist)}`;
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
            <div class="track-card status-${track.status}">
                <div class="track-header">
                    <div class="track-info">
                        <div class="track-title">${escapeHTML(track.title)}</div>
                        <div class="track-artist">${escapeHTML(track.artist)}</div>
                    </div>
                    ${type === 'active' ? `<div class="track-votes"><i class="fas fa-arrow-up"></i> ${track.votes || 0}</div>` : ''}
                    ${track.status === 'rejected' ? `<div class="badge" style="background:var(--error);color:black;">Rejected</div>` : ''}
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

    // --- Actions ---
    window.updateStatus = async (id, status) => {
        try {
            const res = await fetch(`/api/dj/queue/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (!res.ok) throw new Error('Update failed');
            fetchQueue(); // Instant refresh
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.deleteTrack = async (id) => {
        if (!confirm('Are you sure you want to permanently delete this request?')) return;
        try {
            const res = await fetch(`/api/dj/queue/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            fetchQueue(); // Instant refresh
        } catch (err) {
            showToast(err.message, true);
        }
    };

    // --- File Upload Logic ---
    const uploadPicksBtn = document.getElementById('uploadPicksBtn');
    const uploadModal = document.getElementById('uploadModal');
    const closeUploadBtn = document.getElementById('closeUploadBtn');
    const picksFileInput = document.getElementById('picksFileInput');
    const processUploadBtn = document.getElementById('processUploadBtn');
    const uploadProgress = document.getElementById('uploadProgress');

    uploadPicksBtn.addEventListener('click', () => {
        uploadModal.classList.remove('hidden');
        picksFileInput.value = '';
        uploadProgress.classList.add('hidden');
    });

    closeUploadBtn.addEventListener('click', () => {
        uploadModal.classList.add('hidden');
    });

    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.classList.add('hidden');
    });

    processUploadBtn.addEventListener('click', async () => {
        const file = picksFileInput.files[0];
        if (!file) return showToast('Please select a file first.', true);

        processUploadBtn.disabled = true;
        
        try {
            const text = await file.text();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            if (lines.length === 0) throw new Error('File is empty.');

            uploadProgress.classList.remove('hidden');
            const resolvedTracks = [];

            for (let i = 0; i < lines.length; i++) {
                const query = lines[i];
                uploadProgress.textContent = `Resolving track ${i + 1} of ${lines.length}...`;
                
                try {
                    const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.results && data.results.length > 0) {
                            resolvedTracks.push(data.results[0]);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to resolve:', query);
                }
                
                // Slight delay to be nice to iTunes API
                await new Promise(r => setTimeout(r, 200));
            }

            uploadProgress.textContent = 'Saving to database...';

            const saveRes = await fetch('/api/dj/pre-approved', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ list: resolvedTracks })
            });

            if (!saveRes.ok) throw new Error('Failed to save pre-approved list.');

            showToast(`Successfully updated Quick Picks with ${resolvedTracks.length} tracks!`);
            uploadModal.classList.add('hidden');
            
        } catch (err) {
            showToast(err.message, true);
        } finally {
            processUploadBtn.disabled = false;
        }
    });

    // --- QR Code Logic ---
    let qrGenerated = false;

    showQrBtn.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
        
        if (!qrGenerated) {
            // Generate full URL for requests.html based on current host
            const protocol = window.location.protocol;
            const host = window.location.host; // includes port
            const fullUrl = `${protocol}//${host}/requests`;
            
            qrUrlEl.textContent = fullUrl;
            
            // Clear container before generation (just in case)
            qrcodeContainer.innerHTML = '';
            
            QRCode.toCanvas(fullUrl, { 
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }, function (err, canvas) {
                if (err) {
                    qrcodeContainer.innerHTML = '<span style="color:red">Failed to generate QR</span>';
                    console.error(err);
                } else {
                    qrcodeContainer.appendChild(canvas);
                    qrGenerated = true;
                }
            });
        }
    });

    closeQrBtn.addEventListener('click', () => {
        qrModal.classList.add('hidden');
    });

    // Close modal on outside click
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.classList.add('hidden');
        }
    });

    // --- Utils ---
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, isError = false) {
        toastEl.textContent = message;
        toastEl.style.backgroundColor = isError ? 'var(--error)' : 'var(--text-primary)';
        toastEl.style.color = isError ? '#fff' : 'var(--bg-dark)';
        toastEl.classList.remove('hidden');
        
        setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 3000);
    }
});