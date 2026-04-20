import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  appName: 'AI Jacque',
});
