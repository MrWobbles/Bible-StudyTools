// Outline Generator for Bible Study Content
// Analyzes TipTap editor content and generates hierarchical outline with Bible verse detection

/**
 * Bible verse reference patterns
 * Matches formats like: John 3:16, Romans 5:1-8, 1 Corinthians 13, 2 Kings 2:23-25
 */
const BIBLE_BOOKS = [
    // Old Testament
    'Genesis', 'Gen', 'Exodus', 'Ex', 'Exo', 'Leviticus', 'Lev', 'Numbers', 'Num', 'Deuteronomy', 'Deut', 'Deu',
    'Joshua', 'Josh', 'Judges', 'Judg', 'Ruth', 'Samuel', 'Sam', 'Kings', 'Chronicles', 'Chron', 'Chr',
    'Ezra', 'Nehemiah', 'Neh', 'Esther', 'Est', 'Job', 'Psalm', 'Psalms', 'Ps', 'Proverbs', 'Prov', 'Pro',
    'Ecclesiastes', 'Eccles', 'Ecc', 'Song of Solomon', 'Song', 'Isaiah', 'Isa', 'Jeremiah', 'Jer',
    'Lamentations', 'Lam', 'Ezekiel', 'Ezek', 'Eze', 'Daniel', 'Dan', 'Hosea', 'Hos', 'Joel', 'Amos',
    'Obadiah', 'Obad', 'Jonah', 'Jon', 'Micah', 'Mic', 'Nahum', 'Nah', 'Habakkuk', 'Hab', 'Zephaniah', 'Zeph',
    'Haggai', 'Hag', 'Zechariah', 'Zech', 'Zec', 'Malachi', 'Mal',
    
    // New Testament
    'Matthew', 'Matt', 'Mat', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'Rom',
    'Corinthians', 'Cor', 'Galatians', 'Gal', 'Ephesians', 'Eph', 'Philippians', 'Phil',
    'Colossians', 'Col', 'Thessalonians', 'Thess', 'Thes', 'Timothy', 'Tim', 'Titus', 'Tit',
    'Philemon', 'Philem', 'Hebrews', 'Heb', 'James', 'Jam', 'Jas', 'Peter', 'Pet',
    'Jude', 'Revelation', 'Rev'
];

// Create regex pattern for Bible references
const VERSE_PATTERN = new RegExp(
    `\\b(\\d\\s+)?(${BIBLE_BOOKS.join('|')})\\s+\\d+(?::\\d+)?(?:[–-]\\d+(?::\\d+)?)?`,
    'gi'
);

/**
 * Extract Bible verse references from text
 * @param {string} text - Text to search
 * @returns {Array<string>} - Array of unique verse references
 */
function extractVerseReferences(text) {
    const matches = text.match(VERSE_PATTERN) || [];
    // Remove duplicates and clean up
    return [...new Set(matches.map(ref => ref.trim()))];
}

/**
 * Generate a unique ID from text
 * @param {string} text - Text to convert to ID
 * @returns {string} - Kebab-case ID
 */
function generateId(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
}

/**
 * Extract text content from TipTap node
 * @param {object} node - TipTap node
 * @returns {string} - Plain text content
 */
function extractText(node) {
    if (!node) return '';
    
    if (node.text) return node.text;
    
    if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join(' ');
    }
    
    return '';
}

/**
 * Parse TipTap JSON content into outline sections
 * @param {object} editorContent - TipTap editor JSON
 * @returns {Array} - Outline sections
 */
function parseEditorToOutline(editorContent) {
    if (!editorContent || !editorContent.content) {
        return [];
    }

    const outline = [];
    const nodes = editorContent.content;
    let currentSection = null;
    let currentPoints = [];
    let allVerses = [];

    nodes.forEach((node, index) => {
        const nodeType = node.type;
        const text = extractText(node).trim();
        
        if (!text) return;

        // Detect headings (H1-H6) as new sections
        if (nodeType === 'heading') {
            // Save previous section if exists
            if (currentSection) {
                currentSection.points = currentPoints;
                currentSection.verses = [...new Set(allVerses)];
                outline.push(currentSection);
            }

            // Start new section
            currentSection = {
                id: generateId(text),
                summary: text,
                defaultOpen: index === 0, // First section open by default
                points: [],
                verses: [],
                questions: []
            };
            currentPoints = [];
            allVerses = [];
            
        } else if (currentSection) {
            // Add content to current section
            
            // Extract Bible verses from any text
            const verses = extractVerseReferences(text);
            if (verses.length > 0) {
                allVerses.push(...verses);
            }

            // Bullet and numbered lists become points
            if (nodeType === 'bulletList' || nodeType === 'orderedList') {
                if (node.content && Array.isArray(node.content)) {
                    node.content.forEach(listItem => {
                        const itemText = extractText(listItem).trim();
                        if (itemText) {
                            currentPoints.push(itemText);
                            
                            // Also check for verses in list items
                            const itemVerses = extractVerseReferences(itemText);
                            if (itemVerses.length > 0) {
                                allVerses.push(...itemVerses);
                            }
                        }
                    });
                }
            }
            // Paragraphs with question marks might be questions
            else if (nodeType === 'paragraph' && text.includes('?')) {
                currentSection.questions.push({
                    key: generateId(text),
                    prompt: text,
                    answer: ''
                });
            }
            // Other paragraphs become points
            else if (nodeType === 'paragraph') {
                if (text.length > 10) { // Ignore very short paragraphs
                    currentPoints.push(text);
                }
            }
            // Blockquotes are special - often scripture
            else if (nodeType === 'blockquote') {
                const quoteText = extractText(node);
                currentPoints.push(`"${quoteText}"`);
                
                const quoteVerses = extractVerseReferences(quoteText);
                if (quoteVerses.length > 0) {
                    allVerses.push(...quoteVerses);
                }
            }
        }
    });

    // Save last section
    if (currentSection) {
        currentSection.points = currentPoints;
        currentSection.verses = [...new Set(allVerses)];
        outline.push(currentSection);
    }

    return outline;
}

