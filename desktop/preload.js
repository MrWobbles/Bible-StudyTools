const { contextBridge, ipcRenderer } = require('electron');

// Create a shim for BroadcastChannel that uses Electron IPC
class ElectronBroadcastChannel {
  constructor(name) {
    this.name = name;
    this._listeners = [];
    console.log('[BroadcastChannel] Created channel:', name);

    // Listen for relayed messages from main process
    ipcRenderer.on('broadcast-channel-relay', (event, message) => {
      console.log('[BroadcastChannel] Received relay:', message);
      if (message.channel === name) {
        console.log('[BroadcastChannel] Dispatching to', this._listeners.length, 'listeners');
        this._listeners.forEach(listener => {
          listener({ data: message.data });
        });
      }
    });
  }

  postMessage(message) {
    console.log('[BroadcastChannel] Posting message on', this.name, ':', message);
    // Send to main process to relay to other windows
    ipcRenderer.send('broadcast-channel-message', {
      channel: this.name,
      data: message
    });
  }

  set onmessage(handler) {
    this._listeners = [handler];
  }

  addEventListener(type, handler) {
    if (type === 'message') {
      this._listeners.push(handler);
    }
  }

  close() {
    this._listeners = [];
  }
}

// Override BroadcastChannel with our Electron-compatible version
window.BroadcastChannel = ElectronBroadcastChannel;

// Expose API for file system operations
contextBridge.exposeInMainWorld('bst', {
  version: '0.1.0',
  saveFile: (filename, data) => ipcRenderer.invoke('save-file', filename, data),
  uploadMedia: (mediaType, filename, arrayBuffer) => ipcRenderer.invoke('upload-media', mediaType, filename, arrayBuffer),
  downloadMedia: (mediaType, url) => ipcRenderer.invoke('download-media', mediaType, url),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen')
});
