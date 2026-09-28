import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('habitat', {
  load: (): Promise<unknown> => ipcRenderer.invoke('world:load'),
  save: (world: unknown): Promise<void> => ipcRenderer.invoke('world:save', world),
  ignoreMouse: (ignore: boolean): void => ipcRenderer.send('window:ignore-mouse', ignore),
  quit: (): void => ipcRenderer.send('window:quit'),
  onTogglePanel: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('panel:toggle', listener);
    return () => ipcRenderer.removeListener('panel:toggle', listener);
  },
});
