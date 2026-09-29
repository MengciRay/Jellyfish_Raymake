const { app, BrowserWindow, ipcMain } = require('electron');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

app.setPath('userData', path.join(__dirname, '..', 'release', 'shape-preview-user-data'));
const replace = (genome, start, base) => genome.slice(0, start) + base.repeat(16) + genome.slice(start + 16);
const normal = 'ACGT'.repeat(128);
const triangleStar = replace(replace(normal, 464, 'A'), 480, 'A');
const extreme = [144, 240, 272, 464, 480].reduce((genome, start) => replace(genome, start, 'T'), normal);
const jellies = [
  { id: 'normal', name: '圆眼圆光', genome: normal, x: 0.18, y: 0.31, ageSeconds: 300, energy: 0.9 },
  { id: 'star', name: '三角眼星光', genome: triangleStar, x: 0.49, y: 0.31, ageSeconds: 300, energy: 0.9 },
  { id: 'cross', name: '笑眼十字光', genome: extreme, x: 0.78, y: 0.31, ageSeconds: 300, energy: 0.9 },
];
ipcMain.handle('world:load', () => ({ version: 3, bornCount: 3, coins: 0, coinProgressSeconds: 0,
  jellies, lineage: jellies.map((jelly) => ({ id: jelly.id, name: jelly.name, parentIds: null })),
  traitRecords: {} }));
ipcMain.handle('world:save', () => {});
ipcMain.on('window:ignore-mouse', () => {});
ipcMain.on('window:quit', () => {});

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1280, height: 800, backgroundColor: '#102331',
    webPreferences: { offscreen: true, preload: path.join(__dirname, '..', 'dist', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await window.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await window.webContents.executeJavaScript("document.querySelector('#panel-close').click()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  writeFileSync(path.join(__dirname, '..', 'shape-preview.png'),
    await window.webContents.capturePage().then((image) => image.toPNG()));
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
