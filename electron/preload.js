const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getWorkflows:       ()         => ipcRenderer.invoke('get-workflows'),
  runWorkflow:        (id)       => ipcRenderer.invoke('run-workflow', id),
  captureState:       ()         => ipcRenderer.invoke('capture-state'),
  saveWorkflow:       (workflow) => ipcRenderer.invoke('save-workflow', workflow),
  deleteWorkflow:     (id)       => ipcRenderer.invoke('delete-workflow', id),
  getLicenseStatus:   ()         => ipcRenderer.invoke('get-license-status'),
  validateLicense:    (key)      => ipcRenderer.invoke('validate-license', key),
  openExternal:       (url)      => ipcRenderer.invoke('open-external', url),
  getFreeLimit:       ()         => ipcRenderer.invoke('get-free-limit'),
  deactivateLicense:  ()         => ipcRenderer.invoke('deactivate-license'),
  getStripeUrl:       ()         => ipcRenderer.invoke('get-stripe-url'),
  installUpdate:          ()  => ipcRenderer.invoke('install-update'),
  onLicenseActivated:     (cb) => ipcRenderer.on('license-activated',      (_, data) => cb(data)),
  onLicenseStatusChanged: (cb) => ipcRenderer.on('license-status-changed', (_, data) => cb(data)),
  onUpdateDownloaded:     (cb) => ipcRenderer.on('update-downloaded',      (_, data) => cb(data)),
  onWindowVisibility: (cb) => {
    const sub = (_, state) => cb(state);
    ipcRenderer.on('window-visibility', sub);
    return () => ipcRenderer.removeListener('window-visibility', sub);
  },
});
