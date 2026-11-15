// LLM Service for Bible Study Application
// Integrates with local Ollama instance for AI-powered features
(function () {
  const LLM_CONFIG: LlmConfig = {
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

  function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function stripMarkdownCodeFence(text: string): string {
    let trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/```json?\n?/g, '').replace(/```\s*$/g, '');
    }
    return trimmed;
  }

  /**
   * Check if Ollama is running and accessible.
   */
  async function checkOllamaAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${LLM_CONFIG.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error: unknown) {
      console.warn('Ollama not available:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Get list of installed models from Ollama.
   */
  async function getInstalledModels(): Promise<unknown[]> {
    try {
      const response = await fetch(`${LLM_CONFIG.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as { models?: unknown[] };
      return data.models || [];
    } catch (error: unknown) {
      console.error('Failed to get installed models:', error);
      return [];
    }
  }

  /**
   * Generate text completion using Ollama.
   */
  async function generateCompletion(prompt: string, options: LlmGenerateOptions = {}): Promise<string> {
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

      const data = (await response.json()) as { response?: string };
      return data.response || '';
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM request timed out');
      }
      throw error;
    }
  }

  /**
   * Generate structured Bible study outline using LLM.
   */
  async function generateOutlineStructure(content: string, options: LlmGenerateOptions = {}): Promise<OutlineSection[]> {
    const systemPrompt = `You are a Bible study curriculum expert. Analyze the provided content and generate a structured outline suitable for a Bible study class. 

The content may be unstructured text, paragraphs, notes, or bullet points. Your job is to organize it into logical sections.

IMPORTANT: When you identify a section that would benefit from Q&A discussion with the class guide, add a special point with type "qa-break" to mark where the teacher should pause for discussion questions.

Your response MUST be valid JSON in this exact format:
[
  {
    "id": "kebab-case-id",
    "summary": "Brief section summary",
    "defaultOpen": true,
    "points": [
      {"type": "point", "text": "Key point 1"},
      {"type": "point", "text": "Key point 2"},
      {"type": "qa-break", "text": "Pause for Q&A - See class guide"}
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
- Create any number of logical sections based on the content themes
- Each section should have a clear, descriptive summary
- Extract or infer key points as objects with type "point" and text
- Add type "qa-break" points where discussion would enhance learning (after major concepts, before transitions, etc.)
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
        temperature: 0.5
      });

      let parsed: unknown;
      try {
        let jsonText = stripMarkdownCodeFence(response);
        const firstBracket = jsonText.indexOf('[');
        const lastBracket = jsonText.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          jsonText = jsonText.substring(firstBracket, lastBracket + 1);
        }

        parsed = JSON.parse(jsonText);
      } catch (parseError: unknown) {
        console.error('Failed to parse LLM response as JSON:', parseError);
        console.error('Response was:', response);
        throw new Error('LLM returned invalid JSON. Try again or use standard outline generation.');
      }

      if (!Array.isArray(parsed)) {
        throw new Error('LLM response is not an array');
      }

      return parsed.map((rawSection): OutlineSection => {
        const section = (rawSection && typeof rawSection === 'object' ? rawSection : {}) as Partial<OutlineSection>;
        return {
          id: section.id || 'untitled-section',
          summary: section.summary || 'Untitled Section',
          defaultOpen: Boolean(section.defaultOpen),
          points: Array.isArray(section.points) ? section.points : [],
          verses: Array.isArray(section.verses) ? section.verses : [],
          questions: Array.isArray(section.questions) ? section.questions : []
        };
      });
    } catch (error: unknown) {
      console.error('LLM outline generation failed:', error);
      throw error;
    }
  }

  /**
   * Enhance existing outline with LLM suggestions.
   */
  async function enhanceOutline(existingOutline: OutlineSection[], content: string): Promise<OutlineSection[]> {
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

      const enhanced = stripMarkdownCodeFence(response);
      const parsed: unknown = JSON.parse(enhanced);
      return Array.isArray(parsed) ? (parsed as OutlineSection[]) : existingOutline;
    } catch (error: unknown) {
      console.error('Outline enhancement failed:', error);
      return existingOutline;
    }
  }

  /**
   * Generate discussion questions for a specific topic.
   */
  async function generateQuestions(topic: string, count = 3): Promise<OutlineQuestion[]> {
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

      const questions = stripMarkdownCodeFence(response);
      const parsed: unknown = JSON.parse(questions);
      return Array.isArray(parsed) ? (parsed as OutlineQuestion[]) : [];
    } catch (error: unknown) {
      console.error('Question generation failed:', error);
      return [];
    }
  }

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
    window.checkOllamaAvailability = checkOllamaAvailability;
    window.getInstalledModels = getInstalledModels;
    window.generateCompletion = generateCompletion;
    window.generateOutlineStructure = generateOutlineStructure;
    window.enhanceOutline = enhanceOutline;
    window.generateQuestions = generateQuestions;
    window.LLM_CONFIG = LLM_CONFIG;
  }
})();
