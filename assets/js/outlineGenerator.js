var BSTOutlineGeneratorBundle=(function(){var e=(e,t,n)=>()=>{if(n)throw n[0];try{return e&&(t=e(e=0)),t}catch(e){throw n=[e],e}},t=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t,t.exports),e=null),t.exports);function n(e){let t=e.match(l)||[];return[...new Set(t.map(e=>e.trim()))]}function r(e){return e.toLowerCase().replace(/[^\w\s-]/g,``).replace(/\s+/g,`-`).substring(0,50)}function i(e){return e?e.text?e.text:e.content&&Array.isArray(e.content)?e.content.map(i).join(` `):``:``}function a(e){if(!e||!e.content)return[];let t=[],a=e.content,o=null,s=[],c=[];if(a.forEach((e,a)=>{let l=e.type,u=i(e).trim();if(u){if(l===`heading`)o&&(o.points=s,o.verses=[...new Set(c)],t.push(o)),o={id:r(u),summary:u,defaultOpen:a===0,points:[],verses:[],questions:[]},s=[],c=[];else if(o){let t=n(u);if(t.length>0&&c.push(...t),l===`bulletList`||l===`orderedList`)e.content&&Array.isArray(e.content)&&e.content.forEach(e=>{let t=i(e).trim();if(t){s.push(t);let e=n(t);e.length>0&&c.push(...e)}});else if(l===`paragraph`&&u.includes(`?`))o.questions.push({key:r(u),prompt:u,answer:``});else if(l===`paragraph`)u.length>10&&s.push(u);else if(l===`blockquote`){let t=i(e);s.push(`"${t}"`);let r=n(t);r.length>0&&c.push(...r)}}}}),o!==null){let e=o;e.points=s,e.verses=[...new Set(c)],t.push(e)}return t}function o(e){if(!e)throw Error(`Editor instance is required`);return a(e.getJSON())}function s(e){if(!e||e.length===0)return`<p style="color: var(--text-muted);">No outline generated. Add headings and content to your document.</p>`;let t=`<div class="generated-outline">`;return e.forEach((e,n)=>{t+=`
            <div class="outline-section" data-section-index="${n}">
                <div class="outline-section-header">
                    <h3>${e.summary}</h3>
                    <span class="outline-section-id">${e.id}</span>
                </div>
                
                ${e.points.length>0?`
                    <div class="outline-points">
                        <strong>Key Points:</strong>
                        <ul>
                            ${e.points.map(e=>`<li>${typeof e==`object`?e.text:e}</li>`).join(``)}
                        </ul>
                    </div>
                `:``}
                
                ${e.verses.length>0?`
                    <div class="outline-verses">
                        <strong>Bible References:</strong>
                        <div class="verse-tags">
                            ${e.verses.map(e=>`<span class="verse-tag">${e}</span>`).join(``)}
                        </div>
                    </div>
                `:``}
                
                ${e.questions.length>0?`
                    <div class="outline-questions">
                        <strong>Discussion Questions:</strong>
                        <ol>
                            ${e.questions.map(e=>`<li>${e.prompt}</li>`).join(``)}
                        </ol>
                    </div>
                `:``}
            </div>
        `}),t+=`</div>`,t}function c(e){return JSON.stringify(e,null,2)}var l,u=e((()=>{l=RegExp(`\\b(\\d\\s+)?(${`Genesis.Gen.Exodus.Ex.Exo.Leviticus.Lev.Numbers.Num.Deuteronomy.Deut.Deu.Joshua.Josh.Judges.Judg.Ruth.Samuel.Sam.Kings.Chronicles.Chron.Chr.Ezra.Nehemiah.Neh.Esther.Est.Job.Psalm.Psalms.Ps.Proverbs.Prov.Pro.Ecclesiastes.Eccles.Ecc.Song of Solomon.Song.Isaiah.Isa.Jeremiah.Jer.Lamentations.Lam.Ezekiel.Ezek.Eze.Daniel.Dan.Hosea.Hos.Joel.Amos.Obadiah.Obad.Jonah.Jon.Micah.Mic.Nahum.Nah.Habakkuk.Hab.Zephaniah.Zeph.Haggai.Hag.Zechariah.Zech.Zec.Malachi.Mal.Matthew.Matt.Mat.Mark.Luke.John.Acts.Romans.Rom.Corinthians.Cor.Galatians.Gal.Ephesians.Eph.Philippians.Phil.Colossians.Col.Thessalonians.Thess.Thes.Timothy.Tim.Titus.Tit.Philemon.Philem.Hebrews.Heb.James.Jam.Jas.Peter.Pet.Jude.Revelation.Rev`.split(`.`).join(`|`)})\\s+\\d+(?::\\d+)?(?:[–-]\\d+(?::\\d+)?)?`,`gi`)}));async function d(e,t={}){if(!e)throw Error(`Editor instance is required`);let n=window.checkOllamaAvailability,r=window.generateOutlineStructure;if(typeof n!=`function`||typeof r!=`function`)throw Error(`LLM service not loaded. Please include llmService.js`);if(!await n())throw Error(`AI service is not available. Configure AI_API_KEY on the server or start local Ollama.`);let i=e.getHTML(),a=document.createElement(`div`);a.innerHTML=i;let o=a.textContent||a.innerText||``;if(!o||o.trim().length<50)throw Error(`Content is too short for analysis. Please add at least a few sentences.`);try{let e=await r(o.trim(),t);if(!e||e.length===0)throw Error(`LLM returned empty outline`);return e}catch(e){throw console.error(`LLM outline generation failed:`,e),e}}async function f(e,t=!1,n={}){return t?await d(e,n):o(e)}async function p(e,t){if(!t)throw Error(`Editor instance is required`);let n=window.checkOllamaAvailability,r=window.enhanceOutline;if(typeof n!=`function`||typeof r!=`function`)throw Error(`LLM service not loaded`);if(!await n())throw Error(`AI service is not available`);return await r(e,t.getText())}var m=e((()=>{u()}));return t(((e,t)=>{m(),u();var r={generateOutlineFromEditor:o,parseEditorToOutline:a,extractVerseReferences:n,formatOutlineHTML:s,exportOutlineJSON:c,generateOutlineWithLLM:d,generateOutline:f,enhanceOutlineWithLLM:p};typeof window<`u`&&(window.generateOutlineFromEditor=o,window.parseEditorToOutline=a,window.extractVerseReferences=n,window.formatOutlineHTML=s,window.exportOutlineJSON=c,window.generateOutlineWithLLM=d,window.generateOutline=f,window.enhanceOutlineWithLLM=p),t!==void 0&&t.exports&&(t.exports=r)}))()})();