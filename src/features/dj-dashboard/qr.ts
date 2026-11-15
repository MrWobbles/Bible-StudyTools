export function initQrModal(): void {
  const showQrBtn = document.getElementById('showQrBtn');
  const qrModal = document.getElementById('qrModal');
  const closeQrBtn = document.getElementById('closeQrBtn');
  const qrcodeContainer = document.getElementById('qrcode');
  const qrUrlEl = document.getElementById('qrUrl');

  let qrGenerated = false;

  showQrBtn?.addEventListener('click', () => {
    qrModal?.classList.remove('hidden');

    if (!qrGenerated) {
      const protocol = window.location.protocol;
      const host = window.location.host;
      const fullUrl = `${protocol}//${host}/requests`;

      if (qrUrlEl) qrUrlEl.textContent = fullUrl;
      if (qrcodeContainer) qrcodeContainer.innerHTML = '';

      QRCode.toCanvas(
        fullUrl,
        {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        },
        (err: Error | null, canvas: HTMLCanvasElement) => {
          if (!qrcodeContainer) return;
          if (err) {
            qrcodeContainer.innerHTML = '<span style="color:red">Failed to generate QR</span>';
            console.error(err);
          } else {
            qrcodeContainer.appendChild(canvas);
            qrGenerated = true;
          }
        }
      );
    }
  });

  closeQrBtn?.addEventListener('click', () => {
    qrModal?.classList.add('hidden');
  });

  qrModal?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === qrModal) {
      qrModal.classList.add('hidden');
    }
  });
}
