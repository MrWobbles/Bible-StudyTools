// Admin Interface for Lesson Plans and Class Management
let allLessonPlans = [];
let allClasses = [];
let currentLessonPlan = null;
let currentClass = null;
let currentMediaIndex = null;
let currentSectionIndex = null;

// Auto-save state
let adminAutoSaveTimer = null;
const ADMIN_AUTOSAVE_DELAY_MS = 3000; // debounce: save 3 s after last keystroke

// Generate GUID for class IDs
function generateGUID() {
  return 'class-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}
function getCloudSyncWarning(result) {
  if (!result || typeof result !== 'object') {
    return '';
  }

  if (result.partialSuccess || result?.cloudSync?.ok === false || result.mongoSync === false) {
    return result.warning || result?.cloudSync?.message || 'Cloud sync failed.';
  }

  return '';
}

function combineWarnings(...warnings) {
  return warnings
    .map((warning) => String(warning || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function shouldIgnorePartialSyncFailure(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('cannot put')
    || text.includes('cannot delete')
    || text.includes('404')
    || text.includes('failed to fetch')
    || text.includes('networkerror')
    || text.includes('err_connection_refused');
}

function getClassIdentifier(cls) {
  if (!cls || typeof cls !== 'object') {
    return '';
  }

  return String(cls.id || cls.classNumber || '').trim();
}

function getLessonPlanIdentifier(plan) {
  if (!plan || typeof plan !== 'object') {
    return '';
  }

  return String(plan.id || plan.planId || '').trim();
}

async function syncClassDeltaToMongo(options = {}) {
  const { changedClassId = null, deletedClassId = null } = options;

  if (!window.BSTApi) {
    return '';
  }

  try {
    if (deletedClassId) {
      await window.BSTApi.deleteMongoClass(String(deletedClassId));
      return '';
    }

    const normalizedClassId = String(changedClassId || '').trim();
    if (!normalizedClassId) {
      return '';
    }

    const cls = allClasses.find((item) => getClassIdentifier(item) === normalizedClassId);
    if (!cls) {
      return '';
    }

    await window.BSTApi.upsertMongoClass(normalizedClassId, { class: cls });
    return '';
  } catch (err) {
    const message = err?.message || 'Cloud sync failed for class record.';
    return shouldIgnorePartialSyncFailure(message) ? '' : message;
  }
}

async function syncLessonPlanDeltaToMongo(options = {}) {
  const { changedPlanId = null, deletedPlanId = null } = options;

  if (!window.BSTApi) {
    return '';
  }

  try {
    if (deletedPlanId) {
      await window.BSTApi.deleteMongoLessonPlan(String(deletedPlanId));
      return '';
    }

    const normalizedPlanId = String(changedPlanId || '').trim();
    if (!normalizedPlanId) {
      return '';
    }

    const plan = allLessonPlans.find((item) => getLessonPlanIdentifier(item) === normalizedPlanId);
    if (!plan) {
      return '';
    }

    await window.BSTApi.upsertMongoLessonPlan(normalizedPlanId, { lessonPlan: plan });
    return '';
  } catch (err) {
    const message = err?.message || 'Cloud sync failed for lesson plan record.';
    return shouldIgnorePartialSyncFailure(message) ? '' : message;
  }
}

function showAdminSaveResult(itemLabel, result) {
  const warning = getCloudSyncWarning(result);
  if (warning) {
    showAdminSaveStatus(`${itemLabel} saved locally only. ${warning}`, true, 'warning');
    return;
  }

  const syncedToCloud = result?.cloudSync?.ok === true || result?.mongoSync === true;
  showAdminSaveStatus(`${itemLabel} saved${syncedToCloud ? ' + Atlas' : ''}`, false, 'check_circle');
}

// Load data on page load
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Page loading...');
  await loadLessonPlans();
  console.log('Lesson plans loaded:', allLessonPlans);
  await loadClasses();
  console.log('Classes loaded:', allClasses);
  setupEventListeners();
  console.log('Event listeners set up');
  renderLessonPlansList();
  console.log('Rendered lesson plans list');
});

// ===== LESSON PLAN MANAGEMENT =====

// Load lesson plans from JSON
async function loadLessonPlans() {
  try {
    console.log('Fetching lesson plans from API');
    const data = await window.BSTApi.getLessonPlans();
    console.log('Parsed JSON data:', data);
    allLessonPlans = data.lessonPlans || [];
    console.log('Set allLessonPlans to:', allLessonPlans);
  } catch (error) {
    console.error('Failed to load lesson plans:', error);
    allLessonPlans = [];
  }
}

// Load classes from JSON
async function loadClasses() {
  try {
    const data = await window.BSTApi.getClasses();
    allClasses = data.classes || [];
  } catch (error) {
    console.error('Failed to load classes:', error);
    allClasses = [];
  }
}

// Render lesson plans list
function renderLessonPlansList() {
  const list = document.getElementById('lessonplans-list');
  console.log('Rendering lesson plans, count:', allLessonPlans.length);
  list.innerHTML = '';

  if (allLessonPlans.length === 0) {
    list.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No lesson plans yet. Create one to get started!</p>';
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
  document.getElementById('lessonplan-modal-title').textContent = 'New Lesson Plan';
  document.getElementById('lessonplan-title').value = '';
  document.getElementById('lessonplan-description').value = '';
  currentLessonPlan = null;
  document.getElementById('lessonplan-modal').style.display = 'flex';
}

// Edit lesson plan
function editLessonPlan(index) {
  currentLessonPlan = index;
  const plan = allLessonPlans[index];

  document.getElementById('lessonplan-modal-title').textContent = 'Edit Lesson Plan';
  document.getElementById('lessonplan-title').value = plan.title;
  document.getElementById('lessonplan-description').value = plan.description || '';

  document.getElementById('lessonplan-modal').style.display = 'flex';
}

// Save lesson plan
function saveLessonPlan() {
  const title = document.getElementById('lessonplan-title').value;
  const description = document.getElementById('lessonplan-description').value;
  let changedPlanId = '';

  if (!title.trim()) {
    alert('Please enter a lesson plan title');
    return;
  }

  if (currentLessonPlan !== null) {
    // Update existing - only change title and description
    allLessonPlans[currentLessonPlan].title = title.trim();
    allLessonPlans[currentLessonPlan].description = description.trim();
    changedPlanId = getLessonPlanIdentifier(allLessonPlans[currentLessonPlan]);
  } else {
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

  saveLessonPlansToFile({ changedPlanId });
  closeModal('lessonplan-modal');
  renderLessonPlansList();
}

// Delete lesson plan
function deleteLessonPlan(index) {
  if (confirm('Delete this lesson plan and all its classes?')) {
    const deletedPlanId = getLessonPlanIdentifier(allLessonPlans[index]);
    allLessonPlans.splice(index, 1);
    saveLessonPlansToFile({ deletedPlanId });
    renderLessonPlansList();
  }
}

// Open lesson plan for editing classes
function openLessonPlan(index) {
  currentLessonPlan = index;
  const plan = allLessonPlans[index];

  // Update header
  document.getElementById('header-title').textContent = plan.title;
  document.getElementById('header-subtitle').textContent = 'Edit classes in this lesson plan';
  document.getElementById('back-btn').style.display = 'block';

  // Show View Student/Teacher links when in a lesson plan
  const studentLink = document.getElementById('view-student-link');
  const teacherLink = document.getElementById('view-teacher-link');
  if (studentLink) studentLink.style.display = 'inline-flex';
  if (teacherLink) teacherLink.style.display = 'inline-flex';

  // Show class editor, hide lesson plan list
  document.getElementById('lessonplan-view').style.display = 'none';
  document.getElementById('class-editor-view').style.display = 'grid';
  document.getElementById('class-list-title').textContent = `Classes in "${plan.title}"`;

  // Reset class selection
  currentClass = null;
  // Reset header links to base pages until a class is selected
  if (studentLink) studentLink.href = 'student.html';
  if (teacherLink) teacherLink.href = 'teacher.html';
  renderClassListForLessonPlan();
}

// Go back to lesson plans view
function goBackToLessonPlans() {
  currentLessonPlan = null;
  currentClass = null;

  document.getElementById('header-title').textContent = 'Lesson Plans';
  document.getElementById('header-subtitle').textContent = 'Create and manage Bible study lesson plans';
  document.getElementById('back-btn').style.display = 'none';

  // Hide View Student/Teacher links when leaving lesson plan view
  const studentLink = document.getElementById('view-student-link');
  const teacherLink = document.getElementById('view-teacher-link');
  if (studentLink) studentLink.style.display = 'none';
  if (teacherLink) teacherLink.style.display = 'none';

  document.getElementById('lessonplan-view').style.display = 'grid';
  document.getElementById('class-editor-view').style.display = 'none';

  document.getElementById('editor').style.display = 'none';
  document.getElementById('no-selection').style.display = 'block';

  // Reset header links
  if (studentLink) studentLink.href = 'student.html';
  if (teacherLink) teacherLink.href = 'teacher.html';

  renderLessonPlansList();
}

// Save lesson plans to file
async function saveLessonPlansToFile(options = {}) {
  console.log('saveLessonPlansToFile called with', allLessonPlans.length, 'lesson plans');
  const jsonData = { lessonPlans: allLessonPlans };
  const { changedPlanId = null, deletedPlanId = null } = options;

  // If running in Electron, save directly to file system
  if (window.bst && window.bst.saveFile) {
    try {
      await window.bst.saveFile('lessonPlans.json', JSON.stringify(jsonData, null, 2));
      console.log('[OK] Lesson plans saved via Electron');
      return;
    } catch (err) {
      console.error('Failed to save lesson plans via Electron:', err);
      alert('Failed to save lesson plans: ' + err.message);
      return;
    }
  }

  // Try API endpoint (web server mode)
  try {
    const partialSyncWarning = await syncLessonPlanDeltaToMongo({ changedPlanId, deletedPlanId });

    console.log('Attempting API save to /api/save/lessonPlans...');
    const response = await window.BSTApi.fetch('/api/save/lessonPlans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bst-skip-cloud-sync': '1'
      },
      body: JSON.stringify(jsonData),
    }, { requireAdmin: true });

    console.log('API response status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      const saveWarning = getCloudSyncWarning(result);
      const combinedWarning = combineWarnings(partialSyncWarning, saveWarning);

      if (combinedWarning) {
        result.partialSuccess = true;
        result.warning = combinedWarning;
      }

      console.log('[OK] Lesson plans saved successfully:', result);
      showAdminSaveResult('Lesson plans', result);
      return;
    } else {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.warn('API save failed, falling back to download:', err);
    // Fallback: download file
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lessonPlans.json';
    link.click();
    URL.revokeObjectURL(url);
    console.log('Lesson plans downloaded - please replace assets/data/lessonPlans.json with the downloaded file.');
  }
}

// ===== CLASS MANAGEMENT (within a lesson plan) =====

// Render classes for current lesson plan
function renderClassListForLessonPlan() {
  const classList = document.getElementById('classes-list');
  classList.innerHTML = '';

  const plan = allLessonPlans[currentLessonPlan];
  const planClassIds = plan.classes || [];

  // Show classes that are in this lesson plan
  let displayNumber = 1;
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
        if (!e.target.closest('button')) {
          selectClass(index);
        }
      });
      classList.appendChild(item);
      displayNumber++;
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
  const plan = allLessonPlans[currentLessonPlan];
  const planClassIds = plan.classes || [];

  // Find classes not yet in this plan
  const availableClasses = allClasses.filter((cls) => {
    const classId = cls.id || cls.classNumber;
    return !planClassIds.includes(classId);
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

  document.getElementById('class-add-modal-content').innerHTML = html;
  document.getElementById('class-add-modal').style.display = 'flex';
}

// Add class to lesson plan
function addClassToLessonPlan(classIndex) {
  const cls = allClasses[classIndex];
  const plan = allLessonPlans[currentLessonPlan];
  const classId = cls.id || cls.classNumber; // Support both old and new format

  if (!plan.classes.includes(classId)) {
    plan.classes.push(classId);
    renderClassListForLessonPlan();
    saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
  }
}

// Remove class from lesson plan
function removeClassFromLessonPlan(classIndex) {
  const cls = allClasses[classIndex];
  const plan = allLessonPlans[currentLessonPlan];
  const classId = cls.id || cls.classNumber; // Support both old and new format

  plan.classes = plan.classes.filter((id) => id !== classId);
  renderClassListForLessonPlan();
  saveLessonPlansToFile({ changedPlanId: getLessonPlanIdentifier(plan) });
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
      json: { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Start writing your class content here..." }] }] },
      text: 'Start writing your class content here...'
    }
  };

  allClasses.push(newClass);
  console.log('Created new class:', newClass);

  // Add to current lesson plan if one is open
  if (currentLessonPlan !== null) {
    const plan = allLessonPlans[currentLessonPlan];
    if (!plan.classes.includes(newClassId)) {
      plan.classes.push(newClassId);
    }
    renderClassListForLessonPlan();
  }

  // Select the new class for editing
  selectClass(allClasses.length - 1);

  // Auto-save the new class AND the lesson plan
  console.log('Auto-saving new class...');
  saveClassToFile({ changedClassId: newClassId });

  if (currentLessonPlan !== null) {
    console.log('Auto-saving lesson plan...');
    saveLessonPlansToFile();
  }
}

// Open content editor for current class
function openContentEditor() {
  if (currentClass === null) {
    alert('Please select a class first');
    return;
  }

  const cls = allClasses[currentClass];
  const classId = cls.id || cls.classNumber; // Support both old and new format
  window.open(`editor.html?class=${classId}`, '_blank');
}

// ===== CLASS EDITING =====

// Select and load a class for editing
function selectClass(index) {
  currentClass = index;
  const cls = allClasses[index];

  // Ensure outline/media arrays exist to avoid runtime errors when editing
  if (!Array.isArray(cls.media)) cls.media = [];
  if (!Array.isArray(cls.outline)) cls.outline = [];

  // Update UI
  document.getElementById('editor').style.display = 'block';
  document.getElementById('no-selection').style.display = 'none';
  document.getElementById('edit-title').textContent = `Editing: ${cls.title}`;
  document.getElementById('save-class-btn').style.display = 'block';
  document.getElementById('edit-content-btn').style.display = 'block';

  // Populate form
  document.getElementById('classTitle').value = cls.title;
  document.getElementById('classSubtitle').value = cls.subtitle;
  document.getElementById('classInstructor').value = cls.instructor;
  document.getElementById('classChannel').value = cls.channelName;

  // Render media list
  renderMediaList(cls);

  // Render outline list
  renderOutlineList(cls);

  // Update header links to include the selected class ID
  const classId = cls.id || cls.classNumber; // Support both old and new format
  const studentLink = document.getElementById('view-student-link');
  const teacherLink = document.getElementById('view-teacher-link');
  if (studentLink) studentLink.href = `student.html?class=${classId}`;
  if (teacherLink) teacherLink.href = `teacher.html?class=${classId}`;

  renderClassListForLessonPlan();
}

// Render media list
function renderMediaList(cls) {
  const mediaList = document.getElementById('media-list');
  mediaList.innerHTML = '';

  cls.media.forEach((media, index) => {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.innerHTML = `
      <div class="media-item-info">
        <div class="media-item-title">
          ${media.title}
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
  const outlineList = document.getElementById('outline-list');
  outlineList.innerHTML = '';

  // Guard against missing outline array
  const outline = Array.isArray(cls.outline) ? cls.outline : [];
  outline.forEach((section, index) => {
    const safeSection = section || {};
    const questions = Array.isArray(safeSection.questions) ? safeSection.questions : [];
    const summary = safeSection.summary || '(No summary)';
    const id = safeSection.id || '';

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
  currentMediaIndex = index;
  const media = allClasses[currentClass].media[index];

  document.getElementById('media-modal-title').textContent = 'Edit Media';
  document.getElementById('media-id').value = media.id;
  document.getElementById('media-type').value = media.type;
  document.getElementById('media-title').value = media.title;
  document.getElementById('media-primary').checked = media.primary;

  updateMediaForm();
  populateMediaForm(media);

  document.getElementById('media-modal').style.display = 'flex';
}

// Add new media item
function addMedia() {
  currentMediaIndex = null;

  document.getElementById('media-modal-title').textContent = 'Add Media';
  document.getElementById('media-id').value = '';
  document.getElementById('media-type').value = 'video';
  document.getElementById('media-title').value = '';
  document.getElementById('media-primary').checked = false;

  updateMediaForm();

  document.getElementById('media-modal').style.display = 'flex';
}

// Update media form fields based on type
function updateMediaForm() {
  const type = document.getElementById('media-type').value;
  const fieldsContainer = document.getElementById('media-fields');
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
  } else if (type === 'pdf') {
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
  } else if (type === 'images') {
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
  } else if (type === 'audio') {
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
  } else if (type === 'document') {
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
  } else if (type === 'link') {
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
  const type = document.getElementById('media-type').value;

  if (type === 'video' && media.sources) {
    const youtubeSource = media.sources.find((s) => s.type === 'youtube' || s.format === 'youtube');
    const localSource = media.sources.find((s) => s.type === 'local');

    if (youtubeSource) {
      document.getElementById('media-youtube-id').value = youtubeSource.url || youtubeSource.videoId || '';
    }
    if (localSource) {
      document.getElementById('media-local-video').value = localSource.url;
    }

    if (media.duration) {
      document.getElementById('media-duration').value = media.duration;
    }

    if (media.pausePoints && media.pausePoints.length > 0) {
      const points = media.pausePoints.map((p) => (typeof p === 'object' ? p.time : p)).join(', ');
      document.getElementById('media-pause-points').value = points;
    }
  } else if (type === 'pdf' && media.sources) {
    const source = media.sources[0];
    if (source) {
      document.getElementById('media-pdf-url').value = source.url;
    }
  } else if (type === 'images' && media.sources) {
    const urls = media.sources.map((s) => s.url).join('\n');
    document.getElementById('media-image-urls').value = urls;
  } else if (type === 'audio' && media.sources) {
    const source = media.sources[0];
    if (source) {
      document.getElementById('media-audio-url').value = source.url;
    }
  } else if (type === 'document' && media.sources) {
    const source = media.sources[0];
    if (source) {
      document.getElementById('media-doc-url').value = source.url;
    }
  } else if (type === 'link' && media.sources) {
    const source = media.sources[0];
    if (source) {
      document.getElementById('media-link-url').value = source.url;
    }
  }
}

// Save media item
function saveMedia() {
  const type = document.getElementById('media-type').value;
  const id = document.getElementById('media-id').value;
  const title = document.getElementById('media-title').value;
  const primary = document.getElementById('media-primary').checked;

  if (!id || !title) {
    alert('Please fill in ID and Title');
    return;
  }

  let media = {
    id,
    type,
    title,
    primary,
    sources: [],
  };

  // Build sources based on type
  if (type === 'video') {
    const youtubeId = document.getElementById('media-youtube-id').value;
    const localVideo = document.getElementById('media-local-video').value;

    if (youtubeId) {
      media.sources.push({ type: 'youtube', url: youtubeId });
    }
    if (localVideo) {
      media.sources.push({ type: 'local', url: localVideo });
    }

    const duration = document.getElementById('media-duration').value;
    if (duration) {
      media.duration = parseInt(duration);
    }

    const pausePoints = document.getElementById('media-pause-points').value;
    if (pausePoints) {
      media.pausePoints = pausePoints.split(',').map((p) => parseInt(p.trim())).filter((p) => !isNaN(p));
    } else {
      media.pausePoints = [];
    }
  } else if (type === 'pdf') {
    const url = document.getElementById('media-pdf-url').value;
    if (url) {
      media.sources.push({ type: 'pdf', url });
    }
  } else if (type === 'images') {
    const urls = document.getElementById('media-image-urls').value.split('\n').filter((u) => u.trim());
    urls.forEach((url) => {
      media.sources.push({ type: 'image', url: url.trim() });
    }, { requireAdmin: true });
  } else if (type === 'audio') {
    const url = document.getElementById('media-audio-url').value;
    if (url) {
      media.sources.push({ type: 'audio', url });
    }
  } else if (type === 'document') {
    const url = document.getElementById('media-doc-url').value;
    if (url) {
      media.sources.push({ type: 'document', url });
    }
  } else if (type === 'link') {
    const url = document.getElementById('media-link-url').value;
    if (url) {
      media.sources.push({ type: 'link', url });
    }
  }

  // If this is primary, set others to non-primary
  if (primary) {
    allClasses[currentClass].media.forEach((m) => {
      m.primary = false;
    });
  }

  if (currentMediaIndex !== null) {
    // Update existing
    allClasses[currentClass].media[currentMediaIndex] = media;
  } else {
    // Add new
    allClasses[currentClass].media.push(media);
  }

  renderMediaList(allClasses[currentClass]);
  closeModal('media-modal');

  // Auto-save after media changes
  saveClassToFile();
}

// Delete media item
function deleteMedia(index) {
  if (confirm('Delete this media item?')) {
    allClasses[currentClass].media.splice(index, 1);
    renderMediaList(allClasses[currentClass]);

    // Auto-save after deletion
    saveClassToFile();
  }
}

// Edit section
function editSection(index) {
  currentSectionIndex = index;
  const section = allClasses[currentClass].outline[index] || {};

  // Normalize arrays to avoid runtime errors when fields are missing
  const points = Array.isArray(section.points) ? section.points : [];
  const questions = Array.isArray(section.questions) ? section.questions : [];

  document.getElementById('section-modal-title').textContent = 'Edit Section';
  document.getElementById('section-id').value = section.id || '';
  document.getElementById('section-summary').value = section.summary || '';
  document.getElementById('section-defaultOpen').checked = !!section.defaultOpen;
  document.getElementById('section-points').value = points.join('\n');

  // Populate questions
  renderSectionQuestions(questions);

  document.getElementById('section-modal').style.display = 'flex';
}

// Add new section
function addSection() {
  currentSectionIndex = null;

  document.getElementById('section-modal-title').textContent = 'Add Section';
  document.getElementById('section-id').value = '';
  document.getElementById('section-summary').value = '';
  document.getElementById('section-defaultOpen').checked = false;
  document.getElementById('section-points').value = '';

  renderSectionQuestions([]);

  document.getElementById('section-modal').style.display = 'flex';
}

// Render questions in section modal
function renderSectionQuestions(questions) {
  const container = document.getElementById('section-questions-container');
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
  const questionsList = document.getElementById('questions-list');

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

  field.querySelector('.question-key').value = key || '';
  field.querySelector('.question-prompt').value = prompt || '';
  field.querySelector('.question-answer-input').value = answer || '';

  if (index >= 0) {
    const existing = document.querySelectorAll('.question-field')[index];
    if (existing) {
      existing.replaceWith(field);
    } else {
      questionsList.appendChild(field);
    }
  } else {
    questionsList.appendChild(field);
  }
}

// Save section
function saveSection() {
  const id = document.getElementById('section-id').value;
  const summary = document.getElementById('section-summary').value;
  const defaultOpen = document.getElementById('section-defaultOpen').checked;
  const pointsText = document.getElementById('section-points').value;

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
    const key = field.querySelector('.question-key').value;
    const prompt = field.querySelector('.question-prompt').value;
    const answer = field.querySelector('.question-answer-input')?.value || '';
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

  if (currentSectionIndex !== null) {
    // Update existing
    allClasses[currentClass].outline[currentSectionIndex] = section;
  } else {
    // Add new
    allClasses[currentClass].outline.push(section);
  }

  renderOutlineList(allClasses[currentClass]);
  closeModal('section-modal');

  // Auto-save after section changes
  saveClassToFile();
}

// Delete section
function deleteSection(index) {
  if (confirm('Delete this section?')) {
    allClasses[currentClass].outline.splice(index, 1);
    renderOutlineList(allClasses[currentClass]);

    // Auto-save after deletion
    saveClassToFile();
  }
}

// Save class
function saveClass() {
  const cls = allClasses[currentClass];

  cls.title = document.getElementById('classTitle').value;
  cls.subtitle = document.getElementById('classSubtitle').value;
  cls.instructor = document.getElementById('classInstructor').value;
  cls.channelName = document.getElementById('classChannel').value;

  // Ensure all unsaved changes in sections are included
  // (saveSection updates allClasses in memory, so this final save captures all changes)

  // Save classes automatically
  saveClassToFile();
}

// Save classes to file
async function saveClassToFile(options = {}) {
  console.log('saveClassToFile called with', allClasses.length, 'classes');
  const jsonData = { classes: allClasses };
  const activeClassId = currentClass !== null ? getClassIdentifier(allClasses[currentClass]) : '';
  const changedClassId = String(options?.changedClassId || activeClassId || '').trim();
  const deletedClassId = String(options?.deletedClassId || '').trim();

  // If running in Electron, save directly to file system
  if (window.bst && window.bst.saveFile) {
    try {
      await window.bst.saveFile('classes.json', JSON.stringify(jsonData, null, 2));
      console.log('[OK] Saved via Electron');
      showAdminSaveStatus('Classes saved', false, 'check_circle');
      return;
    } catch (err) {
      console.error('Failed to save class via Electron:', err);
      showAdminSaveStatus('Save failed: ' + err.message, true, 'error');
      return;
    }
  }

  // Try API endpoint (web server mode)
  try {
    const partialSyncWarning = await syncClassDeltaToMongo({ changedClassId, deletedClassId });

    console.log('Attempting API save to /api/save/classes...');
    const response = await window.BSTApi.fetch('/api/save/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bst-skip-cloud-sync': '1'
      },
      body: JSON.stringify(jsonData),
    }, { requireAdmin: true });

    console.log('API response status:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      const saveWarning = getCloudSyncWarning(result);
      const combinedWarning = combineWarnings(partialSyncWarning, saveWarning);

      if (combinedWarning) {
        result.partialSuccess = true;
        result.warning = combinedWarning;
      }

      console.log('[OK] Save successful:', result);
      showAdminSaveResult('Classes', result);
      return;
    } else {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.warn('API save failed, falling back to download:', err);
    // Fallback: download file
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'classes.json';
    link.click();
    URL.revokeObjectURL(url);
    alert('Class saved! Please replace assets/data/classes.json with the downloaded file.');
  }
}

// ===== UTILITY FUNCTIONS =====

// ── Save status toast ────────────────────────────────────────────────────────

let _toastTimeout = null;

function showAdminSaveStatus(msg, isError = false, iconName = '') {
  let toast = document.getElementById('admin-save-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-save-toast';
    Object.assign(toast.style, {
      position:      'fixed',
      bottom:        '24px',
      right:         '24px',
      padding:       '10px 18px',
      borderRadius:  '6px',
      fontSize:      '13px',
      fontWeight:    '600',
      color:         '#fff',
      zIndex:        '9999',
      opacity:       '0',
      transition:    'opacity 0.3s ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(toast);
  }

  if (iconName) {
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 6px;">${iconName}</span>${escapeHtml(String(msg || ''))}`;
  } else {
    toast.textContent = msg;
  }
  toast.style.background = isError ? '#c0392b' : '#27ae60';
  toast.style.opacity = '1';

  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ── Debounced auto-save for class editor fields ───────────────────────────────

function scheduleClassAutoSave() {
  clearTimeout(adminAutoSaveTimer);
  adminAutoSaveTimer = setTimeout(() => {
    // Read the live form values into memory before saving
    const cls = allClasses[currentClass];
    if (!cls) return;
    const titleEl      = document.getElementById('classTitle');
    const subtitleEl   = document.getElementById('classSubtitle');
    const instructorEl = document.getElementById('classInstructor');
    const channelEl    = document.getElementById('classChannel');
    if (titleEl)      cls.title       = titleEl.value;
    if (subtitleEl)   cls.subtitle    = subtitleEl.value;
    if (instructorEl) cls.instructor  = instructorEl.value;
    if (channelEl)    cls.channelName = channelEl.value;
    saveClassToFile();
  }, ADMIN_AUTOSAVE_DELAY_MS);
}

// Modal helpers
function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
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
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Event listeners
function setupEventListeners() {
  document.getElementById('new-lessonplan-btn').addEventListener('click', createNewLessonPlan);
  document.getElementById('back-btn').addEventListener('click', goBackToLessonPlans);
  document.getElementById('new-class-btn').addEventListener('click', createNewClass);
  document.getElementById('add-media-btn').addEventListener('click', addMedia);
  document.getElementById('add-section-btn').addEventListener('click', addSection);
  document.getElementById('save-class-btn').addEventListener('click', saveClass);
  document.getElementById('save-class-btn-bottom')?.addEventListener('click', saveClass);
  document.getElementById('edit-content-btn')?.addEventListener('click', openContentEditor);

  // Auto-save class form fields after 3 s of inactivity
  ['classTitle', 'classSubtitle', 'classInstructor', 'classChannel'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', scheduleClassAutoSave);
  });

  // Keep modals open while selecting/copying; require explicit close buttons to prevent accidental closes
}

// Toggle between link and upload modes for media inputs
function toggleMediaInputMode(mediaType) {
  const mode = document.querySelector(`input[name="media-${mediaType}-mode"]:checked`)?.value;
  const linkGroup = document.getElementById(`media-${mediaType}-link-group`);
  const uploadGroup = document.getElementById(`media-${mediaType}-upload-group`);

  if (mode === 'upload') {
    if (linkGroup) linkGroup.style.display = 'none';
    if (uploadGroup) uploadGroup.style.display = 'block';
  } else {
    if (linkGroup) linkGroup.style.display = 'block';
    if (uploadGroup) uploadGroup.style.display = 'none';
  }
}

// Handle file upload for media
async function handleMediaUpload(mediaType, files) {
  if (!files || (files instanceof FileList && files.length === 0)) {
    return;
  }

  if (!window.bst || !window.bst.uploadMedia) {
    alert('File upload is only available in the desktop app. Please use the link option or run the desktop version.');
    return;
  }

  try {
    // Handle multiple files (for images)
    if (files instanceof FileList) {
      const urls = [];
      for (let file of files) {
        const url = await window.bst.uploadMedia(mediaType, file.name, await file.arrayBuffer());
        urls.push(url);
      }

      if (mediaType === 'images') {
        document.getElementById('media-image-urls').value = urls.join('\\n');
        // Switch back to link mode to show the results
        document.querySelector('input[name="media-images-mode"][value="link"]').checked = true;
        toggleMediaInputMode('images');
      }
    } else {
      // Single file
      const url = await window.bst.uploadMedia(mediaType, files.name, await files.arrayBuffer());

      // Update the appropriate input field
      if (mediaType === 'video') {
        document.getElementById('media-local-video').value = url;
        document.querySelector('input[name="media-video-mode"][value="link"]').checked = true;
        toggleMediaInputMode('video');
      } else if (mediaType === 'pdf') {
        document.getElementById('media-pdf-url').value = url;
        document.querySelector('input[name="media-pdf-mode"][value="link"]').checked = true;
        toggleMediaInputMode('pdf');
      } else if (mediaType === 'audio') {
        document.getElementById('media-audio-url').value = url;
        document.querySelector('input[name="media-audio-mode"][value="link"]').checked = true;
        toggleMediaInputMode('audio');
      } else if (mediaType === 'document') {
        document.getElementById('media-doc-url').value = url;
        document.querySelector('input[name="media-doc-mode"][value="link"]').checked = true;
        toggleMediaInputMode('document');
      }
    }

    alert('File(s) uploaded successfully!');
  } catch (err) {
    console.error('Upload failed:', err);
    alert('Upload failed: ' + err.message);
  }
}

// Download linked media to local storage
async function downloadMediaToLocal(mediaType) {
  if (!window.bst || !window.bst.downloadMedia) {
    alert('Download feature is only available in the desktop app.');
    return;
  }

  const button = event.target;
  const originalText = button.textContent;

  try {
    let urls = [];

    if (mediaType === 'video') {
      const url = document.getElementById('media-local-video').value.trim();
      if (!url) {
        alert('Please enter a video URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'pdf') {
      const url = document.getElementById('media-pdf-url').value.trim();
      if (!url) {
        alert('Please enter a PDF URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'images') {
      const urlsText = document.getElementById('media-image-urls').value.trim();
      if (!urlsText) {
        alert('Please enter image URLs first');
        return;
      }
      urls = urlsText.split('\\n').map(u => u.trim()).filter(u => u);
    } else if (mediaType === 'audio') {
      const url = document.getElementById('media-audio-url').value.trim();
      if (!url) {
        alert('Please enter an audio URL first');
        return;
      }
      urls = [url];
    } else if (mediaType === 'document') {
      const url = document.getElementById('media-doc-url').value.trim();
      if (!url) {
        alert('Please enter a document URL first');
        return;
      }
      urls = [url];
    }

    // Show progress
    button.disabled = true;
    button.style.opacity = '0.7';
    const totalFiles = urls.length;
    let downloaded = 0;

    const newUrls = [];
    for (let url of urls) {
      // Skip if already a local path
      if (url.startsWith('assets/')) {
        newUrls.push(url);
        continue;
      }

      downloaded++;
      button.textContent = totalFiles > 1
        ? `Downloading ${downloaded}/${totalFiles}...`
        : 'Downloading...';

      const newUrl = await window.bst.downloadMedia(mediaType, url);
      newUrls.push(newUrl);
    }

    // Update the input fields with local paths
    if (mediaType === 'video') {
      document.getElementById('media-local-video').value = newUrls[0];
    } else if (mediaType === 'pdf') {
      document.getElementById('media-pdf-url').value = newUrls[0];
    } else if (mediaType === 'images') {
      document.getElementById('media-image-urls').value = newUrls.join('\\n');
    } else if (mediaType === 'audio') {
      document.getElementById('media-audio-url').value = newUrls[0];
    } else if (mediaType === 'document') {
      document.getElementById('media-doc-url').value = newUrls[0];
    }

    button.textContent = 'Download Complete!';
    button.style.opacity = '1';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Download failed:', err);
    button.textContent = originalText;
    button.disabled = false;
    button.style.opacity = '1';
    alert('Download failed: ' + err.message);
  }
}

// Download YouTube video by ID
async function downloadYouTubeVideo() {
  const youtubeId = document.getElementById('media-youtube-id')?.value.trim();

  if (!youtubeId) {
    alert('Please enter a YouTube Video ID first');
    return;
  }

  const button = event.target;
  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = 'Attempting download...';
    button.style.opacity = '0.7';

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

    // Try API download (may fail due to YouTube protection)
    try {
      const response = await window.BSTApi.fetch('/api/download/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: youtubeUrl }),
      }, { requireAdmin: true });

      if (response.ok) {
        const result = await response.json();
        document.getElementById('media-local-video').value = result.localPath;
        button.textContent = 'Download Complete!';
        button.style.opacity = '1';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
        return;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }
    } catch (apiErr) {
      // API download failed - provide manual download instructions
      console.warn('API download failed:', apiErr.message);

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
      button.textContent = originalText;
      button.disabled = false;
      button.style.opacity = '1';
    }
  } catch (err) {
    console.error('Download error:', err);
    button.textContent = originalText;
    button.disabled = false;
    button.style.opacity = '1';
    alert('Download error: ' + err.message);
  }
}

// ===== BACKUP MANAGEMENT =====

let currentBackupTab = 'classes';

// Open backup modal
function openBackupModal() {
  document.getElementById('backup-modal').style.display = 'flex';
  showBackupList('classes');
}

// Show backups for a specific file type
async function showBackupList(fileType) {
  currentBackupTab = fileType;

  // Update tab styling
  document.getElementById('tab-classes').classList.toggle('active', fileType === 'classes');
  document.getElementById('tab-lessonPlans').classList.toggle('active', fileType === 'lessonPlans');

  const container = document.getElementById('backup-list');
  container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">Loading backups...</p>';

  try {
    const response = await window.BSTApi.fetch(`/api/backups/${fileType}`, {}, { requireAdmin: true });
    if (!response.ok) throw new Error('Failed to fetch backups');

    const data = await response.json();
    const backups = data.backups || [];

    if (backups.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <p>No backups found for ${fileType === 'classes' ? 'Classes' : 'Lesson Plans'}.</p>
          <p style="font-size: 13px; margin-top: 8px;">Backups are created automatically when you save changes.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = backups.map(backup => {
      // Parse the timestamp for display
      const dateMatch = backup.fileName.match(/_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
      let displayDate = backup.timestamp;
      if (dateMatch) {
        const [, year, month, day, hour, min, sec] = dateMatch;
        displayDate = `${month}/${day}/${year} ${hour}:${min}:${sec}`;
      }

      return `
        <div class="backup-item">
          <div class="backup-info">
            <div class="backup-date"><span class="material-icons" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">event</span> ${escapeHtml(displayDate)}</div>
            <div class="backup-filename">${escapeHtml(backup.fileName)}</div>
          </div>
          <div class="backup-actions">
            <button onclick="restoreBackup('${backup.fileName}')" class="btn-small btn-restore" title="Restore this backup">
              <span class="material-icons" style="font-size: 14px; vertical-align: middle;">restore</span> Restore
            </button>
            <button onclick="deleteBackup('${backup.fileName}')" class="btn-small btn-delete" title="Delete this backup">
              <span class="material-icons" style="font-size: 14px; vertical-align: middle;">delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading backups:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff6b6b;">
        <p>Error loading backups: ${escapeHtml(err.message || 'Unknown error')}</p>
        <p style="font-size: 13px; margin-top: 8px;">Make sure the server is running.</p>
      </div>
    `;
  }
}

// Create a manual backup
async function createManualBackup(fileType) {
  try {
    const response = await window.BSTApi.fetch('/api/backups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: fileType })
    }, { requireAdmin: true });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create backup');
    }

    const result = await response.json();
    alert(`Backup created: ${result.backupFileName}`);
    showBackupList(currentBackupTab);

  } catch (err) {
    console.error('Error creating backup:', err);
    alert('Error creating backup: ' + err.message);
  }
}

// Restore from a backup
async function restoreBackup(backupFileName) {
  const confirmRestore = confirm(
    `Are you sure you want to restore from this backup?\n\n` +
    `File: ${backupFileName}\n\n` +
    `This will replace the current data. A backup of the current data will be created automatically.`
  );

  if (!confirmRestore) return;

  try {
    const response = await window.BSTApi.fetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupFileName })
    }, { requireAdmin: true });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to restore backup');
    }

    const result = await response.json();
    alert(`${result.message}\n\nPlease refresh the page to see the restored data.`);

    // Refresh the page to load restored data
    if (confirm('Refresh the page now to load the restored data?')) {
      window.location.reload();
    }

  } catch (err) {
    console.error('Error restoring backup:', err);
    alert('Error restoring backup: ' + err.message);
  }
}

// Delete a backup
async function deleteBackup(backupFileName) {
  const confirmDelete = confirm(`Delete this backup?\n\n${backupFileName}\n\nThis cannot be undone.`);

  if (!confirmDelete) return;

  try {
    const response = await window.BSTApi.fetch(`/api/backups/${encodeURIComponent(backupFileName)}`, {
      method: 'DELETE'
    }, { requireAdmin: true });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete backup');
    }

    showBackupList(currentBackupTab);

  } catch (err) {
    console.error('Error deleting backup:', err);
    alert('Error deleting backup: ' + err.message);
  }
}

// Set up backup button listener
document.getElementById('backup-btn')?.addEventListener('click', openBackupModal);