export function buildOutlineLoadingHtml(useAI: boolean): string {
  return `
    <div style="text-align: center; padding: 60px; color: var(--text-muted);">
      <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">hourglass_bottom</span></div>
      <div style="font-size: 16px; margin-bottom: 8px;">${useAI ? 'AI is analyzing your content...' : 'Parsing content structure...'}</div>
      <div style="font-size: 13px;">${useAI ? 'This may take 1-3 minutes (first run is slower)' : 'This should be quick'}</div>
      ${useAI ? '<div style="font-size: 12px; margin-top: 12px; color: var(--text-muted);"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">lightbulb</span> Tip: Try "Phi-3" model for faster results</div>' : ''}
    </div>
  `;
}

export function buildOutlineErrorHtml(errorMsg: string): string {
  let suggestions = '';

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
  } else if (
    errorMsg.includes('Ollama') ||
    errorMsg.includes('Not Found') ||
    errorMsg.includes('404')
  ) {
    suggestions = `
      <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 6px; margin-top: 16px; text-align: left;">
        <strong><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom;">lightbulb</span> To use AI generation:</strong>
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

  return `
    <div style="text-align: center; padding: 40px;">
      <div style="font-size: 48px; margin-bottom: 16px;"><span class="material-symbols-outlined" style="font-size: 48px;">warning</span></div>
      <div style="font-size: 16px; margin-bottom: 8px; color: var(--danger);"><strong>AI Generation Failed</strong></div>
      <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">${errorMsg}</div>
      ${suggestions}
    </div>
  `;
}
