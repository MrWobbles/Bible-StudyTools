const { contextBridge, ipcRenderer } = require('electron');

// Registry of all channels created in this window
const channelRegistry = new Map();

// Set up ONE listener for all relayed messages
ipcRenderer.on('broadcast-channel-relay', (event, message) => {
  console.log('[Preload] Received relay for channel:', message.channel);
  const handlers = channelRegistry.get(message.channel);
  if (handlers && handlers.length > 0) {
    console.log('[Preload] Dispatching to', handlers.length, 'handlers');
    handlers.forEach(handler => {
      try {
        handler({ data: message.data });
      } catch (err) {
        console.error('[Preload] Error in message handler:', err);
      }
    });
  } else {
    console.log('[Preload] No handlers registered for channel:', message.channel);
  }
});

// Expose API for file system operations and BroadcastChannel
contextBridge.exposeInMainWorld('bst', {
  version: '0.1.0',
  saveFile: (filename, data) => ipcRenderer.invoke('save-file', filename, data),
  uploadMedia: (mediaType, filename, arrayBuffer) => ipcRenderer.invoke('upload-media', mediaType, filename, arrayBuffer),
  downloadMedia: (mediaType, url) => ipcRenderer.invoke('download-media', mediaType, url),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),

  // BroadcastChannel-like API for cross-window communication
  createBroadcastChannel: (name) => {
    console.log('[Preload] Creating channel:', name);

    // Initialize handler array for this channel if not exists
    if (!channelRegistry.has(name)) {
      channelRegistry.set(name, []);
    }

    return {
      postMessage: (message) => {
        console.log('[Preload] Posting message on', name);
        ipcRenderer.send('broadcast-channel-message', { channel: name, data: message });
      },

      addMessageHandler: (handler) => {
        console.log('[Preload] Adding handler for channel:', name);
        const handlers = channelRegistry.get(name);
        handlers.push(handler);
        console.log('[Preload] Total handlers for', name, ':', handlers.length);
      },

      close: () => {
        channelRegistry.set(name, []);
      }
    };
  }
});
