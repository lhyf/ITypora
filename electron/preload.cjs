const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  initialize: () => ipcRenderer.invoke('initialize'),
  openPreferences: section => ipcRenderer.invoke('open-preferences', section),
  preferencesCommand: (name, value) => ipcRenderer.invoke('preferences-command', name, value),
  onPreferencesSection: callback => ipcRenderer.on('preferences-section', (_event, value) => callback(value)),
  savePreferences: update => ipcRenderer.invoke('save-preferences', update),
  onPreferences: callback => ipcRenderer.on('preferences-changed', (_event, value) => callback(value)),
  open: (file) => ipcRenderer.invoke('open', file),
  folder: () => ipcRenderer.invoke('folder'),
  newDocument: () => ipcRenderer.invoke('new-document'),
  save: (saveAs) => ipcRenderer.invoke('save', Boolean(saveAs)),
  close: () => ipcRenderer.invoke('close'),
  update: (content, dirty) => ipcRenderer.send('document-update', { content, dirty }),
  importTheme: () => ipcRenderer.invoke('import-theme'),
  view: (state) => ipcRenderer.send('view-update', state),
  find: (query, forward, next) => ipcRenderer.invoke('find', query, forward, next),
  onFind: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('find-result', listener);
    return () => ipcRenderer.removeListener('find-result', listener);
  },
  onAction: (callback) => {
    const listener = async (_event, action) => {
      try { await callback(action); }
      finally { ipcRenderer.send('action-complete', action); }
    };
    ipcRenderer.on('action', listener);
    return () => ipcRenderer.removeListener('action', listener);
  }
});
