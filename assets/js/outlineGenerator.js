"use strict";
// Outline Generator for Bible Study Content
// Analyzes TipTap editor content and generates hierarchical outline with Bible verse detection
(function () {
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
    const VERSE_PATTERN = new RegExp(`\\b(\\d\\s+)?(${BIBLE_BOOKS.join('|')})\\s+\\d+(?::\\d+)?(?:[–-]\\d+(?::\\d+)?)?`, 'gi');
    function extractVerseReferences(text) {
        const matches = text.match(VERSE_PATTERN) || [];
        return [...new Set(matches.map((ref) => ref.trim()))];
    }
    function generateId(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);
    }
    function extractText(node) {
        if (!node)
            return '';
        if (node.text)
            return node.text;
        if (node.content && Array.isArray(node.content)) {
            return node.content.map(extractText).join(' ');
        }
        return '';
    }
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
            if (!text)
                return;
            if (nodeType === 'heading') {
                if (currentSection) {
                    currentSection.points = currentPoints;
                    currentSection.verses = [...new Set(allVerses)];
                    outline.push(currentSection);
                }
                currentSection = {
                    id: generateId(text),
                    summary: text,
                    defaultOpen: index === 0,
                    points: [],
                    verses: [],
                    questions: []
                };
                currentPoints = [];
                allVerses = [];
            }
            else if (currentSection) {
                const verses = extractVerseReferences(text);
                if (verses.length > 0) {
                    allVerses.push(...verses);
                }
                if (nodeType === 'bulletList' || nodeType === 'orderedList') {
                    if (node.content && Array.isArray(node.content)) {
                        node.content.forEach((listItem) => {
                            const itemText = extractText(listItem).trim();
                            if (itemText) {
                                currentPoints.push(itemText);
                                const itemVerses = extractVerseReferences(itemText);
                                if (itemVerses.length > 0) {
                                    allVerses.push(...itemVerses);
                                }
                            }
                        });
                    }
                }
                else if (nodeType === 'paragraph' && text.includes('?')) {
                    currentSection.questions.push({
                        key: generateId(text),
                        prompt: text,
                        answer: ''
                    });
                }
                else if (nodeType === 'paragraph') {
                    if (text.length > 10) {
                        currentPoints.push(text);
                    }
                }
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
        if (currentSection !== null) {
            const finalSection = currentSection;
            finalSection.points = currentPoints;
            finalSection.verses = [...new Set(allVerses)];
            outline.push(finalSection);
        }
        return outline;
    }
    function generateOutlineFromEditor(editor) {
        if (!editor) {
            throw new Error('Editor instance is required');
        }
        const content = editor.getJSON();
        return parseEditorToOutline(content);
    }
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
                            ${section.points
                .map((point) => {
                const text = typeof point === 'object' ? point.text : point;
                return `<li>${text}</li>`;
            })
                .join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${section.verses.length > 0 ? `
                    <div class="outline-verses">
                        <strong>Bible References:</strong>
                        <div class="verse-tags">
                            ${section.verses.map((verse) => `<span class="verse-tag">${verse}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${section.questions.length > 0 ? `
                    <div class="outline-questions">
                        <strong>Discussion Questions:</strong>
                        <ol>
                            ${section.questions.map((q) => `<li>${q.prompt}</li>`).join('')}
                        </ol>
                    </div>
                ` : ''}
            </div>
        `;
        });
        html += '</div>';
        return html;
    }
    function exportOutlineJSON(outline) {
        return JSON.stringify(outline, null, 2);
    }
    async function generateOutlineWithLLM(editor, options = {}) {
        if (!editor) {
            throw new Error('Editor instance is required');
        }
        const checkFn = typeof checkOllamaAvailability === 'function'
            ? checkOllamaAvailability
            : window.checkOllamaAvailability;
        const generateFn = typeof generateOutlineStructure === 'function'
            ? generateOutlineStructure
            : window.generateOutlineStructure;
        if (typeof checkFn !== 'function' || typeof generateFn !== 'function') {
            throw new Error('LLM service not loaded. Please include llmService.js');
        }
        const isAvailable = await checkFn();
        if (!isAvailable) {
            throw new Error('Ollama is not running. Please start Ollama and try again.');
        }
        const content = editor.getHTML();
        const div = document.createElement('div');
        div.innerHTML = content;
        const plainText = div.textContent || div.innerText || '';
        if (!plainText || plainText.trim().length < 50) {
            throw new Error('Content is too short for analysis. Please add at least a few sentences.');
        }
        try {
            const outline = await generateFn(plainText.trim(), options);
            if (!outline || outline.length === 0) {
                throw new Error('LLM returned empty outline');
            }
            return outline;
        }
        catch (error) {
            console.error('LLM outline generation failed:', error);
            throw error;
        }
    }
    async function generateOutline(editor, useLLM = false, options = {}) {
        if (useLLM) {
            return await generateOutlineWithLLM(editor, options);
        }
        return generateOutlineFromEditor(editor);
    }
    async function enhanceOutlineWithLLM(outline, editor) {
        if (!editor) {
            throw new Error('Editor instance is required');
        }
        const checkFn = typeof checkOllamaAvailability === 'function'
            ? checkOllamaAvailability
            : window.checkOllamaAvailability;
        const enhanceFn = typeof enhanceOutline === 'function'
            ? enhanceOutline
            : window.enhanceOutline;
        if (typeof checkFn !== 'function' || typeof enhanceFn !== 'function') {
            throw new Error('LLM service not loaded');
        }
        const isAvailable = await checkFn();
        if (!isAvailable) {
            throw new Error('Ollama is not running');
        }
        const content = editor.getText();
        return await enhanceFn(outline, content);
    }
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
    }
    else {
        window.generateOutlineFromEditor = generateOutlineFromEditor;
        window.parseEditorToOutline = parseEditorToOutline;
        window.extractVerseReferences = extractVerseReferences;
        window.formatOutlineHTML = formatOutlineHTML;
        window.exportOutlineJSON = exportOutlineJSON;
        window.generateOutlineWithLLM = generateOutlineWithLLM;
        window.generateOutline = generateOutline;
        window.enhanceOutlineWithLLM = enhanceOutlineWithLLM;
    }
})();