/**
 * Generate outline from TipTap editor
 * @param {object} editor - TipTap editor instance
 * @returns {Array} - Generated outline sections
 */
function generateOutlineFromEditor(editor) {
    if (!editor) {
        throw new Error('Editor instance is required');
    }

    const content = editor.getJSON();
    return parseEditorToOutline(content);
}

/**
 * Format outline for display
 * @param {Array} outline - Outline sections
 * @returns {string} - HTML formatted outline
 */
function formatOutlineHTML(outline) {
    if (!outline || outline.length === 0) {
        return '<p style="color: var(--text-muted);">No outline generated. Add headings and content to your document.</p>';
    }

    let html = '<div class="generated-outline">';
    
    outline.forEach((section, index) => {
        html += `
            <div class="outline-section" data-section-index="${index}">
                <div class="outline-section-header">
                    <h3>${section.summary}</h3>
                    <span class="outline-section-id">${section.id}</span>
                </div>
                
                ${section.points.length > 0 ? `
                    <div class="outline-points">
                        <strong>Key Points:</strong>
                        <ul>
                            ${section.points.map(point => `<li>${point}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${section.verses.length > 0 ? `
                    <div class="outline-verses">
                        <strong>Bible References:</strong>
                        <div class="verse-tags">
                            ${section.verses.map(verse => `<span class="verse-tag">${verse}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${section.questions.length > 0 ? `
                    <div class="outline-questions">
                        <strong>Discussion Questions:</strong>
                        <ol>
                            ${section.questions.map(q => `<li>${q.prompt}</li>`).join('')}
                        </ol>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Export outline to JSON format (for saving to class)
 * @param {Array} outline - Outline sections
 * @returns {string} - JSON string
 */
function exportOutlineJSON(outline) {
    return JSON.stringify(outline, null, 2);
}

/**
 * Generate outline using LLM (if available)
 * @param {object} editor - TipTap editor instance
 * @param {object} options - Generation options
 * @returns {Promise<Array>} - Generated outline sections
 */
async function generateOutlineWithLLM(editor, options = {}) {
    if (!editor) {
        throw new Error('Editor instance is required');
    }

    // Check if LLM service is available
    if (typeof checkOllamaAvailability !== 'function') {
        throw new Error('LLM service not loaded. Please include llmService.js');
    }

    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
        throw new Error('Ollama is not running. Please start Ollama and try again.');
    }

    // Get editor content - try HTML first for better formatting, fallback to text
    let content = editor.getHTML();
    
    // Strip HTML tags for plain text analysis
    const div = document.createElement('div');
    div.innerHTML = content;
    const plainText = div.textContent || div.innerText || '';
    
    if (!plainText || plainText.trim().length < 50) {
        throw new Error('Content is too short for analysis. Please add at least a few sentences.');
    }

    try {
        // Use plain text for LLM analysis (cleaner for AI)
        const outline = await generateOutlineStructure(plainText.trim(), options);
        
        if (!outline || outline.length === 0) {
            throw new Error('LLM returned empty outline');
        }

        return outline;
    } catch (error) {
        console.error('LLM outline generation failed:', error);
        throw error;
    }
}

/**
 * Generate outline with choice between LLM or standard parser
 * @param {object} editor - TipTap editor instance
 * @param {boolean} useLLM - Whether to use LLM (true) or standard parser (false)
 * @param {object} options - Additional options for LLM
 * @returns {Promise<Array>} - Generated outline sections
 */
async function generateOutline(editor, useLLM = false, options = {}) {
    if (useLLM) {
        return await generateOutlineWithLLM(editor, options);
    } else {
        return generateOutlineFromEditor(editor);
    }
}

/**
 * Enhance existing outline using LLM
 * @param {Array} outline - Existing outline to enhance
 * @param {object} editor - TipTap editor instance (for content reference)
 * @returns {Promise<Array>} - Enhanced outline
 */
async function enhanceOutlineWithLLM(outline, editor) {
    if (!editor) {
        throw new Error('Editor instance is required');
    }

    if (typeof checkOllamaAvailability !== 'function') {
        throw new Error('LLM service not loaded');
    }

    const isAvailable = await checkOllamaAvailability();
    if (!isAvailable) {
        throw new Error('Ollama is not running');
    }

    const content = editor.getText();
    return await enhanceOutline(outline, content);
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateOutlineFromEditor,
        parseEditorToOutline,
        extractVerseReferences,
        formatOutlineHTML,
        exportOutlineJSON,
        generateOutlineWithLLM,
        generateOutline,
        enhanceOutlineWithLLM
    };
} else {
    // Browser environment - expose to window
    window.generateOutlineFromEditor = generateOutlineFromEditor;
    window.parseEditorToOutline = parseEditorToOutline;
    window.extractVerseReferences = extractVerseReferences;
    window.formatOutlineHTML = formatOutlineHTML;
    window.exportOutlineJSON = exportOutlineJSON;
    window.generateOutlineWithLLM = generateOutlineWithLLM;
    window.generateOutline = generateOutline;
    window.enhanceOutlineWithLLM = enhanceOutlineWithLLM;
}
