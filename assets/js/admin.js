"use strict";
// Admin Interface for Lesson Plans and Class Management
(function () {
    const adminWindow = window;
    let allLessonPlans = [];
    let allClasses = [];
    let allNotes = [];
    let currentLessonPlan = null;
    let currentClass = null;
    let currentNote = null;
    let currentMediaIndex = null;
    let currentSectionIndex = null;
    // Auto-save state
    let adminAutoSaveTimer;
    const ADMIN_AUTOSAVE_DELAY_MS = 3000; // debounce: save 3 s after last keystroke
    let _toastTimeout;
    function isRecord(value) {
        return typeof value === 'object' && value !== null;
    }
    function getErrorMessage(err) {
        if (err instanceof Error) {
            return err.message;
        }
        return String(err);
    }
    function getEl(id) {
        return document.getElementById(id);
    }
    function getInput(id) {
        const el = document.getElementById(id);
        return el instanceof HTMLInputElement ? el : null;
    }
    function getTextArea(id) {
        const el = document.getElementById(id);
        return el instanceof HTMLTextAreaElement ? el : null;
    }
    function getSelect(id) {
        const el = document.getElementById(id);
        return el instanceof HTMLSelectElement ? el : null;
    }
    function getAnchor(id) {
        const el = document.getElementById(id);
        return el instanceof HTMLAnchorElement ? el : null;
    }
    // Generate GUID for class IDs
    function generateGUID() {
        return 'class-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    // Generate GUID for note IDs
    function generateNoteGUID() {
        return 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    function getLessonPlanIdentifier(plan) {
        if (!plan || typeof plan !== 'object') {
            return '';
        }
        return String(plan.id || plan.planId || '').trim();
    }
    function getNoteIdentifier(note) {
        if (!note || typeof note !== 'object') {
            return '';
        }
        return String(note.id || note.noteId || '').trim();
    }
    function showAdminSaveResult(itemLabel, result) {
        if (result?.success) {
            showAdminSaveStatus(`${itemLabel} saved`, false, 'check_circle');
            return;
        }
        showAdminSaveStatus(`${itemLabel} save failed`, true, 'warning');
    }
    // ===== GLOBAL NAV =====
    async function setupGlobalNav() {
        const nav = document.createElement('div');
        nav.id = 'floating-global-nav';
        Object.assign(nav.style, {
            position: 'fixed',
            top: '16px',
            right: '24px',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            zIndex: '10000',
            fontFamily: 'inherit',
        });
        // Theme Selector
        const themeSelect = document.createElement('select');
        themeSelect.setAttribute('data-theme-select', '');
        Object.assign(themeSelect.style, {
            background: 'transparent',
            border: 'none',
            color: 'var(--accent, inherit)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            padding: '0',
        });
        const themes = [
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' },
            { id: 'sepia', label: 'Sepia' },
            { id: 'night', label: 'Night' },
            { id: 'vivid', label: 'Vivid' },
        ];
        themes.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.label;
            themeSelect.appendChild(opt);
        });
        themeSelect.value = document.documentElement.getAttribute('data-theme') || 'dark';
        themeSelect.addEventListener('change', () => {
            if (window.BSTTheme) {
                window.BSTTheme.applyTheme(themeSelect.value);
            }
        });
        // User Admin Link
        const adminLink = document.createElement('a');
        adminLink.href = 'user-admin.html';
        Object.assign(adminLink.style, {
            color: 'var(--accent, inherit)',
            textDecoration: 'none',
            fontWeight: '500',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
        });
        adminLink.innerHTML =
            'Admin <span id="pending-requests-badge" style="display: none; background: #e74c3c; color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; line-height: 1;">0</span>';
        adminLink.addEventListener('mouseenter', () => {
            adminLink.style.textDecoration = 'underline';
        });
        adminLink.addEventListener('mouseleave', () => {
            adminLink.style.textDecoration = 'none';
        });
        // Sign Out Button
        const signOutBtn = document.createElement('button');
        Object.assign(signOutBtn.style, {
            background: 'transparent',
            border: 'none',
            color: 'var(--accent, inherit)',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px',
            padding: '0',
            outline: 'none',
        });
        signOutBtn.textContent = 'Sign Out';
        signOutBtn.addEventListener('click', async () => {
            if (window.BSTApi) {
                await window.BSTApi.logout();
                window.location.replace('/auth.html');
            }
        });
        signOutBtn.addEventListener('mouseenter', () => {
            signOutBtn.style.textDecoration = 'underline';
        });
        signOutBtn.addEventListener('mouseleave', () => {
            signOutBtn.style.textDecoration = 'none';
        });
        nav.appendChild(themeSelect);
        nav.appendChild(adminLink);
        nav.appendChild(signOutBtn);
        document.body.appendChild(nav);
        // Fetch pending requests for the badge
        try {
            if (window.BSTApi && typeof window.BSTApi.listSignupRequests === 'function') {
                const res = await window.BSTApi.listSignupRequests('pending');
                if (res && res.requests && res.requests.length > 0) {
                    const badge = getEl('pending-requests-badge');
                    if (badge) {
                        badge.textContent = String(res.requests.length);
                        badge.style.display = 'inline-block';
                    }
                }
            }
        }
        catch (err) {
            console.warn('Could not fetch pending requests for badge:', err);
        }
    }
    // Load data on page load
    window.addEventListener('DOMContentLoaded', async () => {
        console.log('Page loading...');
        void setupGlobalNav();
        await loadLessonPlans();
        console.log('Lesson plans loaded:', allLessonPlans);
        await loadClasses();
        console.log('Classes loaded:', allClasses);
        await loadNotes();
        console.log('Notes loaded:', allNotes);
        setupEventListeners();
        console.log('Event listeners set up');
        renderLessonPlansList();
        console.log('Rendered lesson plans list');
    });
    // ===== LESSON PLAN MANAGEMENT =====
    function toLessonPlan(raw) {
        if (!isRecord(raw) || typeof raw.title !== 'string') {
            return null;
        }
        const classes = Array.isArray(raw.classes)
            ? raw.classes.filter((c) => typeof c === 'string' || typeof c === 'number')
            : undefined;
        return {
            id: typeof raw.id === 'string' ? raw.id : undefined,
            planId: typeof raw.planId === 'string' ? raw.planId : undefined,
            title: raw.title,
            description: typeof raw.description === 'string' ? raw.description : undefined,
            createdDate: typeof raw.createdDate === 'string' ? raw.createdDate : '',
            order: typeof raw.order === 'number' ? raw.order : undefined,
            classes,
        };
    }
    function toNoteItem(raw) {
        if (!isRecord(raw) || typeof raw.title !== 'string') {
            return null;
        }
        return {
            id: typeof raw.id === 'string' ? raw.id : undefined,
            noteId: typeof raw.noteId === 'string' ? raw.noteId : undefined,
            title: raw.title,
            description: typeof raw.description === 'string' ? raw.description : undefined,
            createdDate: typeof raw.createdDate === 'string' ? raw.createdDate : '',
            lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : undefined,
            content: raw.content,
        };
    }
    // Load lesson plans from JSON
    async function loadLessonPlans() {
        try {
            if (!window.BSTApi) {
                allLessonPlans = [];
                return;
            }
            console.log('Fetching lesson plans from API');
            const data = await window.BSTApi.getLessonPlans();
            console.log('Parsed JSON data:', data);
            if (isRecord(data) && Array.isArray(data.lessonPlans)) {
                allLessonPlans = data.lessonPlans
                    .map(toLessonPlan)
                    .filter((plan) => plan !== null);
            }
            else {
                allLessonPlans = [];
            }
            console.log('Set allLessonPlans to:', allLessonPlans);
        }
        catch (error) {
            console.error('Failed to load lesson plans:', error);
            allLessonPlans = [];
        }
    }
    // Load classes from JSON
    async function loadClasses() {
        try {
            if (!window.BSTApi) {
                allClasses = [];
                return;
            }
            const data = await window.BSTApi.getClasses();
            if (Array.isArray(data)) {
                allClasses = data;
            }
            else if (isRecord(data) && Array.isArray(data.classes)) {
                allClasses = data.classes;
            }
            else {
                allClasses = [];
            }
        }
        catch (error) {
            console.error('Failed to load classes:', error);
            allClasses = [];
        }
    }
    // Render lesson plans list
    function renderLessonPlansList() {
        const list = getEl('lessonplans-list');
        if (!list)
            return;
        console.log('Rendering lesson plans, count:', allLessonPlans.length);
        list.innerHTML = '';
        if (allLessonPlans.length === 0) {
            list.innerHTML =
                '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No lesson plans yet. Create one to get started!</p>';
            return;
        }
        allLessonPlans.forEach((plan, index) => {
            const classCount = plan.classes ? plan.classes.length : 0;
            const card = document.createElement('div');
            card.className = 'lessonplan-card';
            card.innerHTML = `
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${escapeHtml(plan.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editLessonPlan(${index})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteLessonPlan(${index})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${escapeHtml(plan.description || '')}</div>
      <div class="lessonplan-card-footer">
        <span class="lessonplan-card-classes">${classCount} class${classCount !== 1 ? 'es' : ''}</span>
        <div style="margin-top: 8px; font-size: 11px;">Created: ${new Date(plan.createdDate).toLocaleDateString()}</div>
      </div>
      <button class="btn-primary" onclick="openLessonPlan(${index})" style="margin-top: 12px; width: 100%;">Open</button>
    `;
            list.appendChild(card);
        });
    }
    // Create new lesson plan
    function createNewLessonPlan() {
        const modalTitle = getEl('lessonplan-modal-title');
        const titleInput = getInput('lessonplan-title');
        const descInput = getTextArea('lessonplan-description');
        const modal = getEl('lessonplan-modal');
        if (modalTitle)
            modalTitle.textContent = 'New Lesson Plan';
        if (titleInput)
            titleInput.value = '';
        if (descInput)
            descInput.value = '';
        currentLessonPlan = null;
        if (modal)
            modal.style.display = 'flex';
    }
    // Edit lesson plan
    function editLessonPlan(index) {
        const plan = allLessonPlans[index];
        if (!plan)
            return;
        currentLessonPlan = index;
        const modalTitle = getEl('lessonplan-modal-title');
        const titleInput = getInput('lessonplan-title');
        const descInput = getTextArea('lessonplan-description');
        const modal = getEl('lessonplan-modal');
        if (modalTitle)
            modalTitle.textContent = 'Edit Lesson Plan';
        if (titleInput)
            titleInput.value = plan.title;
        if (descInput)
            descInput.value = plan.description || '';
        if (modal)
            modal.style.display = 'flex';
    }
    // Save lesson plan
    function saveLessonPlan() {
        const title = getInput('lessonplan-title')?.value ?? '';
        const description = getTextArea('lessonplan-description')?.value ?? '';
        let changedPlanId = '';
        if (!title.trim()) {
            alert('Please enter a lesson plan title');
            return;
        }
        if (currentLessonPlan !== null && allLessonPlans[currentLessonPlan]) {
            // Update existing - only change title and description
            allLessonPlans[currentLessonPlan].title = title.trim();
            allLessonPlans[currentLessonPlan].description = description.trim();
            changedPlanId = getLessonPlanIdentifier(allLessonPlans[currentLessonPlan]);
        }
        else {
            // Add new
            const plan = {
                id: `lesson-plan-${Date.now()}`,
                title: title.trim(),
                description: description.trim(),
                createdDate: new Date().toISOString().split('T')[0],
                order: allLessonPlans.length + 1,
                classes: [],
            };
            allLessonPlans.push(plan);
            changedPlanId = getLessonPlanIdentifier(plan);
        }
        void saveLessonPlansToFile({ changedPlanId });
        closeModal('lessonplan-modal');
        renderLessonPlansList();
    }
    // Delete lesson plan
    function deleteLessonPlan(index) {
        const plan = allLessonPlans[index];
        if (!plan)
            return;
        if (confirm('Delete this lesson plan and all its classes?')) {
            const deletedPlanId = getLessonPlanIdentifier(plan);
            allLessonPlans.splice(index, 1);
            void saveLessonPlansToFile({ deletedPlanId });
            renderLessonPlansList();
        }
    }
    // Open lesson plan for editing classes
    function openLessonPlan(index) {
        const plan = allLessonPlans[index];
        if (!plan)
            return;
        currentLessonPlan = index;
        // Update header
        const headerTitle = getEl('header-title');
        const headerSubtitle = getEl('header-subtitle');
        const backBtn = getEl('back-btn');
        if (headerTitle)
            headerTitle.textContent = plan.title;
        if (headerSubtitle)
            headerSubtitle.textContent = 'Edit classes in this lesson plan';
        if (backBtn)
            backBtn.style.display = 'block';
        // Show View Student/Teacher links when in a lesson plan
        const studentLink = getAnchor('view-student-link');
        const teacherLink = getAnchor('view-teacher-link');
        if (studentLink)
            studentLink.style.display = 'inline-flex';
        if (teacherLink)
            teacherLink.style.display = 'inline-flex';
        // Show class editor, hide lesson plan list
        const lessonPlanView = getEl('lessonplan-view');
        const classEditorView = getEl('class-editor-view');
        const classListTitle = getEl('class-list-title');
        if (lessonPlanView)
            lessonPlanView.style.display = 'none';
        if (classEditorView)
            classEditorView.style.display = 'grid';
        if (classListTitle)
            classListTitle.textContent = `Classes in "${plan.title}"`;
        // Reset class selection
        currentClass = null;
        // Reset header links to base pages until a class is selected
        if (studentLink)
            studentLink.href = 'student.html';
        if (teacherLink)
            teacherLink.href = 'teacher.html';
        renderClassListForLessonPlan();
    }
    // Go back to lesson plans view
    function goBackToLessonPlans() {
        currentLessonPlan = null;
        currentClass = null;
        const headerTitle = getEl('header-title');
        const headerSubtitle = getEl('header-subtitle');
        const backBtn = getEl('back-btn');
        if (headerTitle)
            headerTitle.textContent = 'Lesson Plans';
        if (headerSubtitle)
            headerSubtitle.textContent = 'Create and manage Bible study lesson plans';
        if (backBtn)
            backBtn.style.display = 'none';
        // Hide View Student/Teacher links when leaving lesson plan view
        const studentLink = getAnchor('view-student-link');
        const teacherLink = getAnchor('view-teacher-link');
        if (studentLink)
            studentLink.style.display = 'none';
        if (teacherLink)
            teacherLink.style.display = 'none';
        const lessonPlanView = getEl('lessonplan-view');
        const classEditorView = getEl('class-editor-view');
        const editor = getEl('editor');
        const noSelection = getEl('no-selection');
        if (lessonPlanView)
            lessonPlanView.style.display = 'grid';
        if (classEditorView)
            classEditorView.style.display = 'none';
        if (editor)
            editor.style.display = 'none';
        if (noSelection)
            noSelection.style.display = 'block';
        // Reset header links
        if (studentLink)
            studentLink.href = 'student.html';
        if (teacherLink)
            teacherLink.href = 'teacher.html';
        renderLessonPlansList();
    }
    // Save lesson plans to file
    async function saveLessonPlansToFile(_options = {}) {
        console.log('saveLessonPlansToFile called with', allLessonPlans.length, 'lesson plans');
        const jsonData = { lessonPlans: allLessonPlans };
        try {
            if (!window.BSTApi) {
                throw new Error('BSTApi is not available');
            }
            console.log('Attempting API save to /api/save/lessonPlans...');
            const response = await window.BSTApi.fetch('/api/save/lessonPlans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonData),
            }, { requireAdmin: true });
            console.log('API response status:', response.status, response.statusText);
            if (response.ok) {
                const rawResult = await response.json().catch(() => ({}));
                const result = isRecord(rawResult) ? rawResult : {};
                console.log('[OK] Lesson plans saved successfully:', result);
                showAdminSaveResult('Lesson plans', result);
                return;
            }
            else {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }
        }
        catch (err) {
            console.error('Failed to save lesson plans:', err);
            showAdminSaveStatus(`Lesson plans save failed: ${getErrorMessage(err)}`, true, 'warning');
        }
    }
    // ===== NOTES MANAGEMENT =====
    // Load notes from JSON
    async function loadNotes() {
        try {
            if (!window.BSTApi) {
                allNotes = [];
                return;
            }
            console.log('Fetching notes from API');
            const data = await window.BSTApi.getNotes();
            console.log('Parsed notes JSON data:', data);
            if (isRecord(data) && Array.isArray(data.notes)) {
                allNotes = data.notes
                    .map(toNoteItem)
                    .filter((note) => note !== null);
            }
            else {
                allNotes = [];
            }
            console.log('Set allNotes to:', allNotes);
        }
        catch (error) {
            console.error('Failed to load notes:', error);
            allNotes = [];
        }
    }
    // Render notes list
    function renderNotesList() {
        const list = getEl('notes-list');
        if (!list)
            return;
        console.log('Rendering notes, count:', allNotes.length);
        list.innerHTML = '';
        if (allNotes.length === 0) {
            list.innerHTML =
                '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No notes yet. Create one to get started!</p>';
            return;
        }
        allNotes.forEach((note, index) => {
            const card = document.createElement('div');
            card.className = 'lessonplan-card';
            card.innerHTML = `
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${escapeHtml(note.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editNoteMetadata(${index})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteNote(${index})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${escapeHtml(note.description || '')}</div>
      <div class="lessonplan-card-footer">
        <div style="font-size: 11px;">Created: ${new Date(note.createdDate).toLocaleDateString()}</div>
        ${note.lastModified ? `<div style="font-size: 11px;">Modified: ${new Date(note.lastModified).toLocaleDateString()}</div>` : ''}
      </div>
      <button class="btn-primary" onclick="openNoteEditor(${index})" style="margin-top: 12px; width: 100%;"><span class="material-symbols-outlined">edit_note</span>Edit Note</button>
    `;
            list.appendChild(card);
        });
    }
    // Switch to notes view
    function switchToNotesView() {
        const lessonPlanView = getEl('lessonplan-view');
        const notesView = getEl('notes-view');
        const headerTitle = getEl('header-title');
        const headerSubtitle = getEl('header-subtitle');
        if (lessonPlanView)
            lessonPlanView.style.display = 'none';
        if (notesView)
            notesView.style.display = 'grid';
        if (headerTitle)
            headerTitle.textContent = 'Notes';
        if (headerSubtitle)
            headerSubtitle.textContent = 'Create and manage personal notes';
        renderNotesList();
    }
    // Switch to lesson plans view
    function switchToLessonPlansView() {
        const notesView = getEl('notes-view');
        const lessonPlanView = getEl('lessonplan-view');
        const headerTitle = getEl('header-title');
        const headerSubtitle = getEl('header-subtitle');
        if (notesView)
            notesView.style.display = 'none';
        if (lessonPlanView)
            lessonPlanView.style.display = 'grid';
        if (headerTitle)
            headerTitle.textContent = 'Lesson Plans';
        if (headerSubtitle)
            headerSubtitle.textContent = 'Create and manage Bible study lesson plans';
        renderLessonPlansList();
    }
    // Create new note
    function createNewNote() {
        const modalTitle = getEl('note-modal-title');
        const titleInput = getInput('note-title');
        const descInput = getTextArea('note-description');
        const modal = getEl('note-modal');
        if (modalTitle)
            modalTitle.textContent = 'New Note';
        if (titleInput)
            titleInput.value = '';
        if (descInput)
            descInput.value = '';
        currentNote = null;
        if (modal)
            modal.style.display = 'flex';
    }
    // Edit note metadata
    function editNoteMetadata(index) {
        const note = allNotes[index];
        if (!note)
            return;
        currentNote = index;
        const modalTitle = getEl('note-modal-title');
        const titleInput = getInput('note-title');
        const descInput = getTextArea('note-description');
        const modal = getEl('note-modal');
        if (modalTitle)
            modalTitle.textContent = 'Edit Note';
        if (titleInput)
            titleInput.value = note.title;
        if (descInput)
            descInput.value = note.description || '';
        if (modal)
            modal.style.display = 'flex';
    }
    // Save note metadata (title, description)
    function saveNoteMetadata() {
        const title = getInput('note-title')?.value ?? '';
        const description = getTextArea('note-description')?.value ?? '';
        if (!title.trim()) {
            alert('Please enter a note title');
            return;
        }
        let changedNoteId = null;
        if (currentNote !== null && allNotes[currentNote]) {
            // Update existing - only change title and description
            allNotes[currentNote].title = title.trim();
            allNotes[currentNote].description = description.trim();
            allNotes[currentNote].lastModified = new Date().toISOString();
            changedNoteId = getNoteIdentifier(allNotes[currentNote]);
        }
        else {
            // Add new
            const newId = generateNoteGUID();
            const note = {
                id: newId,
                title: title.trim(),
                description: description.trim(),
                createdDate: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                content: null,
            };
            allNotes.push(note);
            changedNoteId = newId;
        }
        void saveNotesToFile({ changedNoteId });
        closeModal('note-modal');
        renderNotesList();
    }
    // Delete note
    function deleteNote(index) {
        const note = allNotes[index];
        if (!note)
            return;
        if (confirm('Delete this note? This action cannot be undone.')) {
            const deletedNoteId = getNoteIdentifier(note);
            allNotes.splice(index, 1);
            void saveNotesToFile({ deletedNoteId });
            renderNotesList();
        }
    }
    // Open note in editor
    function openNoteEditor(index) {
        const note = allNotes[index];
        if (!note)
            return;
        const noteId = getNoteIdentifier(note);
        // Open editor with note ID
        window.location.href = `editor.html?note=${encodeURIComponent(noteId)}`;
    }
    // Save notes to file
    async function saveNotesToFile(_options = {}) {
        console.log('saveNotesToFile called with', allNotes.length, 'notes');
        const jsonData = { notes: allNotes };
        try {
            if (!window.BSTApi) {
                throw new Error('BSTApi is not available');
            }
            console.log('Attempting API save to /api/save/notes...');
            const response = await window.BSTApi.fetch('/api/save/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonData),
            }, { requireAdmin: true });
            console.log('API response status:', response.status, response.statusText);
            if (response.ok) {
                const rawResult = await response.json().catch(() => ({}));
                const result = isRecord(rawResult) ? rawResult : {};
                console.log('[OK] Notes saved successfully:', result);
                showAdminSaveResult('Notes', result);
                return;
            }
            else {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }
        }
        catch (err) {
            console.error('Failed to save notes:', err);
            showAdminSaveStatus(`Notes save failed: ${getErrorMessage(err)}`, true, 'warning');
        }
    }
    // ===== CLASS MANAGEMENT (within a lesson plan) =====
    // Render classes for current lesson plan
    function renderClassListForLessonPlan() {
        const classList = getEl('classes-list');
        if (!classList || currentLessonPlan === null)
            return;
        classList.innerHTML = '';
        const plan = allLessonPlans[currentLessonPlan];
        if (!plan)
            return;
        const planClassIds = plan.classes || [];
        // Show classes that are in this lesson plan
        planClassIds.forEach((classId) => {
            const cls = allClasses.find((c) => c.id === classId || c.classNumber === classId); // Support both old and new format
            if (cls) {
                const index = allClasses.indexOf(cls);
                const item = document.createElement('div');
                item.className = 'class-item' + (currentClass === index ? ' active' : '');
                item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
              <span class="class-item-title">${escapeHtml(cls.title || '')}</span>
          </div>
          <button class="btn-icon" onclick="removeClassFromLessonPlan(${index})" title="Remove"><span class="material-symbols-outlined">delete</span></button>
        </div>
      `;
                item.addEventListener('click', (e) => {
                    const target = e.target;
                    if (!(target instanceof Element) || !target.closest('button')) {
                        selectClass(index);
                    }
                });
                classList.appendChild(item);
            }
        });
        // Show option to add more classes
        const addOption = document.createElement('div');
        addOption.className = 'class-item';
        addOption.style.cursor = 'pointer';
        addOption.style.textAlign = 'center';
        addOption.style.color = 'var(--accent)';
        addOption.innerHTML = '+ Add Existing Class';
        addOption.addEventListener('click', showAvailableClassesModal);
        classList.appendChild(addOption);
    }
    // Show modal to add existing class to lesson plan
    function showAvailableClassesModal() {
        if (currentLessonPlan === null)
            return;
        const plan = allLessonPlans[currentLessonPlan];
        if (!plan)
            return;
        const planClassIds = plan.classes || [];
        // Find classes not yet in this plan
        const availableClasses = allClasses.filter((cls) => {
            const classId = cls.id ?? cls.classNumber;
            return classId !== undefined && !planClassIds.includes(classId);
        });
        if (availableClasses.length === 0) {
            alert('All available classes are already in this lesson plan.');
            return;
        }
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        availableClasses.forEach((cls) => {
            const index = allClasses.indexOf(cls);
            html += `
      <button class="btn-secondary" style="text-align: left; padding: 10px;" onclick="addClassToLessonPlan(${index}); closeModal('class-add-modal');">
        <strong>${escapeHtml(cls.title || '')}</strong><br/>
        <span style="font-size: 12px; color: var(--muted);">${escapeHtml(cls.subtitle || '')}</span>
      </button>
    `;
        });
        html += '</div>';
        const content = getEl('class-add-modal-content');
        const modal = getEl('class-add-modal');
        if (content)
            content.innerHTML = html;
        if (modal)
            modal.style.display = 'flex';
    }
    // Add class to lesson plan
    function addClassToLessonPlan(classIndex) {
        if (currentLessonPlan === null)
            return;
        const cls = allClasses[classIndex];
        const plan = allLessonPlans[currentLessonPlan];
        if (!cls || !plan)
            return;
        const classId = cls.id ?? cls.classNumber; // Support both old and new format
        if (classId === undefined)
            return;
        if (!plan.classes) {
            plan.classes = [];
        }
        if (!plan.classes.includes(classId)) {
            plan.classes.push(classId);
            renderClassListForLessonPlan();
            void saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
        }
    }
    // Remove class from lesson plan
    function removeClassFromLessonPlan(classIndex) {
        if (currentLessonPlan === null)
            return;
        const cls = allClasses[classIndex];
        const plan = allLessonPlans[currentLessonPlan];
        if (!cls || !plan)
            return;
        const classId = cls.id ?? cls.classNumber; // Support both old and new format
        plan.classes = (plan.classes || []).filter((id) => id !== classId);
        renderClassListForLessonPlan();
        void saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
    }
    // Create new class
    function createNewClass() {
        const newClassId = generateGUID();
        const newClass = {
            id: newClassId,
            classNumber: allClasses.length + 1, // Keep for backward compatibility, but won't be used as identifier
            title: 'New Class',
            subtitle: '',
            instructor: '',
            channelName: `class-${allClasses.length + 1}-control`,
            media: [],
            outline: [],
            content: {
                html: '<p>Start writing your class content here...</p>',
                json: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Start writing your class content here...' }],
                        },
                    ],
                },
                text: 'Start writing your class content here...',
            },
        };
        allClasses.push(newClass);
        console.log('Created new class:', newClass);
        // Add to current lesson plan if one is open
        if (currentLessonPlan !== null && allLessonPlans[currentLessonPlan]) {
            const plan = allLessonPlans[currentLessonPlan];
            if (!plan.classes) {
                plan.classes = [];
            }
            if (!plan.classes.includes(newClassId)) {
                plan.classes.push(newClassId);
            }
            renderClassListForLessonPlan();
        }
        // Select the new class for editing
        selectClass(allClasses.length - 1);
        // Auto-save the new class AND the lesson plan
        console.log('Auto-saving new class...');
        void saveClassToFile({ changedClassId: newClassId });
        if (currentLessonPlan !== null) {
            console.log('Auto-saving lesson plan...');
            void saveLessonPlansToFile();
        }
    }
    // Open content editor for current class
    function openContentEditor() {
        if (currentClass === null || !allClasses[currentClass]) {
            alert('Please select a class first');
            return;
        }
        const cls = allClasses[currentClass];
        const classId = cls.id ?? cls.classNumber ?? ''; // Support both old and new format
        window.open(`editor.html?class=${classId}`, '_blank');
    }
    // ===== CLASS EDITING =====
    // Select and load a class for editing
    function selectClass(index) {
        const cls = allClasses[index];
        if (!cls)
            return;
        currentClass = index;
        // Ensure outline/media arrays exist to avoid runtime errors when editing
        if (!Array.isArray(cls.media))
            cls.media = [];
        if (!Array.isArray(cls.outline))
            cls.outline = [];
        // Update UI
        const editor = getEl('editor');
        const noSelection = getEl('no-selection');
        const editTitle = getEl('edit-title');
        const saveClassBtn = getEl('save-class-btn');
        const editContentBtn = getEl('edit-content-btn');
        if (editor)
            editor.style.display = 'block';
        if (noSelection)
            noSelection.style.display = 'none';
        if (editTitle)
            editTitle.textContent = `Editing: ${cls.title || ''}`;
        if (saveClassBtn)
            saveClassBtn.style.display = 'block';
        if (editContentBtn)
            editContentBtn.style.display = 'block';
        // Populate form
        const classTitleEl = getInput('classTitle');
        const classSubtitleEl = getInput('classSubtitle');
        const classInstructorEl = getInput('classInstructor');
        const classChannelEl = getInput('classChannel');
        if (classTitleEl)
            classTitleEl.value = cls.title || '';
        if (classSubtitleEl)
            classSubtitleEl.value = cls.subtitle || '';
        if (classInstructorEl)
            classInstructorEl.value = cls.instructor || '';
        if (classChannelEl)
            classChannelEl.value = cls.channelName || '';
        // Render media list
        renderMediaList(cls);
        // Render outline list
        renderOutlineList(cls);
        // Update header links to include the selected class ID
        const classId = cls.id ?? cls.classNumber ?? ''; // Support both old and new format
        const studentLink = getAnchor('view-student-link');
        const teacherLink = getAnchor('view-teacher-link');
        if (studentLink)
            studentLink.href = `student.html?class=${classId}`;
        if (teacherLink)
            teacherLink.href = `teacher.html?class=${classId}`;
        renderClassListForLessonPlan();
    }
    // Render media list
    function renderMediaList(cls) {
        const mediaList = getEl('media-list');
        if (!mediaList)
            return;
        mediaList.innerHTML = '';
        (cls.media || []).forEach((media, index) => {
            const item = document.createElement('div');
            item.className = 'media-item';
            item.innerHTML = `
      <div class="media-item-info">
        <div class="media-item-title">
          ${media.title || ''}
          ${media.primary ? '<span style="color: var(--accent); margin-left: 8px;">●</span>' : ''}
        </div>
        <div class="media-item-type">${media.type}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editMedia(${index})">Edit</button>
        <button class="btn-icon" onclick="deleteMedia(${index})">Delete</button>
      </div>
    `;
            mediaList.appendChild(item);
        });
    }
    // Render outline sections list
    function renderOutlineList(cls) {
        const outlineList = getEl('outline-list');
        if (!outlineList)
            return;
        outlineList.innerHTML = '';
        // Guard against missing outline array
        const outline = Array.isArray(cls.outline) ? cls.outline : [];
        outline.forEach((section, index) => {
            const questions = Array.isArray(section?.questions) ? section.questions : [];
            const summary = section?.summary || '(No summary)';
            const id = section?.id || '';
            const item = document.createElement('div');
            item.className = 'section-item';
            item.innerHTML = `
      <div class="section-item-info">
        <div class="section-item-title">${summary}</div>
        <div class="section-item-id">${id}</div>
        <div class="section-item-type" style="font-size: 12px; color: var(--muted); margin-top: 2px;">
          ${questions.length} questions
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editSection(${index})">Edit</button>
        <button class="btn-icon" onclick="deleteSection(${index})">Delete</button>
      </div>
    `;
            outlineList.appendChild(item);
        });
    }
    // Edit media item
    function editMedia(index) {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        const media = cls?.media?.[index];
        if (!media)
            return;
        currentMediaIndex = index;
        const modalTitle = getEl('media-modal-title');
        const idInput = getInput('media-id');
        const typeSelect = getSelect('media-type');
        const titleInput = getInput('media-title');
        const primaryInput = getInput('media-primary');
        const modal = getEl('media-modal');
        if (modalTitle)
            modalTitle.textContent = 'Edit Media';
        if (idInput)
            idInput.value = media.id || '';
        if (typeSelect)
            typeSelect.value = media.type;
        if (titleInput)
            titleInput.value = media.title || '';
        if (primaryInput)
            primaryInput.checked = Boolean(media.primary);
        updateMediaForm();
        populateMediaForm(media);
        if (modal)
            modal.style.display = 'flex';
    }
    // Add new media item
    function addMedia() {
        currentMediaIndex = null;
        const modalTitle = getEl('media-modal-title');
        const idInput = getInput('media-id');
        const typeSelect = getSelect('media-type');
        const titleInput = getInput('media-title');
        const primaryInput = getInput('media-primary');
        const modal = getEl('media-modal');
        if (modalTitle)
            modalTitle.textContent = 'Add Media';
        if (idInput)
            idInput.value = '';
        if (typeSelect)
            typeSelect.value = 'video';
        if (titleInput)
            titleInput.value = '';
        if (primaryInput)
            primaryInput.checked = false;
        updateMediaForm();
        if (modal)
            modal.style.display = 'flex';
    }
    // Update media form fields based on type
    function updateMediaForm() {
        const type = getSelect('media-type')?.value ?? '';
        const fieldsContainer = getEl('media-fields');
        if (!fieldsContainer)
            return;
        fieldsContainer.innerHTML = '';
        if (type === 'video') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label for="media-youtube-id">YouTube Video ID</label>
        <input type="text" id="media-youtube-id" placeholder="dQw4w9WgXcQ" />
        <button type="button" class="btn-secondary" onclick="downloadYouTubeVideo()" style="margin-top: 8px; width: 100%;">Download YouTube Video to Local</button>
        <small>Enter a YouTube video ID to stream online or download for offline use</small>
      </div>

      <div class="form-group" style="margin-top: 20px;">
        <label style="font-weight: 600; margin-bottom: 10px;">Local Video Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-video-mode" value="link" checked onchange="toggleMediaInputMode('video')" />
            <span>Link to Video</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-video-mode" value="upload" onchange="toggleMediaInputMode('video')" />
            <span>Upload Video</span>
          </label>
        </div>

        <div id="media-video-link-group">
          <input type="text" id="media-local-video" placeholder="assets/video/example.mp4" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('video')" style="margin-top: 8px; width: 100%;">Download URL to Local</button>
          <small>Paste a video URL to download and store locally</small>
        </div>

        <div id="media-video-upload-group" style="display: none;">
          <input type="file" id="media-video-file" accept="video/*" onchange="handleMediaUpload('video', this.files[0])" />
          <small>Supported formats: MP4, WebM, MOV</small>
        </div>
      </div>

      <div class="form-group">
        <label for="media-duration">Duration (seconds)</label>
        <input type="number" id="media-duration" placeholder="e.g., 3600" />
        <small>Total video length in seconds</small>
      </div>

      <div class="form-group">
        <label for="media-pause-points">Pause Points (comma-separated timestamps)</label>
        <input type="text" id="media-pause-points" placeholder="30, 120, 450" />
        <small>Times in seconds where the video should pause for discussion</small>
      </div>
    `;
        }
        else if (type === 'pdf') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">PDF Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-pdf-mode" value="link" checked onchange="toggleMediaInputMode('pdf')" />
            <span>Link to PDF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-pdf-mode" value="upload" onchange="toggleMediaInputMode('pdf')" />
            <span>Upload PDF</span>
          </label>
        </div>

        <div id="media-pdf-link-group">
          <input type="text" id="media-pdf-url" placeholder="assets/documents/example.pdf" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('pdf')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste a PDF URL to download and store locally</small>
        </div>

        <div id="media-pdf-upload-group" style="display: none;">
          <input type="file" id="media-pdf-file" accept=".pdf" onchange="handleMediaUpload('pdf', this.files[0])" />
          <small>Upload a PDF document</small>
        </div>
      </div>
    `;
        }
        else if (type === 'images') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Image Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-images-mode" value="link" checked onchange="toggleMediaInputMode('images')" />
            <span>Link to Images</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-images-mode" value="upload" onchange="toggleMediaInputMode('images')" />
            <span>Upload Images</span>
          </label>
        </div>

        <div id="media-images-link-group">
          <textarea id="media-image-urls" rows="5" placeholder="assets/images/img1.jpg&#10;assets/images/img2.jpg&#10;assets/images/img3.jpg"></textarea>
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('images')" style="margin-top: 8px; width: 100%;">Download All to Local</button>
          <small>Enter one image URL per line</small>
        </div>

        <div id="media-images-upload-group" style="display: none;">
          <input type="file" id="media-images-files" accept="image/*" multiple onchange="handleMediaUpload('images', this.files)" />
          <small>Select multiple image files (JPG, PNG, GIF, etc.)</small>
        </div>
      </div>
    `;
        }
        else if (type === 'audio') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Audio Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-audio-mode" value="link" checked onchange="toggleMediaInputMode('audio')" />
            <span>Link to Audio</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-audio-mode" value="upload" onchange="toggleMediaInputMode('audio')" />
            <span>Upload Audio</span>
          </label>
        </div>

        <div id="media-audio-link-group">
          <input type="text" id="media-audio-url" placeholder="assets/audio/podcast.mp3" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('audio')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste an audio URL to download and store locally</small>
        </div>

        <div id="media-audio-upload-group" style="display: none;">
          <input type="file" id="media-audio-file" accept="audio/*" onchange="handleMediaUpload('audio', this.files[0])" />
          <small>Supported formats: MP3, WAV, OGG, etc.</small>
        </div>
      </div>
    `;
        }
        else if (type === 'document') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label style="font-weight: 600; margin-bottom: 10px;">Document Source</label>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-doc-mode" value="link" checked onchange="toggleMediaInputMode('document')" />
            <span>Link to Document</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="media-doc-mode" value="upload" onchange="toggleMediaInputMode('document')" />
            <span>Upload Document</span>
          </label>
        </div>

        <div id="media-doc-link-group">
          <input type="text" id="media-doc-url" placeholder="assets/documents/notes.docx" />
          <button type="button" class="btn-secondary" onclick="downloadMediaToLocal('document')" style="margin-top: 8px; width: 100%;">Download to Local</button>
          <small>Paste a document URL to download and store locally</small>
        </div>

        <div id="media-doc-upload-group" style="display: none;">
          <input type="file" id="media-doc-file" accept=".doc,.docx,.txt,.rtf" onchange="handleMediaUpload('document', this.files[0])" />
          <small>Supported formats: DOC, DOCX, TXT, RTF</small>
        </div>
      </div>
    `;
        }
        else if (type === 'link') {
            fieldsContainer.innerHTML = `
      <div class="form-group">
        <label for="media-link-url">External Link URL</label>
        <input type="text" id="media-link-url" placeholder="https://example.com" />
        <small>Link to an external website or resource</small>
      </div>
    `;
        }
    }
    // Populate media form with existing data
    function populateMediaForm(media) {
        const type = getSelect('media-type')?.value ?? '';
        const sources = media.sources;
        if (type === 'video' && sources) {
            const youtubeSource = sources.find((s) => s.type === 'youtube' || s.format === 'youtube');
            const localSource = sources.find((s) => s.type === 'local');
            if (youtubeSource) {
                const ytInput = getInput('media-youtube-id');
                if (ytInput)
                    ytInput.value = youtubeSource.url || youtubeSource.videoId || '';
            }
            if (localSource) {
                const localInput = getInput('media-local-video');
                if (localInput)
                    localInput.value = localSource.url || '';
            }
            if (media.duration !== undefined) {
                const durationInput = getInput('media-duration');
                if (durationInput)
                    durationInput.value = String(media.duration);
            }
            if (media.pausePoints && media.pausePoints.length > 0) {
                const points = media.pausePoints.map((p) => (typeof p === 'object' ? p.time : p)).join(', ');
                const pauseInput = getInput('media-pause-points');
                if (pauseInput)
                    pauseInput.value = points;
            }
        }
        else if (type === 'pdf' && sources) {
            const source = sources[0];
            const pdfInput = getInput('media-pdf-url');
            if (source && pdfInput) {
                pdfInput.value = source.url || '';
            }
        }
        else if (type === 'images' && sources) {
            const urls = sources.map((s) => s.url || '').join('\n');
            const imageUrlsInput = getTextArea('media-image-urls');
            if (imageUrlsInput)
                imageUrlsInput.value = urls;
        }
        else if (type === 'audio' && sources) {
            const source = sources[0];
            const audioInput = getInput('media-audio-url');
            if (source && audioInput) {
                audioInput.value = source.url || '';
            }
        }
        else if (type === 'document' && sources) {
            const source = sources[0];
            const docInput = getInput('media-doc-url');
            if (source && docInput) {
                docInput.value = source.url || '';
            }
        }
        else if (type === 'link' && sources) {
            const source = sources[0];
            const linkInput = getInput('media-link-url');
            if (source && linkInput) {
                linkInput.value = source.url || '';
            }
        }
    }
    // Save media item
    function saveMedia() {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        if (!cls)
            return;
        const type = getSelect('media-type')?.value ?? '';
        const id = getInput('media-id')?.value ?? '';
        const title = getInput('media-title')?.value ?? '';
        const primary = getInput('media-primary')?.checked ?? false;
        if (!id || !title) {
            alert('Please fill in ID and Title');
            return;
        }
        const sources = [];
        const media = {
            id,
            type,
            title,
            primary,
            sources,
        };
        // Build sources based on type
        if (type === 'video') {
            const youtubeId = getInput('media-youtube-id')?.value ?? '';
            const localVideo = getInput('media-local-video')?.value ?? '';
            if (youtubeId) {
                sources.push({ type: 'youtube', url: youtubeId });
            }
            if (localVideo) {
                sources.push({ type: 'local', url: localVideo });
            }
            const duration = getInput('media-duration')?.value ?? '';
            if (duration) {
                media.duration = parseInt(duration, 10);
            }
            const pausePoints = getInput('media-pause-points')?.value ?? '';
            if (pausePoints) {
                media.pausePoints = pausePoints
                    .split(',')
                    .map((p) => parseInt(p.trim(), 10))
                    .filter((p) => !isNaN(p));
            }
            else {
                media.pausePoints = [];
            }
        }
        else if (type === 'pdf') {
            const url = getInput('media-pdf-url')?.value ?? '';
            if (url) {
                sources.push({ type: 'pdf', url });
            }
        }
        else if (type === 'images') {
            const urlsText = getTextArea('media-image-urls')?.value ?? '';
            const urls = urlsText.split('\n').filter((u) => u.trim());
            urls.forEach((url) => {
                sources.push({ type: 'image', url: url.trim() });
            });
        }
        else if (type === 'audio') {
            const url = getInput('media-audio-url')?.value ?? '';
            if (url) {
                sources.push({ type: 'audio', url });
            }
        }
        else if (type === 'document') {
            const url = getInput('media-doc-url')?.value ?? '';
            if (url) {
                sources.push({ type: 'document', url });
            }
        }
        else if (type === 'link') {
            const url = getInput('media-link-url')?.value ?? '';
            if (url) {
                sources.push({ type: 'link', url });
            }
        }
        if (!Array.isArray(cls.media)) {
            cls.media = [];
        }
        // If this is primary, set others to non-primary
        if (primary) {
            cls.media.forEach((m) => {
                m.primary = false;
            });
        }
        if (currentMediaIndex !== null) {
            // Update existing
            cls.media[currentMediaIndex] = media;
        }
        else {
            // Add new
            cls.media.push(media);
        }
        renderMediaList(cls);
        closeModal('media-modal');
        // Auto-save after media changes
        void saveClassToFile();
    }
    // Delete media item
    function deleteMedia(index) {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        if (!cls || !Array.isArray(cls.media))
            return;
        if (confirm('Delete this media item?')) {
            cls.media.splice(index, 1);
            renderMediaList(cls);
            // Auto-save after deletion
            void saveClassToFile();
        }
    }
    // Edit section
    function editSection(index) {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        const section = cls?.outline?.[index];
        if (!section)
            return;
        currentSectionIndex = index;
        // Normalize arrays to avoid runtime errors when fields are missing
        const points = Array.isArray(section.points)
            ? section.points.map((p) => (typeof p === 'string' ? p : p.text))
            : [];
        const questions = Array.isArray(section.questions) ? section.questions : [];
        const modalTitle = getEl('section-modal-title');
        const idInput = getInput('section-id');
        const summaryInput = getInput('section-summary');
        const defaultOpenInput = getInput('section-defaultOpen');
        const pointsInput = getTextArea('section-points');
        const modal = getEl('section-modal');
        if (modalTitle)
            modalTitle.textContent = 'Edit Section';
        if (idInput)
            idInput.value = section.id || '';
        if (summaryInput)
            summaryInput.value = section.summary || '';
        if (defaultOpenInput)
            defaultOpenInput.checked = Boolean(section.defaultOpen);
        if (pointsInput)
            pointsInput.value = points.join('\n');
        // Populate questions
        renderSectionQuestions(questions);
        if (modal)
            modal.style.display = 'flex';
    }
    // Add new section
    function addSection() {
        currentSectionIndex = null;
        const modalTitle = getEl('section-modal-title');
        const idInput = getInput('section-id');
        const summaryInput = getInput('section-summary');
        const defaultOpenInput = getInput('section-defaultOpen');
        const pointsInput = getTextArea('section-points');
        const modal = getEl('section-modal');
        if (modalTitle)
            modalTitle.textContent = 'Add Section';
        if (idInput)
            idInput.value = '';
        if (summaryInput)
            summaryInput.value = '';
        if (defaultOpenInput)
            defaultOpenInput.checked = false;
        if (pointsInput)
            pointsInput.value = '';
        renderSectionQuestions([]);
        if (modal)
            modal.style.display = 'flex';
    }
    // Render questions in section modal
    function renderSectionQuestions(questions) {
        const container = getEl('section-questions-container');
        if (!container)
            return;
        container.innerHTML = '<label style="display: block; margin-bottom: 10px;">Questions</label>';
        const questionsDiv = document.createElement('div');
        questionsDiv.id = 'questions-list';
        container.appendChild(questionsDiv);
        questions.forEach((q, index) => {
            addQuestionField(q.key, q.prompt, q.answer, index);
        });
    }
    // Add/edit question field
    function addQuestionField(key = '', prompt = '', answer = '', index = -1) {
        const questionsList = getEl('questions-list');
        if (!questionsList)
            return;
        const field = document.createElement('div');
        field.className = 'question-field';
        field.innerHTML = `
    <div class="question-field-group">
      <input type="text" placeholder="Question key" class="question-key" />
      <input type="text" placeholder="Question prompt" class="question-prompt" style="flex: 2;" />
      <button class="btn-icon" onclick="this.parentElement.parentElement.remove()">Remove</button>
    </div>
    <div class="question-answer">
      <label style="display:block; font-size:12px; color: var(--muted); margin-bottom:4px;">Notes / Answer (optional)</label>
      <textarea class="question-answer-input" rows="3" placeholder="Your notes or suggested answer"></textarea>
    </div>
  `;
        const keyInput = field.querySelector('.question-key');
        const promptInput = field.querySelector('.question-prompt');
        const answerInput = field.querySelector('.question-answer-input');
        if (keyInput instanceof HTMLInputElement)
            keyInput.value = key || '';
        if (promptInput instanceof HTMLInputElement)
            promptInput.value = prompt || '';
        if (answerInput instanceof HTMLTextAreaElement)
            answerInput.value = answer || '';
        if (index >= 0) {
            const existing = document.querySelectorAll('.question-field')[index];
            if (existing) {
                existing.replaceWith(field);
            }
            else {
                questionsList.appendChild(field);
            }
        }
        else {
            questionsList.appendChild(field);
        }
    }
    // Save section
    function saveSection() {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        if (!cls)
            return;
        const id = getInput('section-id')?.value ?? '';
        const summary = getInput('section-summary')?.value ?? '';
        const defaultOpen = getInput('section-defaultOpen')?.checked ?? false;
        const pointsText = getTextArea('section-points')?.value ?? '';
        if (!id || !summary) {
            alert('Please fill in ID and Summary');
            return;
        }
        const points = pointsText
            .split('\n')
            .map((p) => p.trim())
            .filter((p) => p);
        // Gather questions
        const questions = [];
        document.querySelectorAll('.question-field').forEach((field) => {
            const keyEl = field.querySelector('.question-key');
            const promptEl = field.querySelector('.question-prompt');
            const answerEl = field.querySelector('.question-answer-input');
            const key = keyEl instanceof HTMLInputElement ? keyEl.value : '';
            const prompt = promptEl instanceof HTMLInputElement ? promptEl.value : '';
            const answer = answerEl instanceof HTMLTextAreaElement ? answerEl.value : '';
            if (key && prompt) {
                questions.push({ key, prompt, answer });
            }
        });
        const section = {
            id,
            summary,
            defaultOpen,
            points,
            questions,
        };
        if (!Array.isArray(cls.outline)) {
            cls.outline = [];
        }
        if (currentSectionIndex !== null) {
            // Update existing
            cls.outline[currentSectionIndex] = section;
        }
        else {
            // Add new
            cls.outline.push(section);
        }
        renderOutlineList(cls);
        closeModal('section-modal');
        // Auto-save after section changes
        void saveClassToFile();
    }
    // Delete section
    function deleteSection(index) {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        if (!cls || !Array.isArray(cls.outline))
            return;
        if (confirm('Delete this section?')) {
            cls.outline.splice(index, 1);
            renderOutlineList(cls);
            // Auto-save after deletion
            void saveClassToFile();
        }
    }
    // Save class
    function saveClass() {
        if (currentClass === null)
            return;
        const cls = allClasses[currentClass];
        if (!cls)
            return;
        const titleEl = getInput('classTitle');
        const subtitleEl = getInput('classSubtitle');
        const instructorEl = getInput('classInstructor');
        const channelEl = getInput('classChannel');
        if (titleEl)
            cls.title = titleEl.value;
        if (subtitleEl)
            cls.subtitle = subtitleEl.value;
        if (instructorEl)
            cls.instructor = instructorEl.value;
        if (channelEl)
            cls.channelName = channelEl.value;
        // Save classes automatically
        void saveClassToFile();
    }
    // Save classes to file
    async function saveClassToFile(_options = {}) {
        console.log('saveClassToFile called with', allClasses.length, 'classes');
        const jsonData = { classes: allClasses };
        try {
            if (!window.BSTApi) {
                throw new Error('BSTApi is not available');
            }
            console.log('Attempting API save to /api/save/classes...');
            const response = await window.BSTApi.fetch('/api/save/classes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonData),
            }, { requireAdmin: true });
            console.log('API response status:', response.status, response.statusText);
            if (response.ok) {
                const rawResult = await response.json().catch(() => ({}));
                const result = isRecord(rawResult) ? rawResult : {};
                console.log('[OK] Save successful:', result);
                showAdminSaveResult('Classes', result);
                return;
            }
            else {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }
        }
        catch (err) {
            console.error('Failed to save classes:', err);
            showAdminSaveStatus(`Classes save failed: ${getErrorMessage(err)}`, true, 'warning');
        }
    }
    // ===== UTILITY FUNCTIONS =====
    // ── Save status toast ────────────────────────────────────────────────────────
    function showAdminSaveStatus(msg, isError = false, iconName = '') {
        let toast = getEl('admin-save-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'admin-save-toast';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#fff',
                zIndex: '9999',
                opacity: '0',
                transition: 'opacity 0.3s ease',
                pointerEvents: 'none',
            });
            document.body.appendChild(toast);
        }
        if (iconName) {
            toast.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 6px;">${iconName}</span>${escapeHtml(String(msg || ''))}`;
        }
        else {
            toast.textContent = msg;
        }
        toast.style.background = isError ? '#c0392b' : '#27ae60';
        toast.style.opacity = '1';
        clearTimeout(_toastTimeout);
        _toastTimeout = setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
            }
        }, 2500);
    }
    // ── Debounced auto-save for class editor fields ───────────────────────────────
    function scheduleClassAutoSave() {
        clearTimeout(adminAutoSaveTimer);
        adminAutoSaveTimer = setTimeout(() => {
            if (currentClass === null)
                return;
            // Read the live form values into memory before saving
            const cls = allClasses[currentClass];
            if (!cls)
                return;
            const titleEl = getInput('classTitle');
            const subtitleEl = getInput('classSubtitle');
            const instructorEl = getInput('classInstructor');
            const channelEl = getInput('classChannel');
            if (titleEl)
                cls.title = titleEl.value;
            if (subtitleEl)
                cls.subtitle = subtitleEl.value;
            if (instructorEl)
                cls.instructor = instructorEl.value;
            if (channelEl)
                cls.channelName = channelEl.value;
            void saveClassToFile();
        }, ADMIN_AUTOSAVE_DELAY_MS);
    }
    // Modal helpers
    function closeModal(modalId) {
        const modal = getEl(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }
    // HTML escape
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
    }
    // Event listeners
    function setupEventListeners() {
        getEl('new-lessonplan-btn')?.addEventListener('click', createNewLessonPlan);
        getEl('back-btn')?.addEventListener('click', goBackToLessonPlans);
        getEl('new-class-btn')?.addEventListener('click', createNewClass);
        getEl('add-media-btn')?.addEventListener('click', addMedia);
        getEl('add-section-btn')?.addEventListener('click', addSection);
        getEl('save-class-btn')?.addEventListener('click', saveClass);
        getEl('save-class-btn-bottom')?.addEventListener('click', saveClass);
        getEl('edit-content-btn')?.addEventListener('click', openContentEditor);
        // Notes event listeners
        getEl('switch-to-notes-btn')?.addEventListener('click', switchToNotesView);
        getEl('switch-to-lessonplans-btn')?.addEventListener('click', switchToLessonPlansView);
        getEl('new-note-btn')?.addEventListener('click', createNewNote);
        // Auto-save class form fields after 3 s of inactivity
        ['classTitle', 'classSubtitle', 'classInstructor', 'classChannel'].forEach((id) => {
            getEl(id)?.addEventListener('input', scheduleClassAutoSave);
        });
        // Keep modals open while selecting/copying; require explicit close buttons to prevent accidental closes
    }
    // Toggle between link and upload modes for media inputs
    function toggleMediaInputMode(mediaType) {
        const checked = document.querySelector(`input[name="media-${mediaType}-mode"]:checked`);
        const mode = checked instanceof HTMLInputElement ? checked.value : undefined;
        const linkGroup = getEl(`media-${mediaType}-link-group`);
        const uploadGroup = getEl(`media-${mediaType}-upload-group`);
        if (mode === 'upload') {
            if (linkGroup)
                linkGroup.style.display = 'none';
            if (uploadGroup)
                uploadGroup.style.display = 'block';
        }
        else {
            if (linkGroup)
                linkGroup.style.display = 'block';
            if (uploadGroup)
                uploadGroup.style.display = 'none';
        }
    }
    function setLinkModeRadio(modeName) {
        const radio = document.querySelector(`input[name="${modeName}"][value="link"]`);
        if (radio instanceof HTMLInputElement) {
            radio.checked = true;
        }
    }
    // Handle file upload for media
    async function handleMediaUpload(mediaType, files) {
        if (!files || (files instanceof FileList && files.length === 0)) {
            return;
        }
        const uploadMedia = adminWindow.bst?.uploadMedia;
        if (!uploadMedia) {
            alert('File upload is only available in the desktop app. Please use the link option or run the desktop version.');
            return;
        }
        try {
            // Handle multiple files (for images)
            if (files instanceof FileList) {
                const urls = [];
                for (const file of files) {
                    const url = await uploadMedia(mediaType, file.name, await file.arrayBuffer());
                    urls.push(url);
                }
                if (mediaType === 'images') {
                    const imageUrlsEl = getTextArea('media-image-urls');
                    if (imageUrlsEl)
                        imageUrlsEl.value = urls.join('\n');
                    // Switch back to link mode to show the results
                    setLinkModeRadio('media-images-mode');
                    toggleMediaInputMode('images');
                }
            }
            else {
                // Single file
                const url = await uploadMedia(mediaType, files.name, await files.arrayBuffer());
                // Update the appropriate input field
                if (mediaType === 'video') {
                    const el = getInput('media-local-video');
                    if (el)
                        el.value = url;
                    setLinkModeRadio('media-video-mode');
                    toggleMediaInputMode('video');
                }
                else if (mediaType === 'pdf') {
                    const el = getInput('media-pdf-url');
                    if (el)
                        el.value = url;
                    setLinkModeRadio('media-pdf-mode');
                    toggleMediaInputMode('pdf');
                }
                else if (mediaType === 'audio') {
                    const el = getInput('media-audio-url');
                    if (el)
                        el.value = url;
                    setLinkModeRadio('media-audio-mode');
                    toggleMediaInputMode('audio');
                }
                else if (mediaType === 'document') {
                    const el = getInput('media-doc-url');
                    if (el)
                        el.value = url;
                    setLinkModeRadio('media-doc-mode');
                    toggleMediaInputMode('document');
                }
            }
            alert('File(s) uploaded successfully!');
        }
        catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed: ' + getErrorMessage(err));
        }
    }
    // Download linked media to local storage
    async function downloadMediaToLocal(mediaType) {
        const downloadMedia = adminWindow.bst?.downloadMedia;
        if (!downloadMedia) {
            alert('Download feature is only available in the desktop app.');
            return;
        }
        const evtTarget = window.event?.target;
        const button = evtTarget instanceof HTMLButtonElement ? evtTarget : null;
        const originalText = button?.textContent ?? '';
        try {
            let urls = [];
            if (mediaType === 'video') {
                const url = getInput('media-local-video')?.value.trim() ?? '';
                if (!url) {
                    alert('Please enter a video URL first');
                    return;
                }
                urls = [url];
            }
            else if (mediaType === 'pdf') {
                const url = getInput('media-pdf-url')?.value.trim() ?? '';
                if (!url) {
                    alert('Please enter a PDF URL first');
                    return;
                }
                urls = [url];
            }
            else if (mediaType === 'images') {
                const urlsText = getTextArea('media-image-urls')?.value.trim() ?? '';
                if (!urlsText) {
                    alert('Please enter image URLs first');
                    return;
                }
                urls = urlsText
                    .split('\n')
                    .map((u) => u.trim())
                    .filter((u) => u);
            }
            else if (mediaType === 'audio') {
                const url = getInput('media-audio-url')?.value.trim() ?? '';
                if (!url) {
                    alert('Please enter an audio URL first');
                    return;
                }
                urls = [url];
            }
            else if (mediaType === 'document') {
                const url = getInput('media-doc-url')?.value.trim() ?? '';
                if (!url) {
                    alert('Please enter a document URL first');
                    return;
                }
                urls = [url];
            }
            // Show progress
            if (button) {
                button.disabled = true;
                button.style.opacity = '0.7';
            }
            const totalFiles = urls.length;
            let downloaded = 0;
            const newUrls = [];
            for (const url of urls) {
                // Skip if already a local path
                if (url.startsWith('assets/')) {
                    newUrls.push(url);
                    continue;
                }
                downloaded++;
                if (button) {
                    button.textContent =
                        totalFiles > 1 ? `Downloading ${downloaded}/${totalFiles}...` : 'Downloading...';
                }
                const newUrl = await downloadMedia(mediaType, url);
                newUrls.push(newUrl);
            }
            // Update the input fields with local paths
            if (mediaType === 'video') {
                const el = getInput('media-local-video');
                if (el)
                    el.value = newUrls[0] ?? '';
            }
            else if (mediaType === 'pdf') {
                const el = getInput('media-pdf-url');
                if (el)
                    el.value = newUrls[0] ?? '';
            }
            else if (mediaType === 'images') {
                const el = getTextArea('media-image-urls');
                if (el)
                    el.value = newUrls.join('\n');
            }
            else if (mediaType === 'audio') {
                const el = getInput('media-audio-url');
                if (el)
                    el.value = newUrls[0] ?? '';
            }
            else if (mediaType === 'document') {
                const el = getInput('media-doc-url');
                if (el)
                    el.value = newUrls[0] ?? '';
            }
            if (button) {
                button.textContent = 'Download Complete!';
                button.style.opacity = '1';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 2000);
            }
        }
        catch (err) {
            console.error('Download failed:', err);
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
                button.style.opacity = '1';
            }
            alert('Download failed: ' + getErrorMessage(err));
        }
    }
    // Download YouTube video by ID
    async function downloadYouTubeVideo() {
        const youtubeId = getInput('media-youtube-id')?.value.trim() ?? '';
        if (!youtubeId) {
            alert('Please enter a YouTube Video ID first');
            return;
        }
        const evtTarget = window.event?.target;
        const button = evtTarget instanceof HTMLButtonElement ? evtTarget : null;
        const originalText = button?.textContent ?? '';
        try {
            if (button) {
                button.disabled = true;
                button.textContent = 'Attempting download...';
                button.style.opacity = '0.7';
            }
            const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
            // Try API download (may fail due to YouTube protection)
            try {
                if (!window.BSTApi) {
                    throw new Error('BSTApi is not available');
                }
                const response = await window.BSTApi.fetch('/api/download/youtube', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoUrl: youtubeUrl }),
                }, { requireAdmin: true });
                if (response.ok) {
                    const rawResult = await response.json();
                    const result = isRecord(rawResult) ? rawResult : {};
                    const localVideoEl = getInput('media-local-video');
                    if (localVideoEl)
                        localVideoEl.value = result.localPath ?? '';
                    if (button) {
                        button.textContent = 'Download Complete!';
                        button.style.opacity = '1';
                        setTimeout(() => {
                            button.textContent = originalText;
                            button.disabled = false;
                        }, 2000);
                    }
                    return;
                }
                else {
                    const rawError = await response.json();
                    const errorObj = isRecord(rawError) ? rawError : {};
                    throw new Error(errorObj.error || 'Download failed');
                }
            }
            catch (apiErr) {
                // API download failed - provide manual download instructions
                console.warn('API download failed:', getErrorMessage(apiErr));
                const manualDownloadUrl = youtubeUrl;
                const instructions = `
YouTube is blocking automated downloads.

You can download the video manually using:
1. Download from YouTube directly using a download service
2. Use a tool like yt-dlp or ffmpeg

Video URL: ${manualDownloadUrl}

For now, you can:
- Keep the YouTube link as the source
- Or manually download and place in: assets/video/${youtubeId}.mp4

Copy the URL and use an external downloader.
      `;
                alert(instructions);
                if (button) {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                }
            }
        }
        catch (err) {
            console.error('Download error:', err);
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
                button.style.opacity = '1';
            }
            alert('Download error: ' + getErrorMessage(err));
        }
    }
    // Expose functions called by inline HTML handlers
    adminWindow.editLessonPlan = editLessonPlan;
    adminWindow.deleteLessonPlan = deleteLessonPlan;
    adminWindow.openLessonPlan = openLessonPlan;
    adminWindow.editNoteMetadata = editNoteMetadata;
    adminWindow.deleteNote = deleteNote;
    adminWindow.openNoteEditor = openNoteEditor;
    adminWindow.removeClassFromLessonPlan = removeClassFromLessonPlan;
    adminWindow.addClassToLessonPlan = addClassToLessonPlan;
    adminWindow.editMedia = editMedia;
    adminWindow.deleteMedia = deleteMedia;
    adminWindow.editSection = editSection;
    adminWindow.deleteSection = deleteSection;
    adminWindow.closeModal = closeModal;
    adminWindow.updateMediaForm = updateMediaForm;
    adminWindow.saveMedia = saveMedia;
    adminWindow.addQuestionField = addQuestionField;
    adminWindow.saveSection = saveSection;
    adminWindow.saveLessonPlan = saveLessonPlan;
    adminWindow.saveNoteMetadata = saveNoteMetadata;
    adminWindow.downloadYouTubeVideo = downloadYouTubeVideo;
    adminWindow.toggleMediaInputMode = toggleMediaInputMode;
    adminWindow.downloadMediaToLocal = downloadMediaToLocal;
    adminWindow.handleMediaUpload = handleMediaUpload;
})();
