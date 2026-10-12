const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roomDesktop', {
  readPreferences: () => ipcRenderer.invoke('room:read-preferences'),
  chatgpt: (projectId, taskId, action, value) => ipcRenderer.invoke('room:chatgpt', projectId, taskId, action, value),
  writePreference: (key, value) => ipcRenderer.invoke('room:write-preference', key, value),
  selectDirectory: () => ipcRenderer.invoke('room:select-directory'),
  selectReference: (kind) => ipcRenderer.invoke('room:select-reference', kind),
  openReference: (location) => ipcRenderer.invoke('room:open-reference', location),
  quit: () => ipcRenderer.invoke('room:quit'),
  diagnostics: () => ipcRenderer.invoke('room:diagnostics'),
  openLogs: () => ipcRenderer.invoke('room:open-logs'),
});
