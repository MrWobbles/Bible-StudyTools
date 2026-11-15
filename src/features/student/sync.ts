import { handlePendingMedia } from './media';
import { jumpToPause, restartVideo, skipToNextPause, togglePlay } from './player';
import { isInIframe, studentState } from './state';
import type { RemoteCommandData } from './types';
import { adjustVerseFont, nextVersePage, previousVersePage } from './verses';
import { goFullscreen } from './view';

const MAX_RECENT_COMMAND_IDS = 50;
const recentCommandIds = new Set<string>();
let displayEventSource: EventSource | null = null;
let displayReconnectTimer: number | null = null;

function connectDisplayEvents(): void {
  if (typeof EventSource === 'undefined' || !studentState.channelKey) {
    return;
  }
  if (displayReconnectTimer !== null) {
    window.clearTimeout(displayReconnectTimer);
    displayReconnectTimer = null;
  }
  if (displayEventSource) {
    displayEventSource.close();
    displayEventSource = null;
  }

  const url = `/api/display/events?channel=${encodeURIComponent(studentState.channelKey)}`;
  const source = new EventSource(url);
  displayEventSource = source;

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      const data: unknown = JSON.parse(event.data);
      handleRemoteCommand({ data });
    } catch (err) {
      console.warn('[Student] SSE message failed to parse:', err);
    }
  };

  source.onerror = () => {
    source.close();
    if (displayEventSource === source) {
      displayEventSource = null;
    }
    if (displayReconnectTimer === null) {
      displayReconnectTimer = window.setTimeout(() => {
        displayReconnectTimer = null;
        connectDisplayEvents();
      }, 3000);
    }
  };
}

/**
 * Connect to the teacher control channel via Electron IPC, BroadcastChannel, storage fallback, and server SSE.
 */
export function setupControlChannel(): void {
  console.log(
    '[Student] Setting up control channel:',
    studentState.channelKey,
    'STORAGE_FALLBACK_KEY:',
    studentState.storageFallbackKey
  );
  console.log('[Student] Is in iframe:', isInIframe);

  // Use Electron IPC-based channel if available, otherwise native BroadcastChannel
  if (window.bst?.createBroadcastChannel) {
    const ipcChannel = window.bst.createBroadcastChannel(studentState.channelKey);
    studentState.channel = ipcChannel;
    ipcChannel.addMessageHandler?.((event: unknown) => {
      console.log('[Student] Electron IPC message received:', event);
      handleRemoteCommand(event);
    });
    console.log('[Student] Electron IPC BroadcastChannel set up');
  } else if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel(studentState.channelKey);
    studentState.channel = bc;
    bc.onmessage = (event: MessageEvent<unknown>) => {
      console.log('[Student] BroadcastChannel message received');
      handleRemoteCommand(event);
    };
    console.log('[Student] BroadcastChannel set up');
  }

  window.addEventListener('storage', (event: StorageEvent) => {
    console.log('[Student] Storage event received, key:', event.key);
    if (event.key !== studentState.storageFallbackKey || !event.newValue) return;
    console.log('[Student] Processing storage event');
    try {
      const data: unknown = JSON.parse(event.newValue);
      handleRemoteCommand({ data });
    } catch (err) {
      console.warn('Control message failed to parse', err);
    }
  });

  connectDisplayEvents();
}

function isRemoteCommandData(value: unknown): value is RemoteCommandData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

function extractCommandData(event: unknown): RemoteCommandData | null {
  if (typeof event === 'object' && event !== null && 'data' in event) {
    const inner = (event as { data: unknown }).data;
    if (isRemoteCommandData(inner)) return inner;
  }
  if (isRemoteCommandData(event)) return event;
  return null;
}

/**
 * Deduplicate and dispatch incoming remote control commands from the teacher window.
 */
export function handleRemoteCommand(event: unknown): void {
  const data = extractCommandData(event);
  if (!data || !data.type) return;

  const commandId = `${data.type}-${String(data.sentAt ?? '')}`;
  if (
    commandId === studentState.lastProcessedCommandId ||
    (data.sentAt != null && recentCommandIds.has(commandId))
  ) {
    console.log('[Student] Ignoring duplicate command:', data.type);
    return;
  }
  studentState.lastProcessedCommandId = commandId;
  if (data.sentAt != null) {
    recentCommandIds.add(commandId);
    if (recentCommandIds.size > MAX_RECENT_COMMAND_IDS) {
      const oldest = recentCommandIds.values().next().value;
      if (oldest !== undefined) {
        recentCommandIds.delete(oldest);
      }
    }
  }

  console.log('[Student] Received command:', data.type, data);

  switch (data.type) {
    case 'toggle':
      togglePlay();
      break;
    case 'play':
      studentState.player?.playVideo?.();
      break;
    case 'pause':
      studentState.player?.pauseVideo?.();
      break;
    case 'restart':
      restartVideo();
      break;
    case 'nextPause':
      skipToNextPause();
      break;
    case 'jumpToPause':
      if (typeof data.index === 'number' && Number.isInteger(data.index)) {
        const idx = Math.max(0, Math.min(data.index, studentState.pausePoints.length - 1));
        jumpToPause(idx);
      }
      break;
    case 'fullscreen':
      // Only execute fullscreen in the actual window, not in iframe preview
      if (!isInIframe) {
        console.log('[Student] Executing fullscreen command');
        goFullscreen();
      } else {
        document.body.classList.toggle('fullscreen-mode');
        console.log(
          '[Student] Simulated fullscreen in iframe preview:',
          document.body.classList.contains('fullscreen-mode')
        );
      }
      break;
    case 'displayMedia':
      document.getElementById('blackout-overlay')?.remove();
      console.log('[Student] Received displayMedia:', data.media);
      studentState.pendingMedia = data.media ?? null;
      if (document.readyState === 'complete') {
        handlePendingMedia();
      }
      break;
    case 'blackout': {
      const existing = document.getElementById('blackout-overlay');
      if (existing) {
        existing.remove();
      } else {
        const overlay = document.createElement('div');
        overlay.id = 'blackout-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;cursor:none;';
        document.body.appendChild(overlay);
      }
      break;
    }
    case 'clearScreen':
      document.getElementById('blackout-overlay')?.remove();
      if (typeof window.returnToDefaultView === 'function') {
        console.log('[Student] Clearing screen and returning to default view');
        window.returnToDefaultView();
      }
      break;
    case 'verseNext':
      nextVersePage();
      break;
    case 'versePrevious':
      previousVersePage();
      break;
    case 'verseFontIncrease':
      adjustVerseFont(4);
      break;
    case 'verseFontDecrease':
      adjustVerseFont(-4);
      break;
    default:
      break;
  }
}
