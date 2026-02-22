# Bible Study App: Rich Text Editor / CMS Implementation Plan

**Date:** February 21, 2026  
**Objective:** Transform lesson plans and study content into Logos Bible Software Pro-inspired Rich Text Editor with CMS capabilities

---

## 1. FEATURE OVERVIEW

### Scope & Target Content
- **Editable Content Types:** Bible Commentary/Notes, Study Outlines, Discussion Questions
- **User Access:** Teachers and Admin role-based editing
- **Editing Environment:** WYSIWYG Rich Text Editor (CMS-style)
- **Inspiration:** Logos Bible Software Pro interface & functionality

### Key Features (Priority Order)
1. **Text Formatting** - Bold, italic, underline, text colors, background colors
2. **Hierarchical Outline Structure** - Multi-level headings (H1-H6) with outline view
3. **Bible Verse References & Cross-Links** - Linkable Bible references (e.g., John 3:16) with hover preview
4. **Images & Multimedia** - Embed images, video links, audio references
5. **Search & Replace** - Find/replace within documents
6. **Version Control** - Track changes, revision history, undo/redo within sessions

---

## 2. TECHNICAL ARCHITECTURE

### 2.1 Frontend Stack
- **Rich Text Editor Library:** TipTap (built on ProseMirror, Vue/React agnostic, extensible)
- **UI Framework:** Keep existing (HTML/CSS/JS)
- **Components Needed:**
  - Main Editor Component
  - Verse Reference Autocomplete/Suggestion System using existing Bible API
  - Outline Navigator (sidebar with hierarchical structure)
  - Formatting Toolbar
  - Media Manager
  - Display any verse or embedded media in the student view when clicked on
  - Search/Replace Modal

### 2.2 Backend Modifications
- **Database Schema Updates:**
  - Extend `lessonPlans.json` structure to include:
    - `content` (rich text HTML/JSON)
    - `sections` (outline hierarchy)
    - `verses` (array of Bible references used)
    - `mediaAssets` (embedded images/video references)
    - `lastModified` (timestamp)
    - `modifiedBy` (user ID)
    - `revisions` (array of historical versions)
  
- **Server-Side Validation:**
  - Content sanitization (prevent XSS)
  - File upload validation for media
  - Bible verse reference validation

### 2.3 Data Storage Strategy
**Current:** Markdown (.md) + JSON
**Proposed:** Nested JSON with rich content structure
```json
{
  "id": "lesson-1",
  "title": "Understanding Scripture",
  "content": {
    "type": "doc",
    "sections": [
      {
        "id": "sec-1",
        "level": 1,
        "heading": "Introduction",
        "richContent": "[TipTap JSON or HTML]",
        "verses": ["Proverbs 30:5-6", "Proverbs 30:7"],
        "mediaAssets": [
          {"type": "image", "url": "...", "caption": "..." }
        ]
      },
      {
        "id": "sec-1-1",
        "level": 2,
        "heading": "Context",
        "richContent": "[...]"
      }
    ]
  },
  "revisions": [
    {"version": 1, "timestamp": "2026-02-21", "modifiedBy": "user-id", "content": "..."}
  ]
}
```

---

## 3. IMPLEMENTATION PHASES

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Set up editor infrastructure and data model

- [ ] **1.1** Choose & integrate Rich Text Editor library (TipTap recommended)
- [ ] **1.2** Create Editor UI component with basic toolbar
- [ ] **1.3** Update JSON schema to support new content structure
- [ ] **1.4** Create data migration utility (convert .md to new structure)
- [ ] **1.5** Implement basic CRUD for edited content
- [ ] **1.6** Add user role checking (admin/teacher view vs student view)

### Phase 2: Core Editing Features (Weeks 3-4)
**Goal:** Implement formatting and structure capabilities

- [ ] **2.1** Text formatting toolbar (bold, italic, underline, colors)
- [ ] **2.2** Heading/paragraph styles (H1-H6, body text)
- [ ] **2.3** Outline hierarchy navigation (nested sections)
- [ ] **2.4** Drag-and-drop section reordering
- [ ] **2.5** Auto-save functionality
- [ ] **2.6** Visual editor state indicators (modified, saving, saved)

### Phase 3: Bible Reference System (Weeks 5-6)
**Goal:** Implement smart verse reference linking & functionality

