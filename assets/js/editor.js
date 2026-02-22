// Bible Study Rich Text Editor
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import { Node, mergeAttributes } from '@tiptap/core';

// Custom Q&A Pause Marker Node Extension
const QAPauseMarker = Node.create({
    name: 'qaPauseMarker',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            sectionId: {
                default: null,
            },
            sectionTitle: {
                default: 'Discussion Questions',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div.qa-pause-marker',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                class: 'qa-pause-marker',
                'data-section-id': node.attrs.sectionId,
                'data-section-title': node.attrs.sectionTitle,
            }),
            [
                'div',
                { class: 'qa-pause-icon' },
                '💬',
            ],
            [
                'div',
                { class: 'qa-pause-content' },
                [
                    'div',
                    { class: 'qa-pause-title' },
                    'Pause for Q&A',
                ],
                [
                    'div',
                    { class: 'qa-pause-subtitle' },
                    node.attrs.sectionTitle,
                ],
            ],
        ];
    },

    addCommands() {
        return {
            insertQAPause:
                (attributes) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: attributes,
                    });
                },
        };
    },
});

let editor = null;
let currentDocument = null;
let autoSaveTimer = null;
let isDirty = false;
let currentClassId = null; // Can be either GUID or legacy classNumber
let allClasses = [];
let generatedOutline = null; // Stores the generated outline from the outline generator

// Initialize editor on page load
window.addEventListener('DOMContentLoaded', () => {
    // Get class ID from URL (supports both new GUID and legacy classNumber)
    const urlParams = new URLSearchParams(window.location.search);
    currentClassId = urlParams.get('class');
    
    initializeEditor();
    setupEventListeners();
    loadDocument();
});

// Initialize TipTap Editor
function initializeEditor() {
    editor = new Editor({
        element: document.querySelector('#editor'),
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3, 4, 5, 6],
                },
            }),
            TextStyle,
            Color,
            Underline,
            Highlight.configure({ multicolor: true }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'editor-link',
                },
            }),
            Image.configure({
                inline: true,
                HTMLAttributes: {
                    class: 'editor-image',
                },
            }),
            QAPauseMarker,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '<p>Loading content...</p>',
        editorProps: {
            attributes: {
                class: 'prose',
            },
        },
        onUpdate: ({ editor }) => {
            isDirty = true;
            updateSaveStatus('Modified');
            startAutoSave();
            updateOutlineNavigator();
        },
    });

    console.log('Editor initialized:', editor);
    
    // Add click handler for Q&A pause markers
    document.getElementById('editor').addEventListener('click', handleQAPauseClick);
}

// Handle clicks on Q&A pause markers
function handleQAPauseClick(e) {
    const marker = e.target.closest('.qa-pause-marker');
    if (marker) {
        const sectionId = marker.dataset.sectionId;
        const sectionTitle = marker.dataset.sectionTitle;
        
        if (sectionId && generatedOutline) {
            // Find the section and show its questions
            const section = generatedOutline.find(s => s.id === sectionId);
            if (section && section.questions && section.questions.length > 0) {
                showQAQuestions(section);
            } else {
                alert('No questions found for this section.');
            }
        } else {
            alert('This is a generic Q&A pause marker. Generate or apply an outline to link it to specific questions.');
        }
    }
}

// Show Q&A questions in a modal or sidebar
function showQAQuestions(section) {
    let questionsHTML = `<div class="qa-questions-display">
        <h3>${section.summary}</h3>
        <ol class="question-list">`;
    
    section.questions.forEach(q => {
        questionsHTML += `<li>
            <div class="question-prompt">${q.prompt}</div>
            ${q.answer ? `<div class="question-answer"><strong>Suggested answer:</strong> ${q.answer}</div>` : ''}
        </li>`;
    });
    
    questionsHTML += '</ol></div>';
    
    // Show in an alert for now (could enhance to a nicer modal later)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = questionsHTML;
    const textContent = section.questions.map((q, i) => 
        `${i + 1}. ${q.prompt}${q.answer ? '\n   Answer: ' + q.answer : ''}`
    ).join('\n\n');
    
    alert(`Questions for: ${section.summary}\n\n${textContent}`);
}

