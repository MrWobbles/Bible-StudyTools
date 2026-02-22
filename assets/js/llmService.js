// LLM Service for Bible Study Application
// Integrates with local Ollama instance for AI-powered features

/**
 * Configuration for LLM service
 */
const LLM_CONFIG = {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    timeout: 180000, // 180 seconds (3 minutes)
    availableModels: [
        { id: 'llama3.1', name: 'Llama 3.1', size: '4.7GB' },
        { id: 'mistral', name: 'Mistral', size: '4.1GB' },
        { id: 'phi3', name: 'Phi-3', size: '2.3GB' },
        { id: 'gemma2', name: 'Gemma 2', size: '5.4GB' }
    ]
};

/**
 * Check if Ollama is running and accessible
 * @returns {Promise<boolean>} - True if Ollama is available
 */
async function checkOllamaAvailability() {
    try {
        const response = await fetch(`${LLM_CONFIG.baseUrl}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        return response.ok;
    } catch (error) {
        console.warn('Ollama not available:', error.message);
        return false;
    }
}

/**
 * Get list of installed models from Ollama
 * @returns {Promise<Array>} - Array of model objects
 */
async function getInstalledModels() {
    try {
        const response = await fetch(`${LLM_CONFIG.baseUrl}/api/tags`);
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.models || [];
    } catch (error) {
        console.error('Failed to get installed models:', error);
        return [];
    }
}

/**
 * Generate text completion using Ollama
 * @param {string} prompt - The prompt to send to the LLM
 * @param {object} options - Generation options
 * @returns {Promise<string>} - Generated text response
 */
async function generateCompletion(prompt, options = {}) {
    const {
        model = LLM_CONFIG.defaultModel,
        temperature = 0.7,
        stream = false,
        system = null
    } = options;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LLM_CONFIG.timeout);

        const response = await fetch(`${LLM_CONFIG.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                prompt,
                system,
                stream,
                options: {
                    temperature
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('LLM request timed out');
        }
        throw error;
    }
}

/**
 * Generate structured Bible study outline using LLM
 * @param {string} content - The lesson content to analyze
 * @param {object} options - Generation options
 * @returns {Promise<Array>} - Array of outline sections
 */
async function generateOutlineStructure(content, options = {}) {
    const systemPrompt = `You are a Bible study curriculum expert. Analyze the provided content and generate a structured outline suitable for a Bible study class. 

The content may be unstructured text, paragraphs, notes, or bullet points. Your job is to organize it into logical sections.

Your response MUST be valid JSON in this exact format:
[
  {
    "id": "kebab-case-id",
    "summary": "Brief section summary",
    "defaultOpen": true,
    "points": [
      "Key point 1",
      "Key point 2"
    ],
    "verses": [
      "John 3:16",
      "Romans 5:8"
    ],
    "questions": [
      {
        "key": "question-id",
        "prompt": "Discussion question?",
        "answer": ""
      }
    ]
  }
]

Guidelines:
- Create 3-7 logical sections based on the content themes
- Each section should have a clear, descriptive summary
- Extract or infer key points as bullet items
- Identify any Bible verse references mentioned or relevant to the topic
- Generate 2-4 thoughtful discussion questions per section
- Use descriptive, lowercase-with-hyphens IDs based on section content
- Mark the first section as defaultOpen: true
- If content is sparse, create fewer but complete sections
- Return ONLY the JSON array, no additional text or markdown`;

    const userPrompt = `Analyze this Bible study content and generate a structured outline:\n\n${content}`;

    try {
        const response = await generateCompletion(userPrompt, {
            ...options,
            system: systemPrompt,
            temperature: 0.5 // Lower temperature for more consistent JSON
        });

        // Try to parse the JSON response
        let outline;
        try {
            // Remove markdown code blocks if present
            let jsonText = response.trim();
            
            // Remove markdown code blocks
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\s*$/g, '');
            }
            
            // Find JSON array - look for first [ and last ]
            const firstBracket = jsonText.indexOf('[');
            const lastBracket = jsonText.lastIndexOf(']');
            
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                jsonText = jsonText.substring(firstBracket, lastBracket + 1);
            }
            
            outline = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('Failed to parse LLM response as JSON:', parseError);
            console.error('Response was:', response);
            throw new Error('LLM returned invalid JSON. Try again or use standard outline generation.');
        }

        // Validate the structure
        if (!Array.isArray(outline)) {
            throw new Error('LLM response is not an array');
        }

        // Ensure each section has required fields
        outline = outline.map(section => ({
            id: section.id || 'untitled-section',
            summary: section.summary || 'Untitled Section',
            defaultOpen: section.defaultOpen || false,
            points: Array.isArray(section.points) ? section.points : [],
            verses: Array.isArray(section.verses) ? section.verses : [],
            questions: Array.isArray(section.questions) ? section.questions : []
        }));

        return outline;
    } catch (error) {
        console.error('LLM outline generation failed:', error);
        throw error;
    }
}

/**
 * Enhance existing outline with LLM suggestions
 * @param {Array} existingOutline - Current outline structure
 * @param {string} content - Original content
 * @returns {Promise<Array>} - Enhanced outline
 */
async function enhanceOutline(existingOutline, content) {
    const systemPrompt = `You are a Bible study curriculum expert. Enhance the provided outline by:
- Adding insightful discussion questions
- Identifying additional Bible verse references
- Suggesting key theological points
- Improving section summaries

Return the enhanced outline in the same JSON format as provided.`;

    const userPrompt = `Content:\n${content}\n\nCurrent Outline:\n${JSON.stringify(existingOutline, null, 2)}\n\nEnhance this outline:`;

    try {
        const response = await generateCompletion(userPrompt, {
            system: systemPrompt,
            temperature: 0.6
        });

        let enhanced = response.trim();
        if (enhanced.startsWith('```')) {
            enhanced = enhanced.replace(/```json?\n?/g, '').replace(/```\s*$/g, '');
        }

        return JSON.parse(enhanced);
    } catch (error) {
        console.error('Outline enhancement failed:', error);
        // Return original outline if enhancement fails
        return existingOutline;
    }
}

/**
 * Generate discussion questions for a specific topic
 * @param {string} topic - Topic or passage to generate questions for
 * @param {number} count - Number of questions to generate
 * @returns {Promise<Array>} - Array of question objects
 */
async function generateQuestions(topic, count = 3) {
    const prompt = `Generate ${count} thoughtful discussion questions for a Bible study on: ${topic}

Return as JSON array in this format:
[
  {
    "key": "question-id",
    "prompt": "The question text?",
    "answer": ""
  }
]`;

    try {
        const response = await generateCompletion(prompt, {
            temperature: 0.8
        });

        let questions = response.trim();
        if (questions.startsWith('```')) {
            questions = questions.replace(/```json?\n?/g, '').replace(/```\s*$/g, '');
        }

        return JSON.parse(questions);
    } catch (error) {
        console.error('Question generation failed:', error);
        return [];
    }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkOllamaAvailability,
        getInstalledModels,
        generateCompletion,
        generateOutlineStructure,
        enhanceOutline,
        generateQuestions,
        LLM_CONFIG
    };
} else {
    // Browser environment - expose to window
    window.checkOllamaAvailability = checkOllamaAvailability;
    window.getInstalledModels = getInstalledModels;
    window.generateCompletion = generateCompletion;
    window.generateOutlineStructure = generateOutlineStructure;
    window.enhanceOutline = enhanceOutline;
    window.generateQuestions = generateQuestions;
    window.LLM_CONFIG = LLM_CONFIG;
}
