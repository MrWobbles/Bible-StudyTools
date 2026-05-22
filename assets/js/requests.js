// requests.js - Frontend logic for the Guest Request UI

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

    let currentSelectedTrack = null;
    let searchTimeout = null;
    let votedSongs = JSON.parse(localStorage.getItem('djVotedSongs') || '[]');

    // --- Initialization ---
    fetchPreApproved();
    fetchQueue();

    // Accordion Logic
    const quickPicksHeader = document.getElementById('quickPicksHeader');
    const quickPicksContent = document.getElementById('quickPicksContent');
    
    // Set initial state
    quickPicksHeader.classList.add('collapsed');
    
    quickPicksHeader.addEventListener('click', () => {
        const isCollapsed = quickPicksHeader.classList.contains('collapsed');
        if (isCollapsed) {
            quickPicksHeader.classList.remove('collapsed');
            quickPicksContent.classList.remove('hidden');
        } else {
            quickPicksHeader.classList.add('collapsed');
            quickPicksContent.classList.add('hidden');
        }
    });

    // Refresh queue every 15 seconds to keep up with DJ actions
    setInterval(fetchQueue, 15000);

    // --- Search Logic ---
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 400); // debounce
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    async function performSearch(query) {
        try {
            searchResults.innerHTML = '<div class="loading">Searching...</div>';
            searchResults.classList.remove('hidden');

            const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            renderSearchResults(data.results);
        } catch (err) {
            searchResults.innerHTML = `<div style="padding:1rem;color:red;">Error: ${err.message}</div>`;
        }
    }

    function renderSearchResults(results) {
        if (!results || results.length === 0) {
            searchResults.innerHTML = '<div style="padding:1rem;">No results found.</div>';
            return;
        }

        searchResults.innerHTML = results.map(track => `
            <div class="track-item" onclick='selectTrackForRequest(${JSON.stringify(track).replace(/'/g, "&apos;")})'>
                <img class="track-art" src="${track.thumbnail || '/assets/images/icon.png'}" alt="Art" onerror="this.src='/assets/images/icon.png'">
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                </div>
                <button class="btn btn-secondary btn-icon"><i class="fas fa-plus"></i></button>
            </div>
        `).join('');
    }

    // --- Pre-approved & Queue Fetching ---
    async function fetchPreApproved() {
        try {
            const res = await fetch('/api/dj/pre-approved');
            const data = await res.json();
            renderPreApproved(data);
        } catch (err) {
            preApprovedListEl.innerHTML = `<div class="loading">Error loading list</div>`;
        }
    }

    async function fetchQueue() {
        try {
            const res = await fetch('/api/dj/queue');
            const data = await res.json();
            renderQueue(data);
        } catch (err) {
            queueListEl.innerHTML = `<div class="loading">Error loading queue</div>`;
        }
    }

    function renderPreApproved(list) {
        if (!list || list.length === 0) {
            preApprovedListEl.innerHTML = '<div class="loading">No quick picks available.</div>';
            return;
        }

        preApprovedListEl.innerHTML = list.map(track => `
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${escapeHTML(track.title)}</div>
                    <div class="track-artist">${escapeHTML(track.artist)}</div>
                </div>
                <button class="btn btn-secondary" onclick='selectTrackForRequest(${JSON.stringify(track).replace(/'/g, "&apos;")}, true)'>
                    Request
                </button>
            </div>
        `).join('');
    }

    function renderQueue(queue) {
        // Only show 'approved' songs in the upcoming list
        const upcoming = queue
            .filter(q => q.status === 'approved')
            .sort((a, b) => (b.votes || 0) - (a.votes || 0));

        if (upcoming.length === 0) {
            queueListEl.innerHTML = '<div class="loading">Queue is currently empty. Be the first to request!</div>';
            return;
        }

        queueListEl.innerHTML = upcoming.map(track => {
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
        `}).join('');
    }

    // --- Global Handlers (attached to window for inline onclick) ---
    window.selectTrackForRequest = (track, isPreApproved = false) => {
        currentSelectedTrack = { ...track, isPreApproved };
        
        // Hide search results if open
        searchResults.classList.add('hidden');
        searchInput.value = '';

        // Populate Modal
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

        // Pre-fill name from localStorage if exists
        const savedName = localStorage.getItem('djGuestName');
        if (savedName) document.getElementById('guestName').value = savedName;

        requestModal.classList.remove('hidden');
    };

    window.upvoteTrack = async (id) => {
        if (votedSongs.includes(id)) return; // Already voted

        try {
            const res = await fetch(`/api/dj/queue/${id}/upvote`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to upvote');
            
            // Save locally
            votedSongs.push(id);
            localStorage.setItem('djVotedSongs', JSON.stringify(votedSongs));
            
            showToast('Vote added!', 'success');
            fetchQueue(); // Refresh UI
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // --- Modal & Form Logic ---
    closeModalBtn.addEventListener('click', () => {
        requestModal.classList.add('hidden');
    });

    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const guestName = document.getElementById('guestName').value.trim();
        const dedication = document.getElementById('dedication').value.trim();

        if (!currentSelectedTrack || !guestName) return;

        // Save name for future requests
        localStorage.setItem('djGuestName', guestName);

        const payload = {
            id: currentSelectedTrack.id, // Custom iTunes tracks have string IDs
            title: currentSelectedTrack.title,
            artist: currentSelectedTrack.artist,
            url: currentSelectedTrack.url,
            requestedBy: guestName,
            dedication: dedication,
            status: currentSelectedTrack.isPreApproved ? 'approved' : 'pending' // Pre-approved skip 'pending' state
        };

        const submitBtn = requestForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const res = await fetch('/api/dj/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to submit request');

            showToast(currentSelectedTrack.isPreApproved ? 'Song added to queue!' : 'Request sent to DJ!', 'success');
            requestModal.classList.add('hidden');
            requestForm.reset();
            fetchQueue();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send to DJ';
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

    function showToast(message, type = 'success') {
        toastEl.textContent = message;
        toastEl.className = `toast ${type}`;
        
        setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 3000);
    }
});