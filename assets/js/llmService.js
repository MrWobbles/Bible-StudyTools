var BSTLlmServiceBundle=(function(){return((e,t)=>()=>(t||(e((t={exports:{}}).exports,t,t.exports),e=null),t.exports))(((e,t)=>{(function(){let e={baseUrl:`http://localhost:11434`,defaultModel:`llama3.1`,timeout:18e4,availableModels:[{id:`llama3.1`,name:`Llama 3.1`,size:`4.7GB`},{id:`mistral`,name:`Mistral`,size:`4.1GB`},{id:`phi3`,name:`Phi-3`,size:`2.3GB`},{id:`gemma2`,name:`Gemma 2`,size:`5.4GB`}]};function n(e){return e instanceof Error?e.message:String(e)}function r(e){let t=e.trim();return t.startsWith("```")&&(t=t.replace(/```json?\n?/g,``).replace(/```\s*$/g,``)),t}async function i(){try{return(await fetch(`${e.baseUrl}/api/tags`,{method:`GET`,signal:AbortSignal.timeout(5e3)})).ok}catch(e){return console.warn(`Ollama not available:`,n(e)),!1}}async function a(){try{let t=await fetch(`${e.baseUrl}/api/tags`);return t.ok&&(await t.json()).models||[]}catch(e){return console.error(`Failed to get installed models:`,e),[]}}async function o(t,n={}){let{model:r=e.defaultModel,temperature:i=.7,stream:a=!1,system:o=null}=n;try{let n=new AbortController,s=setTimeout(()=>n.abort(),e.timeout),c=await fetch(`${e.baseUrl}/api/generate`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({model:r,prompt:t,system:o,stream:a,options:{temperature:i}}),signal:n.signal});if(clearTimeout(s),!c.ok)throw Error(`LLM request failed: ${c.statusText}`);return(await c.json()).response||``}catch(e){throw e instanceof Error&&e.name===`AbortError`?Error(`LLM request timed out`):e}}async function s(e,t={}){let n=`Analyze this Bible study content and generate a structured outline:\n\n${e}`;try{let e=await o(n,{...t,system:`You are a Bible study curriculum expert. Analyze the provided content and generate a structured outline suitable for a Bible study class. 

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
- Return ONLY the JSON array, no additional text or markdown`,temperature:.5}),i;try{let t=r(e),n=t.indexOf(`[`),a=t.lastIndexOf(`]`);n!==-1&&a!==-1&&a>n&&(t=t.substring(n,a+1)),i=JSON.parse(t)}catch(t){throw console.error(`Failed to parse LLM response as JSON:`,t),console.error(`Response was:`,e),Error(`LLM returned invalid JSON. Try again or use standard outline generation.`)}if(!Array.isArray(i))throw Error(`LLM response is not an array`);return i.map(e=>{let t=e&&typeof e==`object`?e:{};return{id:t.id||`untitled-section`,summary:t.summary||`Untitled Section`,defaultOpen:!!t.defaultOpen,points:Array.isArray(t.points)?t.points:[],verses:Array.isArray(t.verses)?t.verses:[],questions:Array.isArray(t.questions)?t.questions:[]}})}catch(e){throw console.error(`LLM outline generation failed:`,e),e}}async function c(e,t){let n=`Content:\n${t}\n\nCurrent Outline:\n${JSON.stringify(e,null,2)}\n\nEnhance this outline:`;try{let t=r(await o(n,{system:`You are a Bible study curriculum expert. Enhance the provided outline by:
- Adding insightful discussion questions
- Identifying additional Bible verse references
- Suggesting key theological points
- Improving section summaries

Return the enhanced outline in the same JSON format as provided.`,temperature:.6})),i=JSON.parse(t);return Array.isArray(i)?i:e}catch(t){return console.error(`Outline enhancement failed:`,t),e}}async function l(e,t=3){let n=`Generate ${t} thoughtful discussion questions for a Bible study on: ${e}

Return as JSON array in this format:
[
  {
    "key": "question-id",
    "prompt": "The question text?",
    "answer": ""
  }
]`;try{let e=r(await o(n,{temperature:.8})),t=JSON.parse(e);return Array.isArray(t)?t:[]}catch(e){return console.error(`Question generation failed:`,e),[]}}t!==void 0&&t.exports?t.exports={checkOllamaAvailability:i,getInstalledModels:a,generateCompletion:o,generateOutlineStructure:s,enhanceOutline:c,generateQuestions:l,LLM_CONFIG:e}:(window.checkOllamaAvailability=i,window.getInstalledModels=a,window.generateCompletion=o,window.generateOutlineStructure=s,window.enhanceOutline=c,window.generateQuestions=l,window.LLM_CONFIG=e)})()}))()})();