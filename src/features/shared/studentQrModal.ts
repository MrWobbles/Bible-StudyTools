import QRCode from 'qrcode';

export interface StudentQrModalOptions {
  classId: string;
  onShowOnScreen?: (studentUrl: string) => void;
}

const MODAL_ID = 'student-qr-share-modal';

export function buildStudentScreenUrl(classId: string): string {
  return `${window.location.origin}/student.html?class=${encodeURIComponent(classId || '1')}`;
}

export async function openStudentQrModal(options: StudentQrModalOptions): Promise<void> {
  const studentUrl = buildStudentScreenUrl(options.classId);

  let modal = document.getElementById(MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'student-qr-modal-title');
    modal.style.cssText =
      'position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);';

    modal.innerHTML = `
      <div style="width:min(460px,100%);background:var(--surface,#161b22);color:var(--text,#f0f6fc);border:1px solid var(--border,rgba(255,255,255,0.14));border-radius:16px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,0.45);display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <h2 id="student-qr-modal-title" style="margin:0;font-size:1.25rem;font-weight:700;">Share Student Screen</h2>
          <button type="button" id="student-qr-close-btn" aria-label="Close" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:inherit;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button>
        </div>
        <p style="margin:0;font-size:0.92rem;opacity:0.85;line-height:1.45;">
          YouTube viewers can scan this QR code on their phone, click directly over it on desktop, or open the link from your video description.
        </p>
        <a id="student-qr-clickable-link" href="#" target="_blank" rel="noopener noreferrer" title="Click to open Student Screen" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:center;padding:14px;background:#fff;border-radius:14px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,0.25);">
          <img id="student-qr-image" alt="QR code to open the student screen" style="display:block;width:240px;height:240px;border-radius:6px;" />
          <span style="margin-top:8px;padding:4px 12px;border-radius:999px;background:#0f172a;color:#fff;font-size:0.78rem;font-weight:600;letter-spacing:0.01em;">Click QR to Open Student Screen &nearr;</span>
        </a>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label for="student-qr-url-input" style="font-size:0.8rem;font-weight:600;opacity:0.8;">Link for YouTube Description</label>
          <div style="display:flex;gap:8px;">
            <input id="student-qr-url-input" type="text" readonly style="flex:1;min-width:0;padding:9px 12px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.18));background:rgba(0,0,0,0.25);color:inherit;font-size:0.86rem;" />
            <button type="button" id="student-qr-copy-btn" style="padding:9px 14px;border-radius:8px;border:1px solid var(--accent,#f0b429);background:var(--accent,#f0b429);color:#111;font-weight:700;cursor:pointer;white-space:nowrap;">Copy Link</button>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <a id="student-qr-download-btn" download="student-screen-qr.png" href="#" style="padding:9px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.2));color:inherit;text-decoration:none;font-size:0.88rem;font-weight:600;">Download QR PNG</a>
          <button type="button" id="student-qr-show-on-screen-btn" style="padding:9px 14px;border-radius:8px;border:none;background:var(--brand,#3b82f6);color:#fff;font-weight:700;cursor:pointer;font-size:0.88rem;display:none;">Show on Student Screen</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal?.style.setProperty('display', 'none');
    };

    modal.querySelector('#student-qr-close-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e: MouseEvent) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closeModal();
      }
    });

    const urlInput = modal.querySelector('#student-qr-url-input') as HTMLInputElement | null;
    urlInput?.addEventListener('click', () => urlInput.select());

    const copyBtn = modal.querySelector('#student-qr-copy-btn') as HTMLButtonElement | null;
    copyBtn?.addEventListener('click', async () => {
      const value = urlInput?.value || '';
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        copyBtn.textContent = 'Copied!';
        window.setTimeout(() => {
          copyBtn.textContent = 'Copy Link';
        }, 2000);
      } catch {
        urlInput?.select();
      }
    });
  }

  modal.style.display = 'flex';

  const linkEl = modal.querySelector('#student-qr-clickable-link') as HTMLAnchorElement | null;
  if (linkEl) linkEl.href = studentUrl;

  const urlInput = modal.querySelector('#student-qr-url-input') as HTMLInputElement | null;
  if (urlInput) urlInput.value = studentUrl;

  const imgEl = modal.querySelector('#student-qr-image') as HTMLImageElement | null;
  const downloadBtn = modal.querySelector('#student-qr-download-btn') as HTMLAnchorElement | null;
  try {
    const dataUrl = await QRCode.toDataURL(studentUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    if (imgEl) imgEl.src = dataUrl;
    if (downloadBtn) {
      downloadBtn.href = dataUrl;
      downloadBtn.download = `student-screen-class-${options.classId || '1'}-qr.png`;
    }
  } catch (err) {
    console.error('[QR] Failed to generate QR code:', err);
  }

  const showBtn = modal.querySelector('#student-qr-show-on-screen-btn') as HTMLButtonElement | null;
  if (showBtn) {
    if (options.onShowOnScreen) {
      showBtn.style.display = 'inline-block';
      showBtn.onclick = () => {
        options.onShowOnScreen?.(studentUrl);
        modal?.style.setProperty('display', 'none');
      };
    } else {
      showBtn.style.display = 'none';
      showBtn.onclick = null;
    }
  }
}