// Setup Event Listeners
function setupEventListeners() {
    // Toolbar buttons
    document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            handleToolbarAction(action);
        });
    });

    // Heading select
    document.getElementById('heading-select').addEventListener('change', (e) => {
        const level = e.target.value;
        if (level === 'paragraph') {
            editor.chain().focus().setParagraph().run();
        } else {
            const headingLevel = parseInt(level.replace('h', ''));
            editor.chain().focus().toggleHeading({ level: headingLevel }).run();
        }
    });

    // Color pickers
    document.getElementById('text-color').addEventListener('input', (e) => {
        editor.chain().focus().setColor(e.target.value).run();
    });

    document.getElementById('highlight-color').addEventListener('input', (e) => {
        editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
    });

    // Save button
    document.getElementById('btn-save').addEventListener('click', saveDocument);

    // View Teacher button
    document.getElementById('btn-view-teacher').addEventListener('click', viewTeacher);

    // Search button
    document.getElementById('btn-search').addEventListener('click', () => {
        openModal('search-modal');
    });

    // Generate Outline button - now opens modal with options
    document.getElementById('btn-generate-outline').addEventListener('click', openOutlineModal);

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = btn.dataset.modal;
            closeModal(modalId);
        });
    });

    // Verse insertion
    document.getElementById('btn-insert-verse').addEventListener('click', insertVerseReference);

    // Image insertion
    document.getElementById('btn-insert-image').addEventListener('click', insertImage);

    // Link insertion
    document.getElementById('btn-insert-link').addEventListener('click', insertLink);

    // Q&A Pause insertion
    document.getElementById('btn-insert-qa-pause').addEventListener('click', insertQAPauseMarker);

    // Search functionality
    document.getElementById('btn-find-next').addEventListener('click', findNext);
    document.getElementById('btn-replace').addEventListener('click', replaceOne);
    document.getElementById('btn-replace-all').addEventListener('click', replaceAll);

    // Outline generation
    document.getElementById('btn-start-generation').addEventListener('click', generateAndShowOutline);
    document.getElementById('btn-copy-outline').addEventListener('click', copyOutlineJSON);
    document.getElementById('btn-apply-outline').addEventListener('click', applyOutlineToClass);
    document.getElementById('btn-enhance-outline').addEventListener('click', enhanceCurrentOutline);

    // Outline method radio buttons
    document.querySelectorAll('input[name="outline-method"]').forEach(radio => {
        radio.addEventListener('change', handleOutlineMethodChange);
    });

    // AI Assistant
    document.getElementById('btn-ai-assistant').addEventListener('click', openAIAssistant);
    document.getElementById('btn-ask-ai').addEventListener('click', askAIQuestion);
    document.getElementById('btn-copy-response').addEventListener('click', copyAIResponse);
    
    // AI suggestion buttons
    document.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const question = e.target.dataset.question;
            document.getElementById('ai-question').value = question;
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveDocument();
        }
        // Ctrl+F to search
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            openModal('search-modal');
        }
    });
}

// Handle Toolbar Actions
function handleToolbarAction(action) {
    if (!editor) return;

    const actions = {
        bold: () => editor.chain().focus().toggleBold().run(),
        italic: () => editor.chain().focus().toggleItalic().run(),
        underline: () => editor.chain().focus().toggleUnderline().run(),
        strike: () => editor.chain().focus().toggleStrike().run(),
        bulletList: () => editor.chain().focus().toggleBulletList().run(),
        orderedList: () => editor.chain().focus().toggleOrderedList().run(),
        blockquote: () => editor.chain().focus().toggleBlockquote().run(),
        codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
        horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
        undo: () => editor.chain().focus().undo().run(),
        redo: () => editor.chain().focus().redo().run(),
        verseLink: () => openModal('verse-modal'),
        insertImage: () => openModal('image-modal'),
        insertTable: () => insertTable(),
        insertLink: () => openModal('link-modal'),
        insertQAPause: () => openModal('qa-pause-modal'),
    };

    if (actions[action]) {
        actions[action]();
    }
}

// Insert Bible Verse Reference
function insertVerseReference() {
    const verseInput = document.getElementById('verse-input').value.trim();
    
    if (!verseInput) {
        alert('Please enter a verse reference');
        return;
    }

    // Create a link with special class for verse references
    editor.chain()
        .focus()
        .insertContent(`<a href="#" class="verse-reference" data-verse="${verseInput}">${verseInput}</a> `)
        .run();

    closeModal('verse-modal');
    document.getElementById('verse-input').value = '';
}

// Insert Image
function insertImage() {
    const imageUrl = document.getElementById('image-url').value.trim();
    const imageAlt = document.getElementById('image-alt').value.trim();

    if (!imageUrl) {
        alert('Please enter an image URL or upload an image');
        return;
    }

    editor.chain()
        .focus()
        .setImage({ src: imageUrl, alt: imageAlt || 'Bible Study Image' })
        .run();

    closeModal('image-modal');
    document.getElementById('image-url').value = '';
    document.getElementById('image-alt').value = '';
}

// Insert Link
function insertLink() {
    const linkText = document.getElementById('link-text').value.trim();
    const linkUrl = document.getElementById('link-url').value.trim();

    if (!linkUrl) {
        alert('Please enter a URL');
        return;
    }

    if (linkText) {
        editor.chain()
            .focus()
            .insertContent(`<a href="${linkUrl}">${linkText}</a> `)
            .run();
    } else {
        editor.chain()
            .focus()
            .setLink({ href: linkUrl })
            .run();
    }

    closeModal('link-modal');
    document.getElementById('link-text').value = '';
    document.getElementById('link-url').value = '';
}

// Insert Table
function insertTable() {
    editor.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
}

// Insert Q&A Pause Marker
function insertQAPauseMarker() {
    const sectionSelect = document.getElementById('qa-section-select');
    const selectedOption = sectionSelect.options[sectionSelect.selectedIndex];
    
    const sectionId = selectedOption.value || null;
    const sectionTitle = selectedOption.text !== '-- Generic pause --' 
        ? selectedOption.text 
        : 'Discussion Questions';
    
    editor.chain()
        .focus()
        .insertQAPause({
            sectionId: sectionId,
            sectionTitle: sectionTitle,
        })
        .run();
    
    closeModal('qa-pause-modal');
}

