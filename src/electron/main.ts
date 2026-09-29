import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

let window: BrowserWindow | null = null;
let ignoresMouse = true;
let pendingSave: Promise<void> = Promise.resolve();

function habitatFile(): string {
  // Keep the save location stable when the displayed product name changes.
  return path.join(app.getPath('appData'), 'jellyfish-raymake', 'habitat', 'world.json');
}

function legacyHabitatFile(): string {
  return path.join(app.getPath('appData'), 'Jellyfish Raymake', 'habitat', 'world.json');
}

function createWindow(): void {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  window = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.setIgnoreMouseEvents(true, { forward: true });
  void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  window.on('closed', () => { window = null; });
}

app.whenReady().then(() => {
  ipcMain.handle('world:load', async (event): Promise<unknown> => {
    if (event.sender !== window?.webContents) return null;
    const locations = await Promise.all([habitatFile(), legacyHabitatFile()].map(async (filename) => {
      try {
        return { filename, modified: (await stat(filename)).mtimeMs };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Cannot load habitat', error);
        return null;
      }
    }));
    const available = locations.filter((item): item is { filename: string; modified: number } => item !== null)
      .sort((first, second) => second.modified - first.modified);
    for (const { filename } of available) {
      try {
        return JSON.parse(await readFile(filename, 'utf8')) as unknown;
      } catch (error) { console.error('Cannot load habitat', error); }
    }
    return null;
  });

  ipcMain.handle('world:save', async (event, world: unknown): Promise<void> => {
    if (event.sender !== window?.webContents) return;
    if (!world || typeof world !== 'object' || !('version' in world) || world.version !== 3 ||
        !('jellies' in world) || !Array.isArray(world.jellies) || world.jellies.length > 16) {
      throw new Error('Invalid habitat data');
    }
    const serialized = JSON.stringify(world);
    if (serialized.length > 1048576) throw new Error('Habitat data too large');
    pendingSave = pendingSave.catch(() => undefined).then(async () => {
      const filename = habitatFile();
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(`${filename}.tmp`, serialized, 'utf8');
      await rename(`${filename}.tmp`, filename);
    });
    return pendingSave;
  });

  ipcMain.on('window:ignore-mouse', (event, ignore: unknown) => {
    if (event.sender !== window?.webContents || typeof ignore !== 'boolean' || ignoresMouse === ignore) return;
    ignoresMouse = ignore;
    window.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('window:quit', (event) => {
    if (event.sender === window?.webContents) app.quit();
  });

  globalShortcut.register('CommandOrControl+Shift+J', () => {
    window?.webContents.send('panel:toggle');
  });
  screen.on('display-metrics-changed', () => {
    if (!window) return;
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    window.setBounds({ x, y, width, height });
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
