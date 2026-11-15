var e={allLessonPlans:[],allClasses:[],allNotes:[],currentLessonPlan:null,currentClass:null,currentNote:null,currentMediaIndex:null,currentSectionIndex:null},t=3e3,n;function r(e){return typeof e==`object`&&!!e}function i(e){return e instanceof Error?e.message:String(e)}function a(e){return document.getElementById(e)}function o(e){let t=document.getElementById(e);return t instanceof HTMLInputElement?t:null}function s(e){let t=document.getElementById(e);return t instanceof HTMLTextAreaElement?t:null}function c(e){let t=document.getElementById(e);return t instanceof HTMLSelectElement?t:null}function l(e){let t=document.getElementById(e);return t instanceof HTMLAnchorElement?t:null}function u(){return`class-`+Date.now()+`-`+Math.random().toString(36).substr(2,9)}function d(){return`note-`+Date.now()+`-`+Math.random().toString(36).substr(2,9)}function f(e){return!e||typeof e!=`object`?``:String(e.id||e.planId||``).trim()}function p(e){return!e||typeof e!=`object`?``:String(e.id||e.noteId||``).trim()}function m(e){let t={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#039;`};return e.replace(/[&<>"']/g,e=>t[e]??e)}function h(e,t=!1,r=``){let i=a(`admin-save-toast`);i||(i=document.createElement(`div`),i.id=`admin-save-toast`,Object.assign(i.style,{position:`fixed`,bottom:`24px`,right:`24px`,padding:`10px 18px`,borderRadius:`6px`,fontSize:`13px`,fontWeight:`600`,color:`#fff`,zIndex:`9999`,opacity:`0`,transition:`opacity 0.3s ease`,pointerEvents:`none`}),document.body.appendChild(i)),r?i.innerHTML=`<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 6px;">${r}</span>${m(String(e||``))}`:i.textContent=e,i.style.background=t?`#c0392b`:`#27ae60`,i.style.opacity=`1`,clearTimeout(n),n=setTimeout(()=>{i&&(i.style.opacity=`0`)},2500)}function g(e,t){t?.success?h(`${e} saved`,!1,`check_circle`):h(`${e} save failed`,!0,`warning`)}async function _(e,t,n){try{if(!window.BSTApi)throw Error(`BSTApi is not available`);console.log(`Attempting API save to ${e}...`);let i=await window.BSTApi.fetch(e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)},{requireAdmin:!0});if(console.log(`API response status:`,i.status,i.statusText),i.ok){let e=await i.json().catch(()=>({})),t=r(e)?e:{};console.log(`[OK] ${n} saved successfully:`,t),g(n,t);return}let a=await i.text();throw console.error(`API error response:`,a),Error(`API error: ${i.status} - ${a}`)}catch(e){console.error(`Failed to save ${n.toLowerCase()}:`,e),h(`${n} save failed: ${i(e)}`,!0,`warning`)}}function v(e){let t=a(e);t&&(t.style.display=`none`)}function y(e){let t=a(`outline-list`);t&&(t.innerHTML=``,(Array.isArray(e.outline)?e.outline:[]).forEach((e,n)=>{let r=Array.isArray(e?.questions)?e.questions:[],i=e?.summary||`(No summary)`,a=e?.id||``,o=document.createElement(`div`);o.className=`section-item`,o.innerHTML=`
      <div class="section-item-info">
        <div class="section-item-title">${i}</div>
        <div class="section-item-id">${a}</div>
        <div class="section-item-type" style="font-size: 12px; color: var(--muted); margin-top: 2px;">
          ${r.length} questions
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editSection(${n})">Edit</button>
        <button class="btn-icon" onclick="deleteSection(${n})">Delete</button>
      </div>
    `,t.appendChild(o)}))}function b(e=``,t=``,n=``,r=-1){let i=a(`questions-list`);if(!i)return;let o=document.createElement(`div`);o.className=`question-field`,o.innerHTML=`
    <div class="question-field-group">
      <input type="text" placeholder="Question key" class="question-key" />
      <input type="text" placeholder="Question prompt" class="question-prompt" style="flex: 2;" />
      <button class="btn-icon" onclick="this.parentElement.parentElement.remove()">Remove</button>
    </div>
    <div class="question-answer">
      <label style="display:block; font-size:12px; color: var(--muted); margin-bottom:4px;">Notes / Answer (optional)</label>
      <textarea class="question-answer-input" rows="3" placeholder="Your notes or suggested answer"></textarea>
    </div>
  `;let s=o.querySelector(`.question-key`),c=o.querySelector(`.question-prompt`),l=o.querySelector(`.question-answer-input`);if(s instanceof HTMLInputElement&&(s.value=e||``),c instanceof HTMLInputElement&&(c.value=t||``),l instanceof HTMLTextAreaElement&&(l.value=n||``),r>=0){let e=document.querySelectorAll(`.question-field`)[r];e?e.replaceWith(o):i.appendChild(o)}else i.appendChild(o)}function x(e){let t=a(`section-questions-container`);if(!t)return;t.innerHTML=`<label style="display: block; margin-bottom: 10px;">Questions</label>`;let n=document.createElement(`div`);n.id=`questions-list`,t.appendChild(n),e.forEach((e,t)=>{b(e.key,e.prompt,e.answer,t)})}function ee(t){if(e.currentClass===null)return;let n=e.allClasses[e.currentClass]?.outline?.[t];if(!n)return;e.currentSectionIndex=t;let r=Array.isArray(n.points)?n.points.map(e=>typeof e==`string`?e:e.text):[],i=Array.isArray(n.questions)?n.questions:[],c=a(`section-modal-title`),l=o(`section-id`),u=o(`section-summary`),d=o(`section-defaultOpen`),f=s(`section-points`),p=a(`section-modal`);c&&(c.textContent=`Edit Section`),l&&(l.value=n.id||``),u&&(u.value=n.summary||``),d&&(d.checked=!!n.defaultOpen),f&&(f.value=r.join(`
`)),x(i),p&&(p.style.display=`flex`)}function te(){e.currentSectionIndex=null;let t=a(`section-modal-title`),n=o(`section-id`),r=o(`section-summary`),i=o(`section-defaultOpen`),c=s(`section-points`),l=a(`section-modal`);t&&(t.textContent=`Add Section`),n&&(n.value=``),r&&(r.value=``),i&&(i.checked=!1),c&&(c.value=``),x([]),l&&(l.style.display=`flex`)}function S(){if(e.currentClass===null)return;let t=e.allClasses[e.currentClass];if(!t)return;let n=o(`section-id`)?.value??``,r=o(`section-summary`)?.value??``,i=o(`section-defaultOpen`)?.checked??!1,a=s(`section-points`)?.value??``;if(!n||!r){alert(`Please fill in ID and Summary`);return}let c=a.split(`
`).map(e=>e.trim()).filter(e=>e),l=[];document.querySelectorAll(`.question-field`).forEach(e=>{let t=e.querySelector(`.question-key`),n=e.querySelector(`.question-prompt`),r=e.querySelector(`.question-answer-input`),i=t instanceof HTMLInputElement?t.value:``,a=n instanceof HTMLInputElement?n.value:``,o=r instanceof HTMLTextAreaElement?r.value:``;i&&a&&l.push({key:i,prompt:a,answer:o})});let u={id:n,summary:r,defaultOpen:i,points:c,questions:l};Array.isArray(t.outline)||(t.outline=[]),e.currentSectionIndex===null?t.outline.push(u):t.outline[e.currentSectionIndex]=u,y(t),v(`section-modal`),q()}function C(t){if(e.currentClass===null)return;let n=e.allClasses[e.currentClass];n&&Array.isArray(n.outline)&&confirm(`Delete this section?`)&&(n.outline.splice(t,1),y(n),q())}function w(e){if(!r(e)||typeof e.title!=`string`)return null;let t=Array.isArray(e.classes)?e.classes.filter(e=>typeof e==`string`||typeof e==`number`):void 0;return{id:typeof e.id==`string`?e.id:void 0,planId:typeof e.planId==`string`?e.planId:void 0,title:e.title,description:typeof e.description==`string`?e.description:void 0,createdDate:typeof e.createdDate==`string`?e.createdDate:``,order:typeof e.order==`number`?e.order:void 0,classes:t}}async function ne(){try{if(!window.BSTApi){e.allLessonPlans=[];return}console.log(`Fetching lesson plans from API`);let t=await window.BSTApi.getLessonPlans();console.log(`Parsed JSON data:`,t),e.allLessonPlans=r(t)&&Array.isArray(t.lessonPlans)?t.lessonPlans.map(w).filter(e=>e!==null):[],console.log(`Set allLessonPlans to:`,e.allLessonPlans)}catch(t){console.error(`Failed to load lesson plans:`,t),e.allLessonPlans=[]}}function T(){let t=a(`lessonplans-list`);t&&(console.log(`Rendering lesson plans, count:`,e.allLessonPlans.length),t.innerHTML=``,e.allLessonPlans.length===0?t.innerHTML=`<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No lesson plans yet. Create one to get started!</p>`:e.allLessonPlans.forEach((e,n)=>{let r=e.classes?e.classes.length:0,i=document.createElement(`div`);i.className=`lessonplan-card`,i.innerHTML=`
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${m(e.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editLessonPlan(${n})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteLessonPlan(${n})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${m(e.description||``)}</div>
      <div class="lessonplan-card-footer">
        <span class="lessonplan-card-classes">${r} class${r===1?``:`es`}</span>
        <div style="margin-top: 8px; font-size: 11px;">Created: ${new Date(e.createdDate).toLocaleDateString()}</div>
      </div>
      <button class="btn-primary" onclick="openLessonPlan(${n})" style="margin-top: 12px; width: 100%;">Open</button>
    `,t.appendChild(i)}))}function re(){let t=a(`lessonplan-modal-title`),n=o(`lessonplan-title`),r=s(`lessonplan-description`),i=a(`lessonplan-modal`);t&&(t.textContent=`New Lesson Plan`),n&&(n.value=``),r&&(r.value=``),e.currentLessonPlan=null,i&&(i.style.display=`flex`)}function E(t){let n=e.allLessonPlans[t];if(!n)return;e.currentLessonPlan=t;let r=a(`lessonplan-modal-title`),i=o(`lessonplan-title`),c=s(`lessonplan-description`),l=a(`lessonplan-modal`);r&&(r.textContent=`Edit Lesson Plan`),i&&(i.value=n.title),c&&(c.value=n.description||``),l&&(l.style.display=`flex`)}function ie(){let t=o(`lessonplan-title`)?.value??``,n=s(`lessonplan-description`)?.value??``,r=``;if(!t.trim())alert(`Please enter a lesson plan title`);else{if(e.currentLessonPlan!==null&&e.allLessonPlans[e.currentLessonPlan]){let i=e.allLessonPlans[e.currentLessonPlan];i.title=t.trim(),i.description=n.trim(),r=f(i)}else{let i={id:`lesson-plan-${Date.now()}`,title:t.trim(),description:n.trim(),createdDate:new Date().toISOString().split(`T`)[0],order:e.allLessonPlans.length+1,classes:[]};e.allLessonPlans.push(i),r=f(i)}A({changedPlanId:r}),v(`lessonplan-modal`),T()}}function D(t){let n=e.allLessonPlans[t];if(n&&confirm(`Delete this lesson plan and all its classes?`)){let r=f(n);e.allLessonPlans.splice(t,1),A({deletedPlanId:r}),T()}}function O(t){let n=e.allLessonPlans[t];if(!n)return;e.currentLessonPlan=t;let r=a(`header-title`),i=a(`header-subtitle`),o=a(`back-btn`);r&&(r.textContent=n.title),i&&(i.textContent=`Edit classes in this lesson plan`),o&&(o.style.display=`block`);let s=l(`view-student-link`),c=l(`view-teacher-link`);s&&(s.style.display=`inline-flex`),c&&(c.style.display=`inline-flex`);let u=a(`lessonplan-view`),d=a(`class-editor-view`),f=a(`class-list-title`);u&&(u.style.display=`none`),d&&(d.style.display=`grid`),f&&(f.textContent=`Classes in "${n.title}"`),e.currentClass=null,s&&(s.href=`student.html`),c&&(c.href=`teacher.html`),R()}function k(){e.currentLessonPlan=null,e.currentClass=null;let t=a(`header-title`),n=a(`header-subtitle`),r=a(`back-btn`);t&&(t.textContent=`Lesson Plans`),n&&(n.textContent=`Create and manage Bible study lesson plans`),r&&(r.style.display=`none`);let i=l(`view-student-link`),o=l(`view-teacher-link`);i&&(i.style.display=`none`),o&&(o.style.display=`none`);let s=a(`lessonplan-view`),c=a(`class-editor-view`),u=a(`editor`),d=a(`no-selection`);s&&(s.style.display=`grid`),c&&(c.style.display=`none`),u&&(u.style.display=`none`),d&&(d.style.display=`block`),i&&(i.href=`student.html`),o&&(o.href=`teacher.html`),T()}async function A(t={}){console.log(`saveLessonPlansToFile called with`,e.allLessonPlans.length,`lesson plans`),await _(`/api/save/lessonPlans`,{lessonPlans:e.allLessonPlans},`Lesson plans`)}function j(){let e=c(`media-type`)?.value??``,t=a(`media-fields`);t&&(t.innerHTML=``,e===`video`?t.innerHTML=`
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
    `:e===`pdf`?t.innerHTML=`
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
    `:e===`images`?t.innerHTML=`
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
    `:e===`audio`?t.innerHTML=`
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
    `:e===`document`?t.innerHTML=`
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
    `:e===`link`&&(t.innerHTML=`
      <div class="form-group">
        <label for="media-link-url">External Link URL</label>
        <input type="text" id="media-link-url" placeholder="https://example.com" />
        <small>Link to an external website or resource</small>
      </div>
    `))}function ae(e){let t=c(`media-type`)?.value??``,n=e.sources;if(t===`video`&&n){let t=n.find(e=>e.type===`youtube`||e.format===`youtube`),r=n.find(e=>e.type===`local`);if(t){let e=o(`media-youtube-id`);e&&(e.value=t.url||t.videoId||``)}if(r){let e=o(`media-local-video`);e&&(e.value=r.url||``)}if(e.duration!==void 0){let t=o(`media-duration`);t&&(t.value=String(e.duration))}if(e.pausePoints&&e.pausePoints.length>0){let t=e.pausePoints.map(e=>typeof e==`object`?e.time:e).join(`, `),n=o(`media-pause-points`);n&&(n.value=t)}}else if(t===`pdf`&&n){let e=n[0],t=o(`media-pdf-url`);e&&t&&(t.value=e.url||``)}else if(t===`images`&&n){let e=n.map(e=>e.url||``).join(`
`),t=s(`media-image-urls`);t&&(t.value=e)}else if(t===`audio`&&n){let e=n[0],t=o(`media-audio-url`);e&&t&&(t.value=e.url||``)}else if(t===`document`&&n){let e=n[0],t=o(`media-doc-url`);e&&t&&(t.value=e.url||``)}else if(t===`link`&&n){let e=n[0],t=o(`media-link-url`);e&&t&&(t.value=e.url||``)}}function M(e){let t=a(`media-list`);t&&(t.innerHTML=``,(e.media||[]).forEach((e,n)=>{let r=document.createElement(`div`);r.className=`media-item`,r.innerHTML=`
      <div class="media-item-info">
        <div class="media-item-title">
          ${e.title||``}
          ${e.primary?`<span style="color: var(--accent); margin-left: 8px;">●</span>`:``}
        </div>
        <div class="media-item-type">${e.type}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editMedia(${n})">Edit</button>
        <button class="btn-icon" onclick="deleteMedia(${n})">Delete</button>
      </div>
    `,t.appendChild(r)}))}function oe(t){if(e.currentClass===null)return;let n=e.allClasses[e.currentClass]?.media?.[t];if(!n)return;e.currentMediaIndex=t;let r=a(`media-modal-title`),i=o(`media-id`),s=c(`media-type`),l=o(`media-title`),u=o(`media-primary`),d=a(`media-modal`);r&&(r.textContent=`Edit Media`),i&&(i.value=n.id||``),s&&(s.value=n.type),l&&(l.value=n.title||``),u&&(u.checked=!!n.primary),j(),ae(n),d&&(d.style.display=`flex`)}function N(){e.currentMediaIndex=null;let t=a(`media-modal-title`),n=o(`media-id`),r=c(`media-type`),i=o(`media-title`),s=o(`media-primary`),l=a(`media-modal`);t&&(t.textContent=`Add Media`),n&&(n.value=``),r&&(r.value=`video`),i&&(i.value=``),s&&(s.checked=!1),j(),l&&(l.style.display=`flex`)}function P(){if(e.currentClass===null)return;let t=e.allClasses[e.currentClass];if(!t)return;let n=c(`media-type`)?.value??``,r=o(`media-id`)?.value??``,i=o(`media-title`)?.value??``,a=o(`media-primary`)?.checked??!1;if(!r||!i){alert(`Please fill in ID and Title`);return}let l=[],u={id:r,type:n,title:i,primary:a,sources:l};if(n===`video`){let e=o(`media-youtube-id`)?.value??``,t=o(`media-local-video`)?.value??``;e&&l.push({type:`youtube`,url:e}),t&&l.push({type:`local`,url:t});let n=o(`media-duration`)?.value??``;n&&(u.duration=parseInt(n,10));let r=o(`media-pause-points`)?.value??``;u.pausePoints=r?r.split(`,`).map(e=>parseInt(e.trim(),10)).filter(e=>!isNaN(e)):[]}else if(n===`pdf`){let e=o(`media-pdf-url`)?.value??``;e&&l.push({type:`pdf`,url:e})}else if(n===`images`)(s(`media-image-urls`)?.value??``).split(`
`).filter(e=>e.trim()).forEach(e=>{l.push({type:`image`,url:e.trim()})});else if(n===`audio`){let e=o(`media-audio-url`)?.value??``;e&&l.push({type:`audio`,url:e})}else if(n===`document`){let e=o(`media-doc-url`)?.value??``;e&&l.push({type:`document`,url:e})}else if(n===`link`){let e=o(`media-link-url`)?.value??``;e&&l.push({type:`link`,url:e})}Array.isArray(t.media)||(t.media=[]),a&&t.media.forEach(e=>{e.primary=!1}),e.currentMediaIndex===null?t.media.push(u):t.media[e.currentMediaIndex]=u,M(t),v(`media-modal`),q()}function F(t){if(e.currentClass===null)return;let n=e.allClasses[e.currentClass];n&&Array.isArray(n.media)&&confirm(`Delete this media item?`)&&(n.media.splice(t,1),M(n),q())}var I;async function L(){try{if(!window.BSTApi){e.allClasses=[];return}let t=await window.BSTApi.getClasses();e.allClasses=Array.isArray(t)?t:r(t)&&Array.isArray(t.classes)?t.classes:[]}catch(t){console.error(`Failed to load classes:`,t),e.allClasses=[]}}function R(){let t=a(`classes-list`);if(!t||e.currentLessonPlan===null)return;t.innerHTML=``;let n=e.allLessonPlans[e.currentLessonPlan];if(!n)return;(n.classes||[]).forEach(n=>{let r=e.allClasses.find(e=>e.id===n||e.classNumber===n);if(r){let n=e.allClasses.indexOf(r),i=document.createElement(`div`);i.className=`class-item`+(e.currentClass===n?` active`:``),i.innerHTML=`
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
              <span class="class-item-title">${m(r.title||``)}</span>
          </div>
          <button class="btn-icon" onclick="removeClassFromLessonPlan(${n})" title="Remove"><span class="material-symbols-outlined">delete</span></button>
        </div>
      `,i.addEventListener(`click`,e=>{let t=e.target;t instanceof Element&&t.closest(`button`)||W(n)}),t.appendChild(i)}});let r=document.createElement(`div`);r.className=`class-item`,r.style.cursor=`pointer`,r.style.textAlign=`center`,r.style.color=`var(--accent)`,r.innerHTML=`+ Add Existing Class`,r.addEventListener(`click`,z),t.appendChild(r)}function z(){if(e.currentLessonPlan===null)return;let t=e.allLessonPlans[e.currentLessonPlan];if(!t)return;let n=t.classes||[],r=e.allClasses.filter(e=>{let t=e.id??e.classNumber;return t!==void 0&&!n.includes(t)});if(r.length===0){alert(`All available classes are already in this lesson plan.`);return}let i=`<div style="display: flex; flex-direction: column; gap: 10px;">`;r.forEach(t=>{let n=e.allClasses.indexOf(t);i+=`
      <button class="btn-secondary" style="text-align: left; padding: 10px;" onclick="addClassToLessonPlan(${n}); closeModal('class-add-modal');">
        <strong>${m(t.title||``)}</strong><br/>
        <span style="font-size: 12px; color: var(--muted);">${m(t.subtitle||``)}</span>
      </button>
    `}),i+=`</div>`;let o=a(`class-add-modal-content`),s=a(`class-add-modal`);o&&(o.innerHTML=i),s&&(s.style.display=`flex`)}function B(t){if(e.currentLessonPlan===null)return;let n=e.allClasses[t],r=e.allLessonPlans[e.currentLessonPlan];if(!n||!r)return;let i=n.id??n.classNumber;i!==void 0&&(r.classes||=[],r.classes.includes(i)||(r.classes.push(i),R(),A({changedPlanId:f(r)})))}function V(t){if(e.currentLessonPlan===null)return;let n=e.allClasses[t],r=e.allLessonPlans[e.currentLessonPlan];if(!n||!r)return;let i=n.id??n.classNumber;r.classes=(r.classes||[]).filter(e=>e!==i),R(),A({changedPlanId:f(r)})}function H(){let t=u(),n={id:t,classNumber:e.allClasses.length+1,title:`New Class`,subtitle:``,instructor:``,channelName:`class-${e.allClasses.length+1}-control`,media:[],outline:[],content:{html:`<p>Start writing your class content here...</p>`,json:{type:`doc`,content:[{type:`paragraph`,content:[{type:`text`,text:`Start writing your class content here...`}]}]},text:`Start writing your class content here...`}};if(e.allClasses.push(n),console.log(`Created new class:`,n),e.currentLessonPlan!==null&&e.allLessonPlans[e.currentLessonPlan]){let n=e.allLessonPlans[e.currentLessonPlan];n.classes||=[],n.classes.includes(t)||n.classes.push(t),R()}W(e.allClasses.length-1),console.log(`Auto-saving new class...`),q({changedClassId:t}),e.currentLessonPlan!==null&&(console.log(`Auto-saving lesson plan...`),A())}function U(){if(e.currentClass===null||!e.allClasses[e.currentClass]){alert(`Please select a class first`);return}let t=e.allClasses[e.currentClass],n=t.id??t.classNumber??``;window.open(`editor.html?class=${n}`,`_blank`)}function W(t){let n=e.allClasses[t];if(!n)return;e.currentClass=t,Array.isArray(n.media)||(n.media=[]),Array.isArray(n.outline)||(n.outline=[]);let r=a(`editor`),i=a(`no-selection`),s=a(`edit-title`),c=a(`save-class-btn`),u=a(`edit-content-btn`);r&&(r.style.display=`block`),i&&(i.style.display=`none`),s&&(s.textContent=`Editing: ${n.title||``}`),c&&(c.style.display=`block`),u&&(u.style.display=`block`);let d=o(`classTitle`),f=o(`classSubtitle`),p=o(`classInstructor`),m=o(`classChannel`);d&&(d.value=n.title||``),f&&(f.value=n.subtitle||``),p&&(p.value=n.instructor||``),m&&(m.value=n.channelName||``),M(n),y(n);let h=n.id??n.classNumber??``,g=l(`view-student-link`),_=l(`view-teacher-link`);g&&(g.href=`student.html?class=${h}`),_&&(_.href=`teacher.html?class=${h}`),R()}function G(e){let t=o(`classTitle`),n=o(`classSubtitle`),r=o(`classInstructor`),i=o(`classChannel`);t&&(e.title=t.value),n&&(e.subtitle=n.value),r&&(e.instructor=r.value),i&&(e.channelName=i.value)}function K(){if(e.currentClass===null)return;let t=e.allClasses[e.currentClass];t&&(G(t),q())}async function q(t={}){console.log(`saveClassToFile called with`,e.allClasses.length,`classes`),await _(`/api/save/classes`,{classes:e.allClasses},`Classes`)}function se(){clearTimeout(I),I=setTimeout(()=>{if(e.currentClass===null)return;let t=e.allClasses[e.currentClass];t&&(G(t),q())},t)}var J=window;function Y(e){let t=document.querySelector(`input[name="media-${e}-mode"]:checked`),n=t instanceof HTMLInputElement?t.value:void 0,r=a(`media-${e}-link-group`),i=a(`media-${e}-upload-group`);n===`upload`?(r&&(r.style.display=`none`),i&&(i.style.display=`block`)):(r&&(r.style.display=`block`),i&&(i.style.display=`none`))}function X(e){let t=document.querySelector(`input[name="${e}"][value="link"]`);t instanceof HTMLInputElement&&(t.checked=!0)}async function ce(e,t){if(!t||t instanceof FileList&&t.length===0)return;let n=J.bst?.uploadMedia;if(!n)alert(`File upload is only available in the desktop app. Please use the link option or run the desktop version.`);else try{if(t instanceof FileList){let r=[];for(let i of t){let t=await n(e,i.name,await i.arrayBuffer());r.push(t)}if(e===`images`){let e=s(`media-image-urls`);e&&(e.value=r.join(`
`)),X(`media-images-mode`),Y(`images`)}}else{let r=await n(e,t.name,await t.arrayBuffer()),i={video:{inputId:`media-local-video`,radioName:`media-video-mode`},pdf:{inputId:`media-pdf-url`,radioName:`media-pdf-mode`},audio:{inputId:`media-audio-url`,radioName:`media-audio-mode`},document:{inputId:`media-doc-url`,radioName:`media-doc-mode`}}[e];if(i){let t=o(i.inputId);t&&(t.value=r),X(i.radioName),Y(e)}}alert(`File(s) uploaded successfully!`)}catch(e){console.error(`Upload failed:`,e),alert(`Upload failed: `+i(e))}}async function le(e){let t=J.bst?.downloadMedia;if(!t){alert(`Download feature is only available in the desktop app.`);return}let n=window.event?.target,r=n instanceof HTMLButtonElement?n:null,a=r?.textContent??``;try{let n=[];if(e===`video`){let e=o(`media-local-video`)?.value.trim()??``;if(!e){alert(`Please enter a video URL first`);return}n=[e]}else if(e===`pdf`){let e=o(`media-pdf-url`)?.value.trim()??``;if(!e){alert(`Please enter a PDF URL first`);return}n=[e]}else if(e===`images`){let e=s(`media-image-urls`)?.value.trim()??``;if(!e){alert(`Please enter image URLs first`);return}n=e.split(`
`).map(e=>e.trim()).filter(e=>e)}else if(e===`audio`){let e=o(`media-audio-url`)?.value.trim()??``;if(!e){alert(`Please enter an audio URL first`);return}n=[e]}else if(e===`document`){let e=o(`media-doc-url`)?.value.trim()??``;if(!e){alert(`Please enter a document URL first`);return}n=[e]}r&&(r.disabled=!0,r.style.opacity=`0.7`);let i=n.length,c=0,l=[];for(let a of n){if(a.startsWith(`assets/`)){l.push(a);continue}c++,r&&(r.textContent=i>1?`Downloading ${c}/${i}...`:`Downloading...`);let n=await t(e,a);l.push(n)}if(e===`video`){let e=o(`media-local-video`);e&&(e.value=l[0]??``)}else if(e===`pdf`){let e=o(`media-pdf-url`);e&&(e.value=l[0]??``)}else if(e===`images`){let e=s(`media-image-urls`);e&&(e.value=l.join(`
`))}else if(e===`audio`){let e=o(`media-audio-url`);e&&(e.value=l[0]??``)}else if(e===`document`){let e=o(`media-doc-url`);e&&(e.value=l[0]??``)}r&&(r.textContent=`Download Complete!`,r.style.opacity=`1`,setTimeout(()=>{r.textContent=a,r.disabled=!1},2e3))}catch(e){console.error(`Download failed:`,e),r&&(r.textContent=a,r.disabled=!1,r.style.opacity=`1`),alert(`Download failed: `+i(e))}}async function ue(){let e=o(`media-youtube-id`)?.value.trim()??``;if(!e){alert(`Please enter a YouTube Video ID first`);return}let t=window.event?.target,n=t instanceof HTMLButtonElement?t:null,a=n?.textContent??``;try{n&&(n.disabled=!0,n.textContent=`Attempting download...`,n.style.opacity=`0.7`);let t=`https://www.youtube.com/watch?v=${e}`;try{if(!window.BSTApi)throw Error(`BSTApi is not available`);let e=await window.BSTApi.fetch(`/api/download/youtube`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({videoUrl:t})},{requireAdmin:!0});if(e.ok){let t=await e.json(),i=r(t)?t:{},s=o(`media-local-video`);s&&(s.value=i.localPath??``),n&&(n.textContent=`Download Complete!`,n.style.opacity=`1`,setTimeout(()=>{n.textContent=a,n.disabled=!1},2e3));return}let i=await e.json(),s=r(i)?i:{};throw Error(s.error||`Download failed`)}catch(r){console.warn(`API download failed:`,i(r));let o=`
YouTube is blocking automated downloads.

You can download the video manually using:
1. Download from YouTube directly using a download service
2. Use a tool like yt-dlp or ffmpeg

Video URL: ${t}

For now, you can:
- Keep the YouTube link as the source
- Or manually download and place in: assets/video/${e}.mp4

Copy the URL and use an external downloader.
      `;alert(o),n&&(n.textContent=a,n.disabled=!1,n.style.opacity=`1`)}}catch(e){console.error(`Download error:`,e),n&&(n.textContent=a,n.disabled=!1,n.style.opacity=`1`),alert(`Download error: `+i(e))}}function de(e){return!r(e)||typeof e.title!=`string`?null:{id:typeof e.id==`string`?e.id:void 0,noteId:typeof e.noteId==`string`?e.noteId:void 0,title:e.title,description:typeof e.description==`string`?e.description:void 0,createdDate:typeof e.createdDate==`string`?e.createdDate:``,lastModified:typeof e.lastModified==`string`?e.lastModified:void 0,content:e.content}}async function fe(){try{if(!window.BSTApi){e.allNotes=[];return}console.log(`Fetching notes from API`);let t=await window.BSTApi.getNotes();console.log(`Parsed notes JSON data:`,t),e.allNotes=r(t)&&Array.isArray(t.notes)?t.notes.map(de).filter(e=>e!==null):[],console.log(`Set allNotes to:`,e.allNotes)}catch(t){console.error(`Failed to load notes:`,t),e.allNotes=[]}}function Z(){let t=a(`notes-list`);t&&(console.log(`Rendering notes, count:`,e.allNotes.length),t.innerHTML=``,e.allNotes.length===0?t.innerHTML=`<p style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">No notes yet. Create one to get started!</p>`:e.allNotes.forEach((e,n)=>{let r=document.createElement(`div`);r.className=`lessonplan-card`,r.innerHTML=`
      <div class="lessonplan-card-header">
        <div class="lessonplan-card-title">${m(e.title)}</div>
        <div class="lessonplan-card-actions">
          <button class="btn-icon" onclick="editNoteMetadata(${n})" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-icon" onclick="deleteNote(${n})" title="Delete"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="lessonplan-card-description">${m(e.description||``)}</div>
      <div class="lessonplan-card-footer">
        <div style="font-size: 11px;">Created: ${new Date(e.createdDate).toLocaleDateString()}</div>
        ${e.lastModified?`<div style="font-size: 11px;">Modified: ${new Date(e.lastModified).toLocaleDateString()}</div>`:``}
      </div>
      <button class="btn-primary" onclick="openNoteEditor(${n})" style="margin-top: 12px; width: 100%;"><span class="material-symbols-outlined">edit_note</span>Edit Note</button>
    `,t.appendChild(r)}))}function pe(){let e=a(`lessonplan-view`),t=a(`notes-view`),n=a(`header-title`),r=a(`header-subtitle`);e&&(e.style.display=`none`),t&&(t.style.display=`grid`),n&&(n.textContent=`Notes`),r&&(r.textContent=`Create and manage personal notes`),Z()}function me(){let e=a(`notes-view`),t=a(`lessonplan-view`),n=a(`header-title`),r=a(`header-subtitle`);e&&(e.style.display=`none`),t&&(t.style.display=`grid`),n&&(n.textContent=`Lesson Plans`),r&&(r.textContent=`Create and manage Bible study lesson plans`),T()}function he(){let t=a(`note-modal-title`),n=o(`note-title`),r=s(`note-description`),i=a(`note-modal`);t&&(t.textContent=`New Note`),n&&(n.value=``),r&&(r.value=``),e.currentNote=null,i&&(i.style.display=`flex`)}function ge(t){let n=e.allNotes[t];if(!n)return;e.currentNote=t;let r=a(`note-modal-title`),i=o(`note-title`),c=s(`note-description`),l=a(`note-modal`);r&&(r.textContent=`Edit Note`),i&&(i.value=n.title),c&&(c.value=n.description||``),l&&(l.style.display=`flex`)}function _e(){let t=o(`note-title`)?.value??``,n=s(`note-description`)?.value??``;if(!t.trim()){alert(`Please enter a note title`);return}let r=null;if(e.currentNote!==null&&e.allNotes[e.currentNote]){let i=e.allNotes[e.currentNote];i.title=t.trim(),i.description=n.trim(),i.lastModified=new Date().toISOString(),r=p(i)}else{let i=d(),a={id:i,title:t.trim(),description:n.trim(),createdDate:new Date().toISOString(),lastModified:new Date().toISOString(),content:null};e.allNotes.push(a),r=i}Q({changedNoteId:r}),v(`note-modal`),Z()}function ve(t){let n=e.allNotes[t];if(n&&confirm(`Delete this note? This action cannot be undone.`)){let r=p(n);e.allNotes.splice(t,1),Q({deletedNoteId:r}),Z()}}function ye(t){let n=e.allNotes[t];if(!n)return;let r=p(n);window.location.href=`editor.html?note=${encodeURIComponent(r)}`}async function Q(t={}){console.log(`saveNotesToFile called with`,e.allNotes.length,`notes`),await _(`/api/save/notes`,{notes:e.allNotes},`Notes`)}async function be(){let e=document.createElement(`div`);e.id=`floating-global-nav`,Object.assign(e.style,{position:`fixed`,top:`16px`,right:`24px`,display:`flex`,gap:`20px`,alignItems:`center`,zIndex:`10000`,fontFamily:`inherit`});let t=document.createElement(`select`);t.setAttribute(`data-theme-select`,``),Object.assign(t.style,{background:`transparent`,border:`none`,color:`var(--accent, inherit)`,cursor:`pointer`,fontSize:`14px`,fontWeight:`500`,outline:`none`,padding:`0`}),[{id:`dark`,label:`Dark`},{id:`light`,label:`Light`},{id:`sepia`,label:`Sepia`},{id:`night`,label:`Night`},{id:`vivid`,label:`Vivid`}].forEach(e=>{let n=document.createElement(`option`);n.value=e.id,n.textContent=e.label,t.appendChild(n)}),t.value=document.documentElement.getAttribute(`data-theme`)||`dark`,t.addEventListener(`change`,()=>{window.BSTTheme&&window.BSTTheme.applyTheme(t.value)});let n=document.createElement(`a`);n.href=`user-admin.html`,Object.assign(n.style,{color:`var(--accent, inherit)`,textDecoration:`none`,fontWeight:`500`,fontSize:`14px`,display:`flex`,alignItems:`center`,gap:`6px`}),n.innerHTML=`Admin <span id="pending-requests-badge" style="display: none; background: #e74c3c; color: white; border-radius: 50%; padding: 2px 6px; font-size: 11px; line-height: 1;">0</span>`,n.addEventListener(`mouseenter`,()=>{n.style.textDecoration=`underline`}),n.addEventListener(`mouseleave`,()=>{n.style.textDecoration=`none`});let r=document.createElement(`button`);Object.assign(r.style,{background:`transparent`,border:`none`,color:`var(--accent, inherit)`,cursor:`pointer`,fontWeight:`500`,fontSize:`14px`,padding:`0`,outline:`none`}),r.textContent=`Sign Out`,r.addEventListener(`click`,async()=>{window.BSTApi&&(await window.BSTApi.logout(),window.location.replace(`/auth.html`))}),r.addEventListener(`mouseenter`,()=>{r.style.textDecoration=`underline`}),r.addEventListener(`mouseleave`,()=>{r.style.textDecoration=`none`}),e.appendChild(t),e.appendChild(n),e.appendChild(r),document.body.appendChild(e);try{if(window.BSTApi&&typeof window.BSTApi.listSignupRequests==`function`){let e=await window.BSTApi.listSignupRequests(`pending`);if(e&&e.requests&&e.requests.length>0){let t=a(`pending-requests-badge`);t&&(t.textContent=String(e.requests.length),t.style.display=`inline-block`)}}}catch(e){console.warn(`Could not fetch pending requests for badge:`,e)}}function xe(){a(`new-lessonplan-btn`)?.addEventListener(`click`,re),a(`back-btn`)?.addEventListener(`click`,k),a(`new-class-btn`)?.addEventListener(`click`,H),a(`add-media-btn`)?.addEventListener(`click`,N),a(`add-section-btn`)?.addEventListener(`click`,te),a(`save-class-btn`)?.addEventListener(`click`,K),a(`save-class-btn-bottom`)?.addEventListener(`click`,K),a(`edit-content-btn`)?.addEventListener(`click`,U),a(`switch-to-notes-btn`)?.addEventListener(`click`,pe),a(`switch-to-lessonplans-btn`)?.addEventListener(`click`,me),a(`new-note-btn`)?.addEventListener(`click`,he),[`classTitle`,`classSubtitle`,`classInstructor`,`classChannel`].forEach(e=>{a(e)?.addEventListener(`input`,se)})}window.addEventListener(`DOMContentLoaded`,async()=>{console.log(`Page loading...`),be(),await ne(),console.log(`Lesson plans loaded:`,e.allLessonPlans),await L(),console.log(`Classes loaded:`,e.allClasses),await fe(),console.log(`Notes loaded:`,e.allNotes),xe(),console.log(`Event listeners set up`),T(),console.log(`Rendered lesson plans list`)});var $=window;$.editLessonPlan=E,$.deleteLessonPlan=D,$.openLessonPlan=O,$.editNoteMetadata=ge,$.deleteNote=ve,$.openNoteEditor=ye,$.removeClassFromLessonPlan=V,$.addClassToLessonPlan=B,$.editMedia=oe,$.deleteMedia=F,$.editSection=ee,$.deleteSection=C,$.closeModal=v,$.updateMediaForm=j,$.saveMedia=P,$.addQuestionField=b,$.saveSection=S,$.saveLessonPlan=ie,$.saveNoteMetadata=_e,$.downloadYouTubeVideo=ue,$.toggleMediaInputMode=Y,$.downloadMediaToLocal=le,$.handleMediaUpload=ce;