- [ ] **3.1** Bible verse autocomplete/suggestion component
- [ ] **3.2** Verse link creation & detection (e.g., recognize "John 3:16")
- [ ] **3.3** Verse hover preview (show verse text on hover)
- [ ] **3.4** Cross-reference linking (link to other study sections)
- [ ] **3.5** Scripture database/API integration (if needed)
- [ ] **3.6** Verse validation against known Bible books

### Phase 4: Multimedia & Search (Weeks 7-8)
**Goal:** Add rich media and search capabilities

- [ ] **4.1** Image upload & embed functionality
- [ ] **4.2** Image management (resize, caption, alignment)
- [ ] **4.3** Video/audio link embedding
- [ ] **4.4** Search/Replace modal implementation
- [ ] **4.5** Highlighting search results in-editor
- [ ] **4.6** Case-sensitive/regex search options

### Phase 5: Version Control & Polish (Weeks 9-10)
**Goal:** Add revision history and refinements

- [ ] **5.1** Revision history UI & restore functionality
- [ ] **5.2** Change tracking (show what changed since last save)
- [ ] **5.3** Undo/Redo stack management
- [ ] **5.4** Editor keyboard shortcuts documentation
- [ ] **5.5** Performance optimization
- [ ] **5.6** User testing & bug fixes

### Phase 6: Integration & Deployment (Week 11+)
**Goal:** Full app integration

- [ ] **6.1** Update teacher/student views to use new editor
- [ ] **6.2** Migrate all existing lesson plans
- [ ] **6.3** Update admin interface dashboard
- [ ] **6.4** Add editor access logging
- [ ] **6.5** Documentation for users
- [ ] **6.6** Deployment & monitoring

---

## 4. DETAILED COMPONENT SPECIFICATIONS

### 4.1 Rich Text Editor Component
**Key Requirements:**
- Extensible plugin system for custom features
- Session-based undo/redo (not database-backed initially)
- Collaborative editing ready (for future phase)
- Mobile-responsive toolbar

**Recommended Library: TipTap**
- Built on ProseMirror
- Vue/React agnostic
- Extensive extension ecosystem
- Strong TypeScript support

### 4.2 Verse Reference System
**Functionality:**
- Detects verse patterns: "Book Chapter:Verse" or "Book Chapter:Verse-EndVerse"
- Examples: "John 3:16", "Romans 5:1-8", "1 Corinthians 13"
- On-demand verse fetching (API call to Bible service)
- Caching layer for performance
- Visual indicator for recognized verses (different styling)

**Data Source Options:**
- Scripture API (bible.com, OpenBible API, ESV API)
- Local JavaScript object with common verses
- Hybrid: Cache locally, fetch on demand

### 4.3 Outline Navigator
**Functionality:**
- Sidebar showing hierarchical section structure
- Click to jump to section
- Drag-to-reorder sections
- Collapse/expand nested sections
- Show verse counts per section

### 4.4 Media Manager
**Functionality:**
- Upload interface (drag-drop support)
- Image preview gallery
- File size validation
- Organize by lesson/section
- Insert/reference in editor

### 4.5 Search & Replace Module
**Functionality:**
- Modal interface
- Search current document or all documents
- Case-sensitive toggle
- Whole-word toggle
- Regex support
- Replace single or all occurrences
- Result previews with context

---

## 5. API ENDPOINTS (Backend Requirements)

```
POST   /api/lessonplans/:id/content     - Save edited content
GET    /api/lessonplans/:id/content     - Fetch content for editing
GET    /api/lessonplans/:id/revisions   - Get revision history
POST   /api/lessonplans/:id/revisions/:rev - Restore specific revision
DELETE /api/lessonplans/:id/revisions/:rev - Delete revision
POST   /api/upload/media                - Upload image/media file
GET    /api/verses/:reference           - Fetch Bible verse text
POST   /api/search                      - Global search across content
```

---

## 6. DATABASE/FILE STRUCTURE CHANGES

### Current:
```
assets/data/lessonPlans.json (metadata only)
assets/data/HowDoWeTrustTheBible.md (content as markdown)
```

### Proposed:
```
assets/data/lessonPlans.json (extended with content & metadata)
assets/data/revisions/ (directory for historical versions)
  - lesson-1-v1.json
  - lesson-1-v2.json
  - lesson-1-v3.json
```

