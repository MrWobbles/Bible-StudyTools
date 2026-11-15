function e(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`):``}function t(t,n){t&&(t.innerHTML=!n||n.length===0?`<div style="padding:1rem;">No results found.</div>`:n.map(t=>`
            <div class="track-item" onclick='selectTrackForRequest(${JSON.stringify(t).replace(/'/g,`&apos;`)})'>
                <img class="track-art" src="${t.thumbnail||`/assets/images/icon.png`}" alt="Art" onerror="this.src='/assets/images/icon.png'">
                <div class="track-info">
                    <div class="track-title">${e(t.title)}</div>
                    <div class="track-artist">${e(t.artist)}</div>
                </div>
                <button class="btn btn-secondary btn-icon"><i class="fas fa-plus"></i></button>
            </div>
        `).join(``))}function n(t,n){t&&(t.innerHTML=!n||n.length===0?`<div class="loading">No quick picks available.</div>`:n.map(t=>`
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${e(t.title)}</div>
                    <div class="track-artist">${e(t.artist)}</div>
                </div>
                <button class="btn btn-secondary" onclick='selectTrackForRequest(${JSON.stringify(t).replace(/'/g,`&apos;`)}, true)'>
                    Request
                </button>
            </div>
        `).join(``))}function r(t,n,r){if(!t)return;let i=n.filter(e=>e.status===`approved`).sort((e,t)=>(t.votes||0)-(e.votes||0));t.innerHTML=i.length===0?`<div class="loading">Queue is currently empty. Be the first to request!</div>`:i.map(t=>{let n=r.includes(t.id);return`
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${e(t.title)}</div>
                    <div class="track-artist">${e(t.artist)}</div>
                    ${t.requestedBy?`<div class="track-meta">Req by: ${e(t.requestedBy)}</div>`:``}
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="vote-count">${t.votes||0}</span>
                    <button class="btn btn-icon vote-btn ${n?`voted`:``}" 
                            onclick="upvoteTrack('${t.id}')" 
                            ${n?`disabled`:``}>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                </div>
            </div>
        `}).join(``)}function i(e,t){return e instanceof Error&&e.message?e.message:t}function a({searchInput:t,searchResults:n,showToast:r,fetchQueue:a}){let o=document.getElementById(`requestModal`),s=document.getElementById(`closeModalBtn`),c=document.getElementById(`requestForm`),l=document.getElementById(`selectedTrackDisplay`),u=null;window.selectTrackForRequest=(r,i=!1)=>{u={...r,isPreApproved:i},n?.classList.add(`hidden`),t instanceof HTMLInputElement&&(t.value=``),l&&(l.innerHTML=`
            <div class="track-item" style="border: none; padding: 0;">
                ${r.thumbnail?`<img class="track-art" src="${r.thumbnail}" alt="Art">`:``}
                <div class="track-info">
                    <div class="track-title">${e(r.title)}</div>
                    <div class="track-artist">${e(r.artist)}</div>
                    ${i?`<div class="track-meta"><i class="fas fa-check-circle"></i> DJ Approved</div>`:``}
                </div>
            </div>
        `);let a=localStorage.getItem(`djGuestName`),s=document.getElementById(`guestName`);a&&s instanceof HTMLInputElement&&(s.value=a),o?.classList.remove(`hidden`)},s?.addEventListener(`click`,()=>{o?.classList.add(`hidden`)}),c?.addEventListener(`submit`,async e=>{e.preventDefault();let t=document.getElementById(`guestName`),n=document.getElementById(`dedication`),s=t instanceof HTMLInputElement?t.value.trim():``,l=n instanceof HTMLInputElement||n instanceof HTMLTextAreaElement?n.value.trim():``;if(!u||!s)return;localStorage.setItem(`djGuestName`,s);let d={id:u.id,title:u.title,artist:u.artist,url:u.url,requestedBy:s,dedication:l,status:u.isPreApproved?`approved`:`pending`},f=c.querySelector(`button[type="submit"]`);f&&(f.disabled=!0,f.textContent=`Sending...`);try{if(!(await fetch(`/api/dj/request`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(d)})).ok)throw Error(`Failed to submit request`);r(u.isPreApproved?`Song added to queue!`:`Request sent to DJ!`,`success`),o?.classList.add(`hidden`),c instanceof HTMLFormElement&&c.reset(),a()}catch(e){r(i(e,`Failed to submit request`),`error`)}finally{f&&(f.disabled=!1,f.textContent=`Send to DJ`)}})}function o(e,t){return e instanceof Error&&e.message?e.message:t}document.addEventListener(`DOMContentLoaded`,()=>{let i=document.getElementById(`preApprovedList`),s=document.getElementById(`queueList`),c=document.getElementById(`searchInput`),l=document.getElementById(`searchResults`),u=document.getElementById(`toast`),d,f=[];try{let e=JSON.parse(localStorage.getItem(`djVotedSongs`)||`[]`);Array.isArray(e)&&(f=e.map(String))}catch{f=[]}function p(e,t=`success`){u&&(u.textContent=e,u.className=`toast ${t}`,setTimeout(()=>{u.classList.add(`hidden`)},3e3))}async function m(n){if(l)try{l.innerHTML=`<div class="loading">Searching...</div>`,l.classList.remove(`hidden`);let e=await fetch(`/api/music/search?q=${encodeURIComponent(n)}`),r=await e.json();if(!e.ok)throw Error(r.error||`Search failed`);t(l,r.results)}catch(t){l.innerHTML=`<div style="padding:1rem;color:red;">Error: ${e(o(t,`Search failed`))}</div>`}}async function h(){try{let e=await(await fetch(`/api/dj/pre-approved`)).json();n(i,e)}catch{i&&(i.innerHTML=`<div class="loading">Error loading list</div>`)}}async function g(){try{let e=await(await fetch(`/api/dj/queue`)).json();r(s,e,f)}catch{s&&(s.innerHTML=`<div class="loading">Error loading queue</div>`)}}h(),g();let _=document.getElementById(`quickPicksHeader`),v=document.getElementById(`quickPicksContent`);_?.classList.add(`collapsed`),_?.addEventListener(`click`,()=>{_.classList.contains(`collapsed`)?(_.classList.remove(`collapsed`),v?.classList.remove(`hidden`)):(_.classList.add(`collapsed`),v?.classList.add(`hidden`))}),setInterval(()=>{g()},15e3),c?.addEventListener(`input`,e=>{d!==void 0&&clearTimeout(d);let t=e.target instanceof HTMLInputElement?e.target.value.trim():``;t.length<2?l?.classList.add(`hidden`):d=setTimeout(()=>{m(t)},400)}),document.addEventListener(`click`,e=>{let t=e.target instanceof Node?e.target:null;c&&l&&t&&!c.contains(t)&&!l.contains(t)&&l.classList.add(`hidden`)}),window.upvoteTrack=async e=>{if(!f.includes(e))try{if(!(await fetch(`/api/dj/queue/${e}/upvote`,{method:`POST`})).ok)throw Error(`Failed to upvote`);f.push(e),localStorage.setItem(`djVotedSongs`,JSON.stringify(f)),p(`Vote added!`,`success`),g()}catch(e){p(o(e,`Failed to upvote`),`error`)}},a({searchInput:c,searchResults:l,showToast:p,fetchQueue:g})});