// Modal Functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // Populate Q&A section dropdown if opening that modal
        if (modalId === 'qa-pause-modal') {
            populateQASectionDropdown();
        }
        modal.style.display = 'flex';
    }
}

// Populate the Q&A section dropdown with available sections from the generated outline
function populateQASectionDropdown() {
    const select = document.getElementById('qa-section-select');
    select.innerHTML = '<option value="">-- Generic pause --</option>';
    
    if (generatedOutline && Array.isArray(generatedOutline)) {
        generatedOutline.forEach(section => {
            if (section.questions && section.questions.length > 0) {
                const option = document.createElement('option');
                option.value = section.id;
                option.textContent = section.summary;
                select.appendChild(option);
            }
        });
    }
}

// Automatically inject Q&A pause markers based on outline qa-break points
function injectQAPauseMarkers(outline) {
    if (!outline || !Array.isArray(outline) || !editor) {
        console.log('Cannot inject markers: missing outline or editor');
        return;
    }

    // Get the current document JSON structure
    const docJSON = editor.getJSON();
    
    // Track sections with qa-break points or questions
    const sectionsWithQA = outline.filter(section => {
        const hasQABreak = section.points && section.points.some(point => 
            typeof point === 'object' && point.type === 'qa-break'
        );
        const hasQuestions = section.questions && section.questions.length > 0;
        return hasQABreak || hasQuestions;
    });

    if (sectionsWithQA.length === 0) {
        console.log('No Q&A breaks or questions found in outline');
        return;
    }

    console.log(`Found ${sectionsWithQA.length} sections with Q&A:`, sectionsWithQA.map(s => s.summary));

    // Get all content blocks (paragraphs, headings, etc.)
    const contentBlocks = docJSON.content || [];
    const totalBlocks = contentBlocks.length;
    
    if (totalBlocks === 0) {
        console.log('No content blocks in document');
        return;
    }

    // Strategy: Distribute markers evenly throughout the document
    // This works even if the document doesn't have headings that match the AI outline
    let newContent = [];
    const markerInterval = Math.floor(totalBlocks / (sectionsWithQA.length + 1));
    let currentSectionIdx = 0;
    let blocksSinceLastMarker = 0;

    for (let i = 0; i < contentBlocks.length; i++) {
        const node = contentBlocks[i];
        newContent.push(node);
        blocksSinceLastMarker++;
        
        // Try to find matching heading first (if exists)
        let matchingSection = null;
        if (node.type === 'heading' && node.content) {
            const headingText = node.content.map(n => n.text || '').join('').trim();
            matchingSection = sectionsWithQA.find(section => {
                const summary = section.summary.trim().toLowerCase();
                const heading = headingText.toLowerCase();
                return summary.includes(heading) || heading.includes(summary) || 
                       summary === heading;
            });
            
            if (matchingSection) {
                console.log(`Matched heading "${headingText}" to section "${matchingSection.summary}"`);
            }
        }
        
        // Insert marker after heading match OR at regular intervals
        const shouldInsertMarker = matchingSection || 
            (blocksSinceLastMarker >= markerInterval && 
             currentSectionIdx < sectionsWithQA.length &&
             i < contentBlocks.length - 1);
        
        if (shouldInsertMarker && currentSectionIdx < sectionsWithQA.length) {
            const section = matchingSection || sectionsWithQA[currentSectionIdx];
            
            newContent.push({
                type: 'qaPauseMarker',
                attrs: {
                    sectionId: section.id,
                    sectionTitle: section.summary,
                },
            });
            
            console.log(`Inserted marker for section: ${section.summary}`);
            currentSectionIdx++;
            blocksSinceLastMarker = 0;
        }
    }
    
    // Insert any remaining markers at the end
    while (currentSectionIdx < sectionsWithQA.length) {
        const section = sectionsWithQA[currentSectionIdx];
        newContent.push({
            type: 'qaPauseMarker',
            attrs: {
                sectionId: section.id,
                sectionTitle: section.summary,
            },
        });
        console.log(`Inserted marker at end for section: ${section.summary}`);
        currentSectionIdx++;
    }
    
    // Set the new content with markers
    editor.commands.setContent({ type: 'doc', content: newContent });
    
    console.log(`✓ Successfully injected ${sectionsWithQA.length} Q&A pause markers`);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Search Functions
let searchResults = [];
let currentSearchIndex = 0;

function findNext() {
    const searchTerm = document.getElementById('search-input').value;
    const caseSensitive = document.getElementById('case-sensitive').checked;
    
    if (!searchTerm) {
        alert('Please enter a search term');
        return;
    }

    // Simple implementation - would need enhancement for highlighting
    const content = editor.getText();
    const searchContent = caseSensitive ? content : content.toLowerCase();
    const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    
    const index = searchContent.indexOf(searchFor, currentSearchIndex);
    if (index !== -1) {
        currentSearchIndex = index + 1;
        document.getElementById('search-results').textContent = `Found at position ${index}`;
    } else {
        currentSearchIndex = 0;
        document.getElementById('search-results').textContent = 'No more results found';
    }
}

function replaceOne() {
    const searchTerm = document.getElementById('search-input').value;
    const replaceTerm = document.getElementById('replace-input').value;
    
    if (!searchTerm) {
        alert('Please enter a search term');
        return;
    }

    // This is a simplified version - actual implementation would be more sophisticated
    const html = editor.getHTML();
    const newHtml = html.replace(searchTerm, replaceTerm);
    editor.commands.setContent(newHtml);
    
    document.getElementById('search-results').textContent = 'Replaced 1 occurrence';
}

function replaceAll() {
    const searchTerm = document.getElementById('search-input').value;
    const replaceTerm = document.getElementById('replace-input').value;
    
    if (!searchTerm) {
        alert('Please enter a search term');
        return;
    }

    const html = editor.getHTML();
    const regex = new RegExp(searchTerm, 'g');
    const newHtml = html.replace(regex, replaceTerm);
    const count = (html.match(regex) || []).length;
    
    editor.commands.setContent(newHtml);
    document.getElementById('search-results').textContent = `Replaced ${count} occurrence(s)`;
}

// Update Outline Navigator
function updateOutlineNavigator() {
    const outlineTree = document.getElementById('outline-tree');
    const json = editor.getJSON();
    
    // Extract headings from content
    const headings = [];
    
    function extractHeadings(node, level = 0) {
        if (node.type === 'heading') {
            headings.push({
                level: node.attrs.level,
                text: node.content ? node.content.map(n => n.text || '').join('') : '',
            });
        }
        
        if (node.content) {
            node.content.forEach(child => extractHeadings(child, level + 1));
        }
    }
    
    if (json.content) {
        json.content.forEach(node => extractHeadings(node));
    }
    
    // Build outline HTML
    let outlineHTML = '<ul class="outline-list">';
    headings.forEach((heading, index) => {
        outlineHTML += `
            <li class="outline-item outline-level-${heading.level}">
                <a href="#" data-heading-index="${index}">${heading.text || 'Untitled'}</a>
            </li>
        `;
    });
    outlineHTML += '</ul>';
    
    outlineTree.innerHTML = outlineHTML || '<p class="outline-empty">No headings yet</p>';
    
    // Add click handlers for navigation
    outlineTree.querySelectorAll('[data-heading-index]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const headingIndex = parseInt(link.dataset.headingIndex);
            scrollToHeading(headingIndex);
        });
    });
}