**Migration Strategy:**
- Write parser to convert .md files → JSON rich content
- Preserve formatting as much as possible
- Create initial revision entry
- Backup originals

---

## 7. SECURITY & PERMISSIONS

### Access Control
- **Admin:** Full edit access to all content
- **Teacher:** Edit content within their assigned classes
- **Student:** Read-only view (no edit access)

### Content Security
- HTML sanitization on save (prevent XSS)
- Server-side validation of all updates
- User ID tracking for audit trail
- Rate limiting on file uploads

---

## 8. USER EXPERIENCE FLOW

### Teacher/Admin Editing Flow
1. Navigate to Lesson Plan
2. Click "Edit Content" button
3. Rich text editor loads with current content
4. Side panel shows outline navigator
5. Edit content (formatting, verses, images, etc.)
6. Auto-save every 30 seconds
7. View revision history if needed
8. Publish/Save final version
9. Changes visible to students immediately

### Student View
- Read-only formatted content
- Verse links clickable (show verse pop-up)
- Outline navigator available but not editable
- Print-friendly layout

---

## 9. FUTURE ENHANCEMENTS (Phase 2+)

- [ ] Collaborative real-time editing (multiple users)
- [ ] Comments & annotations system
- [ ] Export to PDF/Word
- [ ] Content templates (pre-formatted lesson structures)
- [ ] Bible translation selector (NKJV, NIV, ESV, etc.)
- [ ] Discussion questions generator (AI-assisted)
- [ ] Content versioning & approval workflow
- [ ] Multi-language support

---

## 10. TESTING STRATEGY

### Unit Tests
- Editor component initialization
- Content serialization/deserialization
- Verse reference detection
- Search/replace logic

### Integration Tests
- Save/load content lifecycle
- Permission-based edit access
- Revision history operations
- Media upload handling

### End-to-End Tests
- Complete edit workflow (create → format → save → view)
- Cross-browser compatibility
- Mobile responsiveness
- Performance with large documents

### Manual Testing Checkpoints
- [ ] Phase 1: Basic editing works
- [ ] Phase 2: Formatting & structure preserved
- [ ] Phase 3: Verses link correctly
- [ ] Phase 4: Media embeds work
- [ ] Phase 5: History/undo works

---

## 11. DEPENDENCIES & LIBRARIES

### Required
- **ripple editor:** TipTap or Quill.js
- **Verse detection:** Bible.js or custom parser
- **File upload:** Dropzone.js or native HTML5
- **Sanitization:** DOMPurify

### Optional
- Vue.js (if refactoring UI)
- Axios (HTTP client)
- FileSaver.js (client-side downloads)
- DIFF library (visualize changes)

---

## 12. TIMELINE ESTIMATE

| Phase | Duration | Complexity |
|-------|----------|-----------|
| 1: Foundation | 2 weeks | High |
| 2: Core Features | 2 weeks | Medium |
| 3: Verse System | 2 weeks | Medium |
| 4: Multimedia/Search | 2 weeks | Medium |
| 5: Version Control | 2 weeks | Low-Medium |
| 6: Integration | 2+ weeks | Medium |
| **Total** | **~12 weeks** | Varies |

---

## 13. RISK FACTORS & MITIGATION

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large scope creep | High | Stick to MVP, defer Phase 2 features |
| Data migration issues | High | Test migration with backup data first |
| Performance with large docs | Medium | Implement pagination or virtualization |
| Cross-browser compatibility | Medium | Test early and often |
| Verse API downtime | Low | Local fallback data |

---

## 14. SUCCESS CRITERIA

✅ Teachers can edit lesson content with rich formatting  
✅ Bible verse references are detectable and linkable  
✅ Multimedia (images, video links) can be embedded  
✅ Content persists correctly across sessions  
✅ Revision history available for restoration  
✅ Search/replace works across documents  
✅ Students see formatted content correctly  
✅ Zero data loss during migration  
✅ Mobile-responsive editor interface  
✅ Sub-2 second save times  

---

## Next Steps
1. **Confirm** library choice (TipTap recommended)
2. **Create** prototype of basic editor UI
3. **Design** final JSON schema structure
4. **Write** data migration script
5. **Begin** Phase 1 implementation
