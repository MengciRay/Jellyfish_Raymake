const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');

const userData = path.join(__dirname, '..', 'release', 'form-preview-user-data');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const replace = (genome, start, base) => genome.slice(0, start) + base.repeat(16) + genome.slice(start + 16);
const base = 'T'.repeat(48) + 'C'.repeat(464);
const long = replace(replace(base, 128, 'A'), 144, 'T');
const ribbon = replace(replace(long, 160, 'T'), 176, 'T');
const starlit = replace(replace(replace(long, 0, 'G'), 416, 'T'), 448, 'T');
const jellies = [
  { id: 'ribbon', name: '丝带触手', genome: ribbon, x: 0.19, y: 0.43, ageSeconds: 300, energy: 0.9 },
  { id: 'starlit', name: '星尾', genome: starlit, x: 0.52, y: 0.43, ageSeconds: 300, energy: 0.9 },
];
const world = { version: 3, bornCount: 2, coins: 0, coinProgressSeconds: 0, jellies,
  lineage: jellies.map((jelly) => ({ id: jelly.id, name: jelly.name, parentIds: null })),
  traitRecords: {}, discoveredForms: ['ribbon', 'starlit'] };
ipcMain.handle('world:load', () => world);
ipcMain.handle('world:save', () => {});
ipcMain.on('window:ignore-mouse', () => {});
ipcMain.on('window:quit', () => {});

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 700, backgroundColor: '#102331',
    webPreferences: { offscreen: true, preload: path.join(__dirname, '..', 'dist', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await window.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const state = await window.webContents.executeJavaScript(`(() => {
    document.querySelector('#atlas-button').click();
    return { names: [...document.querySelectorAll('.jelly-item')].map((item) => item.textContent),
      discovered: document.querySelector('#atlas-tail-count').textContent,
      error: document.body.textContent.includes('启动失败') };
  })()`);
  if (state.error || state.names.length !== 2 || state.discovered !== '2 / 2') throw new Error(JSON.stringify(state));
  await new Promise((resolve) => setTimeout(resolve, 600));
  writeFileSync(path.join(__dirname, '..', 'atlas-preview.png'), await window.webContents.capturePage().then((image) => image.toPNG()));
  const help = await window.webContents.executeJavaScript(`(() => {
    document.querySelector('#atlas-back').click();
    document.querySelector('#help-button').click();
    return document.querySelector('#help-panel').textContent.includes('vx:Mang_guo0708');
  })()`);
  if (!help) throw new Error('Help panel did not contain the contact line');
  await new Promise((resolve) => setTimeout(resolve, 600));
  writeFileSync(path.join(__dirname, '..', 'help-preview.png'), await window.webContents.capturePage().then((image) => image.toPNG()));
  const records = await window.webContents.executeJavaScript(`(() => {
    document.querySelector('#help-back').click();
    document.querySelector('#info-button').click();
    document.querySelector('.trait-row').scrollIntoView({ block: 'center' });
    return document.querySelectorAll('.trait-record-marker').length;
  })()`);
  if (records < 2) throw new Error('Encountered trait markers were not rendered');
  await new Promise((resolve) => setTimeout(resolve, 600));
  writeFileSync(path.join(__dirname, '..', 'records-preview.png'), await window.webContents.capturePage().then((image) => image.toPNG()));
  console.log(state);
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
