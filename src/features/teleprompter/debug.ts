import { DEBUG, state } from './state';
import type { DebugReport, ErrorLogEntry, ErrorReport } from './types';

// Debug output with timestamps and context
export function debug(msg: string, context: Record<string, unknown> = {}): void {
  if (!DEBUG) return;

  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  const fullMsg = `[${time}] ${msg}`;
  console.log(`[Teleprompter] ${fullMsg}`, context);

  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;

  const debugOutput = document.getElementById('debug-output');
  if (!debugOutput) return;

  const line = document.createElement('div');
  line.style.fontSize = '11px';
  line.style.padding = '2px 4px';
  line.style.borderBottom = '1px solid #ddd';
  line.style.wordBreak = 'break-word';
  line.style.fontFamily = 'monospace';
  line.textContent = fullMsg;

  if (Object.keys(context).length > 0) {
    line.title = JSON.stringify(context, null, 2);
    line.style.cursor = 'help';
  }

  debugOutput.insertBefore(line, debugOutput.firstChild);
  if (debugOutput.children.length > 50 && debugOutput.lastChild) {
    debugOutput.removeChild(debugOutput.lastChild);
  }
}

// Error tracking for diagnostics
export const errorLog = {
  errors: [] as ErrorLogEntry[],
  warnings: [] as ErrorLogEntry[],
  startTime: Date.now(),

  addError(message: string, context: Record<string, unknown> = {}): void {
    const entry: ErrorLogEntry = {
      timestamp: Date.now(),
      timeElapsed: Date.now() - this.startTime,
      message,
      context,
      type: 'error'
    };
    this.errors.push(entry);
    debug(`❌ ERROR: ${message}`, context);
  },

  addWarning(message: string, context: Record<string, unknown> = {}): void {
    const entry: ErrorLogEntry = {
      timestamp: Date.now(),
      timeElapsed: Date.now() - this.startTime,
      message,
      context,
      type: 'warning'
    };
    this.warnings.push(entry);
    debug(`⚠️ WARNING: ${message}`, context);
  },

  getReport(): ErrorReport {
    return {
      uptime: Date.now() - this.startTime,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      errors: this.errors,
      warnings: this.warnings
    };
  }
};

// Show temporary message to user
export function showStatusMessage(message: string, duration = 3000): void {
  const statusEl = document.getElementById('listening-status');
  if (!statusEl) return;
  const originalText = statusEl.textContent;

  statusEl.textContent = message;
  statusEl.style.color = 'var(--accent-amber)';

  setTimeout(() => {
    statusEl.textContent = originalText;
    statusEl.style.color = '';
  }, duration);
}

// Expose debug report helpers on window for diagnostics
export function registerDebugGlobals(): void {
  window.getDebugReport = function (): DebugReport {
    const report = errorLog.getReport();
    return {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      onLine: navigator.onLine,
      classId: state.classId,
      classTitle: state.classConfig?.title || 'N/A',
      pointsLoaded: state.allOutlinePoints.length,
      isListening: state.isListening,
      ...report
    };
  };

  window.copyDebugReport = function (): void {
    if (!window.getDebugReport) return;
    const report = window.getDebugReport();
    const text = JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      console.log('Debug report copied to clipboard!');
      showStatusMessage('✓ Debug report copied to clipboard', 2000);
    }).catch((err: unknown) => {
      console.error('Failed to copy:', err);
      console.log('DEBUG REPORT:', report);
    });
  };
}