// Helper function to shorten outline text
function shortenText(text, maxLength = 50) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '…';
}

// Helper function to scroll editor to a specific heading
function scrollToHeading(summary) {
    if (!editor || !summary) return;
    
    // Ensure summary is a string
    summary = String(summary).trim();
    
    try {
        // Find heading in the DOM and scroll to it
        const editorElement = document.querySelector('.tiptap');
        if (editorElement) {
            // Look for the heading text in the editor's rendered content
            const headings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (let heading of headings) {
                const headingText = heading.textContent.trim();
                if (headingText === summary || headingText.toLowerCase() === summary.toLowerCase()) {
                    heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    heading.focus();
                    return;
                }
            }
        }
        
        // Fallback: just focus the editor
        editor.commands.focus();
    } catch (e) {
        console.error('Error scrolling to heading:', e);
        editor.commands.focus();
    }
}

function updateOutlineNavigatorFromGenerated(outline) {
    if (!outline || outline.length === 0) return;
    
    const outlineTree = document.getElementById('outline-tree');
    let outlineHTML = '<ul class="outline-list">';
    
    outline.forEach((section, index) => {
        const shortTitle = shortenText(section.summary, 50);
        outlineHTML += `
            <li class="outline-item outline-level-1">
                <a href="#" data-section-summary="${section.summary}" title="${section.summary}">
                    ${shortTitle}
                </a>
            </li>
        `;
    });
    
    outlineHTML += '</ul>';
    outlineTree.innerHTML = outlineHTML;
    
    // Add click handlers for section navigation
    outlineTree.querySelectorAll('a[data-section-summary]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const summary = link.getAttribute('data-section-summary');
            scrollToHeading(summary);
        });
    });
}

// Helper function to extract text from node (reuse from outlineGenerator if available)
function extractText(node) {
    if (!node) return '';
    if (node.text) return node.text;
    if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join(' ');
    }
    return '';
}

