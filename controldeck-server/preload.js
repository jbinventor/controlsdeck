const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controlsDeckAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  getPlugins: () => ipcRenderer.invoke('plugins:get'),
  getI18n: () => ipcRenderer.invoke('i18n:get'),
  getRemoteUrlInfo: () => ipcRenderer.invoke('server:get-remote-url-info'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  savePage: (page) => ipcRenderer.invoke('page:save', page),
  deletePage: (pageId) => ipcRenderer.invoke('page:delete', pageId),
  reorderPages: (orderedIds) => ipcRenderer.invoke('pages:reorder', orderedIds),
  saveControl: (payload) => ipcRenderer.invoke('control:save', payload),
  deleteControl: (payload) => ipcRenderer.invoke('control:delete', payload),
  onConfigChanged: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('config-changed', listener);
    return () => ipcRenderer.removeListener('config-changed', listener);
  },
  onControlStateUpdate: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on('control-state-update', listener);
    return () => ipcRenderer.removeListener('control-state-update', listener);
  },
});