// Save Document
async function saveDocument() {
    if (!editor) return;

    updateSaveStatus('Saving...');

    const content = {
        html: editor.getHTML(),
        json: editor.getJSON(),
        text: editor.getText(),
    };

    try {
        if (currentClassId) {
            // Load current classes
            const response = await fetch('assets/data/classes.json');
            const data = await response.json();
            allClasses = data.classes || [];
            
            // Find and update the class (support both id and classNumber)
            const classIndex = allClasses.findIndex(c => c.id === currentClassId || c.classNumber == currentClassId);
            if (classIndex !== -1) {
                allClasses[classIndex].content = content;
                
                // Also save the generated outline if it exists (to separate field)
                if (generatedOutline && generatedOutline.length > 0) {
                    allClasses[classIndex].generatedOutline = generatedOutline;
                }
                
                // Save back to server
                const saveResponse = await fetch('/api/save/classes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classes: allClasses })
                });
                
                if (!saveResponse.ok) {
                    throw new Error('Failed to save');
                }
                
                isDirty = false;
                updateSaveStatus('Saved');
                console.log('Class content saved:', content);
            } else {
                throw new Error('Class not found');
            }
        } else {
            // Fallback to localStorage if no class number
            currentDocument = {
                id: currentDocument?.id || 'general-content',
                title: document.getElementById('document-title').textContent,
                content: content,
                generatedOutline: generatedOutline || [],
                lastModified: new Date().toISOString(),
            };
            localStorage.setItem('bible-study-content', JSON.stringify(currentDocument));
            isDirty = false;
            updateSaveStatus('Saved');
        }
    } catch (error) {
        console.error('Save failed:', error);
        updateSaveStatus('Save failed: ' + error.message);
    }
}

// Auto-save functionality
function startAutoSave() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    autoSaveTimer = setTimeout(() => {
        if (isDirty) {
            saveDocument();
        }
    }, 300000); // Auto-save after 5 minutes
}

// Update Save Status
function updateSaveStatus(status) {
    const statusEl = document.getElementById('save-status');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = 'save-status';
        
        if (status === 'Saved') {
            statusEl.classList.add('saved');
        } else if (status === 'Saving...') {
            statusEl.classList.add('saving');
        } else if (status === 'Modified') {
            statusEl.classList.add('modified');
        } else if (status.includes('failed')) {
            statusEl.classList.add('error');
        }
    }
}

// Load Document
async function loadDocument() {
    try {
        if (currentClassId) {
            // Load class data
            const response = await fetch('assets/data/classes.json');
            const data = await response.json();
            allClasses = data.classes || [];
            
            // Find class by id or classNumber (backward compatibility)
            const cls = allClasses.find(c => c.id === currentClassId || c.classNumber == currentClassId);
            if (cls) {
                // Update document title
                document.getElementById('document-title').textContent = cls.title || 'Class Content';
                
                // Load content
                if (cls.content && (cls.content.json || cls.content.html)) {
                    editor.commands.setContent(cls.content.json || cls.content.html);
                } else {
                    // No content yet, show a starter template
                    editor.commands.setContent(getStarterTemplate(cls));
                }
            } else {
                editor.commands.setContent('<p>Class not found. Creating new content...</p>');
            }
        } else {
            // No class ID - load from localStorage or show sample
            const saved = localStorage.getItem('bible-study-content');
            
            if (saved) {
                currentDocument = JSON.parse(saved);
                editor.commands.setContent(currentDocument.content.json || currentDocument.content.html);
            } else {
                editor.commands.setContent(getSampleContent());
            }
        }

        updateOutlineNavigator();
        updateSaveStatus('Saved');
    } catch (error) {
        console.error('Load failed:', error);
        editor.commands.setContent('<p>Failed to load content. Start editing here...</p>');
    }
}

// Get Sample Content (from existing markdown)
function getSampleContent() {
    return `
        <h1>How do we trust scripture?</h1>
        
        <h2>1. What warning is repeated across these passages?</h2>
        
        <p>Pay attention to the language of adding, taking away, commands, words, and authority.</p>
        
        <h3>Proverbs 30:5–6 NKJV</h3>
        
        <blockquote>
            <p><em>Every word of God is pure;</em></p>
            <p><em>He is a shield to those who put their trust in Him.</em></p>
            <p><em>Do not add to His words,</em></p>
            <p><em>Lest He rebuke you, and you be found a liar.</em></p>
        </blockquote>
        
        <h3>A — Every word of God is pure</h3>
        
        <p>The words that we have are correct and accurate, they are truth. Too many times in our culture in order to tear down Scripture people will pull out verses, they will take them out of context and accuse God of being unloving, unjust, or contradictory - but anytime they do this, when we are properly prepared, we can put the verse back into context and show the purity of the word in all cases.</p>
        
        <p>God's Word is not something that will break under pressure - God invites doubt and intense study because <strong>truth is not afraid of the light</strong>.</p>
        
        <h4>Examples:</h4>
        
        <p><strong>Verse: Elisha and the Bears (2 Kings 2:23-25)</strong></p>
        
        <h5>2 Kings 2:23–25 NKJV</h5>
        
        <blockquote>
            <p>Then he went up from there to Bethel; and as he was going up the road, some youths came from the city and mocked him, and said to him, "Go up, you baldhead! Go up, you baldhead!"</p>
            <p>So he turned around and looked at them, and pronounced a curse on them in the name of the Lord. And two female bears came out of the woods and mauled forty-two of the youths.</p>
            <p>Then he went from there to Mount Carmel, and from there he returned to Samaria.</p>
        </blockquote>
        
        <p><strong>Criticism:</strong> 42 children were mauled by God just because they made fun of this prophet for being bald - that doesn't seem like a very forgiving thing to do...</p>
    `;
}

// Get Starter Template for a class
function getStarterTemplate(cls) {
    return `
        <h1>${cls.title || 'Class Title'}</h1>
        
        <h2>${cls.subtitle || 'Subtitle'}</h2>
        
        <p>Welcome to this Bible study class. Begin creating your lesson content here.</p>
        
        <h3>Key Topics</h3>
        <ul>
            <li>Topic 1</li>
            <li>Topic 2</li>
            <li>Topic 3</li>
        </ul>
        
        <h3>Discussion Questions</h3>
        <ol>
            <li>Question 1?</li>
            <li>Question 2?</li>
        </ol>
        
        <p>Start adding your content using the toolbar above. You can format text, add Bible references, images, and more!</p>
    `;
}

// Show Preview
function showPreview() {
    const previewWindow = window.open('', 'Preview', 'width=800,height=600');
    previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Preview</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1, h2, h3, h4, h5, h6 { color: #333; }
                blockquote { border-left: 4px solid #ccc; padding-left: 16px; color: #666; }
                .verse-reference { color: #1976d2; text-decoration: none; font-weight: bold; }
            </style>
        </head>
        <body>
            ${editor.getHTML()}
        </body>
        </html>
    `);
}

// View Teacher - Navigate to teacher view for current class
function viewTeacher() {
    if (!currentClassId) {
        alert('No class selected. Please open this editor from a specific class.');
        return;
    }
    window.open(`teacher.html?class=${currentClassId}`, 'TeacherView', 'width=1200,height=800');
}

// Open Outline Modal - checks LLM availability and opens modal
async function openOutlineModal() {
    openModal('outline-modal');
    
    // Check LLM availability
    const statusDiv = document.getElementById('llm-status');
    try {
        const llmAvailable = await checkOllamaAvailability();
        
        if (llmAvailable) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#d4edda';
            statusDiv.style.color = '#155724';
            statusDiv.style.border = '1px solid #c3e6cb';
            statusDiv.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> Ollama is running and ready';
            
            // Try to get installed models
            try {
                const models = await getInstalledModels();
                if (models && models.length > 0) {
                    const select = document.getElementById('llm-model-select');
                    select.innerHTML = models.map(m => 
                        `<option value="${m.name}">${m.name} (${(m.size / 1e9).toFixed(1)}GB)</option>`
                    ).join('');
                }
            } catch (e) {
                console.warn('Could not get installed models:', e);
            }
        } else {
            statusDiv.style.display = 'none';
            // Auto-select standard method if LLM not available
            document.querySelector('input[name="outline-method"][value="standard"]').checked = true;
            handleOutlineMethodChange();
        }
    } catch (error) {
        console.warn('LLM check failed:', error);
    }
}

// Handle outline generation method change
function handleOutlineMethodChange() {
    const selectedMethod = document.querySelector('input[name="outline-method"]:checked').value;
    const llmOptions = document.getElementById('llm-options');
    const llmStatus = document.getElementById('llm-status');
    const enhanceBtn = document.getElementById('btn-enhance-outline');
    
    if (selectedMethod === 'llm') {
        llmOptions.style.display = 'block';
        if (llmStatus.textContent.includes('not running')) {
            llmStatus.style.display = 'block';
        }
        // Show enhance button when using standard method (can enhance later)
        enhanceBtn.style.display = 'none';
    } else {
        llmOptions.style.display = 'none';
        // Show enhance button after standard generation
        if (generatedOutline && generatedOutline.length > 0) {
            enhanceBtn.style.display = 'inline-block';
        }
    }
}

// Generate outline (either standard or LLM-based)
async function generateAndShowOutline() {
    const selectedMethod = document.querySelector('input[name="outline-method"]:checked').value;
    const useAI = selectedMethod === 'llm';
    
    const startBtn = document.getElementById('btn-start-generation');
    const previewDiv = document.getElementById('outline-preview');
    
    // Show loading state
    startBtn.disabled = true;
    startBtn.textContent = useAI ? 'Generating with AI...' : 'Generating...';
    previewDiv.innerHTML = `
        <div style="text-align: center; padding: 60px; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">hourglass_bottom</span></div>
            <div style="font-size: 16px; margin-bottom: 8px;">${useAI ? 'AI is analyzing your content...' : 'Parsing content structure...'}</div>
            <div style="font-size: 13px;">${useAI ? 'This may take 1-3 minutes (first run is slower)' : 'This should be quick'}</div>
            ${useAI ? '<div style="font-size: 12px; margin-top: 12px; color: var(--text-muted);">💡 Tip: Try "Phi-3" model for faster results</div>' : ''}
        </div>
    `;
    
    try {
        let options = {};
        if (useAI) {
            const selectedModel = document.getElementById('llm-model-select').value;
            options = { model: selectedModel };
        }
        
        // Generate outline using the selected method
        generatedOutline = await generateOutline(editor, useAI, options);
        
        if (!generatedOutline || generatedOutline.length === 0) {
            if (useAI) {
                throw new Error('Could not generate outline from content. Please add more text (at least a few paragraphs).');
            } else {
                throw new Error('No headings found in document. For standard generation, use headings (H1-H6). Or try AI-Enhanced mode which works with any content.');
            }
        }

        // Format and display
        const html = formatOutlineHTML(generatedOutline);
        previewDiv.innerHTML = html;
        
        // Enable action buttons
        document.getElementById('btn-copy-outline').disabled = false;
        document.getElementById('btn-apply-outline').disabled = false;
        
        // Show enhance button if standard method was used
        if (!useAI) {
            document.getElementById('btn-enhance-outline').style.display = 'inline-block';
            document.getElementById('btn-enhance-outline').disabled = false;
        }
        
        // Update outline navigator with generated structure
        updateOutlineNavigatorFromGenerated(generatedOutline);
        
        // Automatically inject Q&A pause markers where the AI identified qa-breaks
        if (useAI) {
            injectQAPauseMarkers(generatedOutline);
        }
        
        console.log('Generated outline:', generatedOutline);
        
        // Success feedback
        startBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Generated Successfully';
        setTimeout(() => {
            startBtn.textContent = 'Generate Outline';
            startBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Outline generation failed:', error);
        
        let errorMsg = error.message || 'Unknown error occurred';
        let suggestions = '';
        
        // Provide helpful error messages
        if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
            suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong>⏱️ The AI is taking longer than expected</strong>
                    <div style="margin-top: 8px; font-size: 13px;">
                        <p style="margin: 8px 0;">This can happen when:</p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Your content is very long (try with shorter content first)</li>
                            <li>The model is still loading into memory (first run is slower)</li>
                            <li>Your computer is using CPU instead of GPU</li>
                        </ul>
                        <p style="margin: 12px 0 4px 0;"><strong>Try these solutions:</strong></p>
                        <ul style="margin: 4px 0; padding-left: 20px;">
                            <li>Use a faster model: Select "Phi-3 (Fastest)" from the dropdown</li>
                            <li>Reduce your content to 1-2 pages of text</li>
                            <li>Wait a minute and try again (model might still be loading)</li>
                            <li>Use "Standard" mode instead (instant, no AI needed)</li>
                        </ul>
                    </div>
                </div>
            `;
        } else if (errorMsg.includes('Ollama') || errorMsg.includes('Not Found') || errorMsg.includes('404')) {
            suggestions = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
                    <strong>💡 To use AI generation:</strong>
                    <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px;">
                        <li>Download Ollama from <a href="https://ollama.ai" target="_blank" style="color: #0066cc;">ollama.ai</a></li>
                        <li>Install and start it (should auto-start)</li>
                        <li>Open PowerShell and run: <code style="background: #000; color: #0f0; padding: 2px 6px; border-radius: 3px;">ollama pull llama3.1</code></li>
                        <li>Wait for download to complete (~4.7GB)</li>
                        <li>Reload this page and try again</li>
                    </ol>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffc107;">
                        <strong>Or use Standard generation:</strong><br>
                        <span style="font-size: 13px;">Switch to "Standard" mode above - works instantly without AI (requires headings in your document)</span>
                    </div>
                </div>
            `;
        }
        
        previewDiv.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">warning</span></div>
                <div style="font-size: 16px; margin-bottom: 8px; color: var(--danger);"><strong>AI Generation Failed</strong></div>
                <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">${errorMsg}</div>
                ${suggestions}
            </div>
        `;
        
        startBtn.textContent = 'Try Again';
        startBtn.disabled = false;
    }
}

// Enhance existing outline with AI
async function enhanceCurrentOutline() {
    if (!generatedOutline || generatedOutline.length === 0) {
        alert('No outline to enhance');
        return;
    }
    
    const enhanceBtn = document.getElementById('btn-enhance-outline');
    const previewDiv = document.getElementById('outline-preview');
    
    try {
        // Check if Ollama is available
        const isAvailable = await checkOllamaAvailability();
        if (!isAvailable) {
            alert('Ollama is not running. Please start Ollama to use AI enhancement.');
            return;
        }
        
        enhanceBtn.disabled = true;
        enhanceBtn.textContent = 'Enhancing...';
        
        const enhanced = await enhanceOutlineWithLLM(generatedOutline, editor);
        generatedOutline = enhanced;
        
        // Update display
        const html = formatOutlineHTML(generatedOutline);
        previewDiv.innerHTML = html;
        
        // Inject Q&A markers after enhancement
        injectQAPauseMarkers(generatedOutline);
        
        enhanceBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">check_circle</span>Enhanced';
        setTimeout(() => {
            enhanceBtn.textContent = 'Enhance with AI';
            enhanceBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Enhancement failed:', error);
        alert('Failed to enhance outline: ' + error.message);
        enhanceBtn.textContent = 'Enhance with AI';
        enhanceBtn.disabled = false;
    }
}

// Copy outline JSON to clipboard
async function copyOutlineJSON() {
    if (!generatedOutline) {
        alert('No outline generated yet');
        return;
    }

    try {
        const json = exportOutlineJSON(generatedOutline);
        await navigator.clipboard.writeText(json);
        
        // Visual feedback
        const btn = document.getElementById('btn-copy-outline');
        const originalText = btn.textContent;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">done</span>Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    } catch (error) {
        console.error('Copy failed:', error);
        // Fallback: show in a textarea for manual copy
        const textarea = document.createElement('textarea');
        textarea.value = exportOutlineJSON(generatedOutline);
        textarea.style.cssText = 'position: fixed; top: 50%; left: 50%; width: 80%; height: 300px; z-index: 10000;';
        document.body.appendChild(textarea);
        textarea.select();
        alert('Select all and copy the JSON below');
    }
}

// Apply outline to the current class
async function applyOutlineToClass() {
    if (!generatedOutline) {
        alert('No outline generated yet');
        return;
    }

    if (!currentClassId) {
        alert('No class selected. Open this editor from a specific class to apply the outline.');
        return;
    }

    try {
        // Load current classes
        const response = await fetch('assets/data/classes.json');
        const data = await response.json();
        allClasses = data.classes || [];
        
        // Find and update the class (support both id and classNumber)
        const classIndex = allClasses.findIndex(c => c.id === currentClassId || c.classNumber == currentClassId);
        if (classIndex !== -1) {
            // Save to generatedOutline field (for viewing in teacher tab)
            allClasses[classIndex].generatedOutline = generatedOutline;
            
            // Also save to outline field (this replaces the guide with the generated outline)
            allClasses[classIndex].outline = generatedOutline;
            
            // Save back to server
            const saveResponse = await fetch('/api/save/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classes: allClasses })
            });
            
            if (!saveResponse.ok) {
                throw new Error('Failed to save');
            }
            
            // Update the outline navigator to reflect new structure
            updateOutlineNavigatorFromGenerated(generatedOutline);
            
            alert('Outline applied to class successfully!');
            closeModal('outline-modal');
            console.log('Applied outline:', generatedOutline);
        } else {
            throw new Error('Class not found');
        }
    } catch (error) {
        console.error('Apply outline failed:', error);
        alert('Failed to apply outline: ' + error.message);
    }
}

// AI Assistant Functions
async function openAIAssistant() {
    openModal('ai-assistant-modal');
    
    // Check AI availability
    const statusDiv = document.getElementById('ai-status');
    try {
        const aiAvailable = await checkOllamaAvailability();
        
        if (aiAvailable) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#d4edda';
            statusDiv.style.color = '#155724';
            statusDiv.style.border = '1px solid #c3e6cb';
            statusDiv.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">check_circle</span> AI is ready to help!';
        } else {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.style.border = '1px solid #ffc107';
            statusDiv.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">warning</span> Ollama is not running. Please start Ollama to use AI features.';
        }
    } catch (error) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#f8d7da';
        statusDiv.style.color = '#721c24';
        statusDiv.style.border = '1px solid #f5c6cb';
        statusDiv.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">error</span> Could not connect to AI service.';
    }
}

async function askAIQuestion() {
    const questionInput = document.getElementById('ai-question');
    const question = questionInput.value.trim();
    
    if (!question) {
        alert('Please enter a question');
        return;
    }
    
    const askBtn = document.getElementById('btn-ask-ai');
    const responseContainer = document.getElementById('ai-response-container');
    const responseDiv = document.getElementById('ai-response');
    
    // Show loading state
    askBtn.disabled = true;
    askBtn.innerHTML = '<span class="material-symbols-outlined rotating" style="vertical-align: middle; font-size: 18px;">progress_activity</span> Thinking...';
    responseContainer.style.display = 'block';
    responseDiv.innerHTML = '<em style="color: #666;">AI is analyzing your content...</em>';
    
    try {
        // Check if AI is available
        const aiAvailable = await checkOllamaAvailability();
        if (!aiAvailable) {
            throw new Error('AI service is not available. Please ensure Ollama is running.');
        }
        
        // Get editor content
        const editorText = editor.getText();
        const editorHTML = editor.getHTML();
        
        if (!editorText || editorText.trim().length < 10) {
            throw new Error('Please add some content to your document before asking questions.');
        }
        
        // Build context-aware prompt
        const systemPrompt = `You are a helpful Bible study curriculum assistant. The user is creating Bible study content and needs your expertise.

Here is the content they are working on:

${editorText}

Please answer their question thoughtfully, considering the content they've created. Provide practical, actionable suggestions that would enhance their Bible study lesson.`;
        
        // Generate AI response
        const response = await generateCompletion(question, {
            system: systemPrompt,
            temperature: 0.7,
            model: 'llama3.1'
        });
        
        // Display response
        responseDiv.innerHTML = response || 'No response received from AI.';
        
    } catch (error) {
        console.error('AI question failed:', error);
        responseDiv.innerHTML = `<span style="color: #721c24;">❌ Error: ${error.message}</span>`;
    } finally {
        // Reset button
        askBtn.disabled = false;
        askBtn.innerHTML = '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">send</span> Ask AI';
    }
}

async function copyAIResponse() {
    const responseDiv = document.getElementById('ai-response');
    const text = responseDiv.textContent;
    
    try {
        await navigator.clipboard.writeText(text);
        
        const copyBtn = document.getElementById('btn-copy-response');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">check</span> Copied!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.background = '';
        }, 2000);
    } catch (error) {
        alert('Failed to copy: ' + error.message);
    }
}

// Export for debugging
window.editor = editor;
