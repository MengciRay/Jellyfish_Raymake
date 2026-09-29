const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const userData = path.join(__dirname, '..', '.smoke-user-data', String(process.pid));
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
let lastSaved = null;
let loadSave = null;

ipcMain.handle('world:load', () => loadSave);
ipcMain.handle('world:save', (_event, world) => { lastSaved = world; });
ipcMain.on('window:ignore-mouse', () => {});
ipcMain.on('window:quit', () => {});

const timeout = setTimeout(() => {
  console.error('Electron smoke test timed out');
  app.exit(1);
}, 45000);

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await window.loadURL(pathToFileURL(path.join(__dirname, '..', 'dist', 'renderer', 'index.html')).href);
  const result = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = (predicate, label = 'UI', timeoutMs = 10000) => new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const poll = () => predicate() ? resolve() : Date.now() > deadline
        ? reject(new Error(label + ' did not reach expected state')) : setTimeout(poll, 50);
      poll();
    });
    await waitFor(() => document.querySelectorAll('.jelly-item').length === 2, 'Initial jelly list');
    if (document.title !== '桌面水母' || document.querySelector('h1')?.textContent !== '桌面水母') {
      throw new Error('The desktop game name was not updated');
    }
    document.querySelector('#atlas-button').click();
    if (document.querySelector('#atlas-panel').hidden || !document.querySelector('#panel').hidden ||
        document.querySelectorAll('.atlas-card').length !== 17 ||
        !document.querySelector('#atlas-progress').textContent.includes('/ 17')) {
      throw new Error('The separate discovery atlas did not open with all special forms');
    }
    document.querySelector('#atlas-back').click();
    if (!document.querySelector('#atlas-panel').hidden || document.querySelector('#panel').hidden) {
      throw new Error('The atlas did not return to the care panel');
    }
    document.querySelector('#help-button').click();
    if (document.querySelector('#help-panel').hidden || !document.querySelector('#panel').hidden ||
        !document.querySelector('#help-panel').textContent.includes('单击伞盖冲刺') ||
        !document.querySelector('#help-panel').textContent.includes('vx:Mang_guo0708') ||
        document.querySelector('footer').textContent.includes('单击冲刺')) {
      throw new Error('Help content or footer cleanup was incorrect');
    }
    document.querySelector('#help-back').click();
    if (!document.querySelector('#help-panel').hidden || document.querySelector('#panel').hidden) {
      throw new Error('Help did not return to the care panel');
    }
    if (document.querySelector('#boss-button')) throw new Error('Removed hide control is still present');
    if (document.querySelector('#coin-total').textContent !== '0' ||
        !document.querySelector('#coin-countdown').textContent.includes('秒')) {
      throw new Error('Coin wallet or countdown was not shown');
    }
    const renameSection = document.querySelector('#rename-section');
    const details = document.querySelector('#details');
    const collection = document.querySelector('#collection-section');
    if (renameSection.hidden || !details.contains(renameSection) ||
        !details.contains(document.querySelector('#feed-button')) ||
        !(details.compareDocumentPosition(collection) & Node.DOCUMENT_POSITION_FOLLOWING) ||
        !(collection.compareDocumentPosition(document.querySelector('.breeding-section')) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error('Selected jelly controls were not above the collection and pairing actions');
    }
    if (document.querySelector('#origin-info').hidden || !document.querySelector('#comparison').hidden ||
        document.querySelectorAll('#origin-traits div').length !== 6) {
      throw new Error('A jelly without recorded parents did not show its ordinary information card');
    }
    document.querySelector('#gene-edit-button').click();
    if (document.querySelector('#gene-editor').hidden || !document.querySelector('#panel').hidden ||
        document.querySelectorAll('.gene-base').length !== 512) {
      throw new Error('Separate 512-base gene editor did not open');
    }
    const firstBase = document.querySelector('.gene-base');
    firstBase.click();
    document.querySelector('#editor-base-options button:not([data-base="' + firstBase.textContent + '"])').click();
    if (!document.querySelector('#editor-confirm').disabled ||
        !document.querySelector('#editor-price').textContent.includes('100')) {
      throw new Error('Unfunded gene edit was not blocked');
    }
    document.querySelector('#editor-close').click();
    if (!document.querySelector('#gene-editor').hidden || document.querySelector('#panel').hidden) {
      throw new Error('Gene editor did not return to the main panel');
    }
    const items = () => document.querySelectorAll('.jelly-item').length;
    const genome = document.querySelector('#genome-sequence').textContent.replace(/\\s/g, '');
    if (genome.length !== 512) throw new Error('Genome is not 512 bp');
    document.querySelector('#info-button').click();
    if (document.querySelector('#jelly-info').hidden || document.querySelectorAll('.trait-row').length < 20) {
      throw new Error('Detailed trait axes were not shown');
    }
    if (document.querySelectorAll('.trait-history').length !== document.querySelectorAll('.trait-row').length ||
        !document.querySelector('.trait-history').textContent.includes('已遇最低')) {
      throw new Error('Encountered trait records were not shown');
    }
    if ([...document.querySelectorAll('.trait-row')].some((row) =>
      row.querySelectorAll('.trait-record-marker').length !== 2 ||
      !row.querySelector('.trait-record-marker.min')?.style.left ||
      !row.querySelector('.trait-record-marker.max')?.style.left)) {
      throw new Error('Encountered minimum and maximum positions were not marked on every trait axis');
    }
    document.querySelectorAll('.jelly-item')[1].click();
    if (!document.querySelectorAll('.jelly-item')[1].classList.contains('selected') ||
        document.querySelectorAll('.jelly-item')[0].classList.contains('selected')) {
      throw new Error('Selection indicator did not follow the selected jelly');
    }
    document.querySelectorAll('.jelly-item')[0].click();
    if (!document.querySelector('#age-value').textContent || !document.querySelector('#hunger-value').textContent) {
      throw new Error('Life state was not shown');
    }
    if (!document.querySelector('#maturity-value').textContent.includes('成熟') ||
        !document.querySelector('#speed-value').textContent.includes('px/s')) {
      throw new Error('Maturity or energy adjusted speed was not shown');
    }
    if (!document.querySelector('#capture-chance').textContent.includes('%') ||
        !/^\\d+$/.test(document.querySelector('#prey-count').textContent)) {
      throw new Error('Prey capture state was not shown');
    }
    if (document.querySelectorAll('.mate-chip').length !== 1 ||
        document.querySelector('#breed-button').disabled) {
      throw new Error('Quick pairing was not ready');
    }
    const canvas = document.querySelector('canvas');
    canvas.setPointerCapture = () => {};
    canvas.hasPointerCapture = () => false;
    const pointer = (type) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 1, button: 0, clientX: innerWidth * 0.32, clientY: innerHeight * 0.35,
    }));
    pointer('pointerdown'); pointer('pointerup'); pointer('pointerdown'); pointer('pointerup');
    await waitFor(() => !document.querySelector('#quick-info').hidden, 'Quick info');
    if (!document.querySelector('#quick-info-stats').textContent.includes('触手')) {
      throw new Error('Double click quick info was not shown');
    }
    const yieldText = document.querySelector('#quick-info-coins').textContent;
    if (!yieldText.startsWith('每 10 秒 +') || !yieldText.endsWith(' 金币')) {
      throw new Error('Jelly coin yield was not shown in quick info');
    }
    document.querySelector('#feed-button').click();
    if (!document.querySelector('#feed-button').classList.contains('feeding')) {
      throw new Error('Feeding feedback did not start');
    }
    const name = document.querySelector('#name-input');
    name.value = '测试名字';
    document.querySelector('#rename-button').click();
    if (document.querySelector('#rename-current-name').textContent !== document.querySelector('#jelly-name').textContent) {
      throw new Error('Rename label did not follow the selected jelly');
    }
    if (document.querySelector('#jelly-name').textContent !== '测试名字') throw new Error('Rename failed');
    document.querySelector('#breed-button').click();
    await waitFor(() => items() === 3, 'Breeding');
    if (document.querySelector('#comparison').hidden || !document.querySelector('#origin-info').hidden ||
        document.querySelectorAll('.comparison-table tr').length !== 9 ||
        !document.querySelector('#comparison-summary').textContent.includes('亲代')) {
      throw new Error('Parent child comparison was not shown');
    }
    if (document.querySelectorAll('#family-tree .family-branch').length !== 2) {
      throw new Error('Child ancestry was not shown');
    }
    if (!document.querySelector('#maturity-value').textContent.includes('还需')) {
      throw new Error('Child maturation countdown was not shown');
    }
    if (!document.querySelector('#breed-button').disabled ||
        !document.querySelector('#breed-hint').textContent.includes('还需')) {
      throw new Error('Immature parent was not explained');
    }
    document.querySelector('#delete-button').click();
    document.querySelector('#delete-button').click();
    await waitFor(() => items() === 2, 'Deletion');
    document.querySelector('#introduce-button').click();
    await waitFor(() => items() === 3, 'Wild introduction');
    if (document.querySelector('#origin-info').hidden || !document.querySelector('#comparison').hidden) {
      throw new Error('Wild jelly did not show its ordinary information card');
    }
    await waitFor(() => Number(document.querySelector('#coin-total').textContent) > 0, 'Coin settlement', 13000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { genomeLength: genome.length, renamed: true, bred: true, deleted: true, introduced: true };
  })()`);
  if (!lastSaved || lastSaved.version !== 3 || lastSaved.jellies.length !== 3 ||
      lastSaved.lineage.length !== 4 || lastSaved.coins <= 0 ||
      !Array.isArray(lastSaved.discoveredBellShapes) || !Array.isArray(lastSaved.discoveredBellPatterns)) {
    throw new Error('The resulting v3 habitat was not saved');
  }
  const dragStart = { id: lastSaved.jellies[0].id, x: lastSaved.jellies[0].x, y: lastSaved.jellies[0].y };
  const dragDeltaX = dragStart.x > 0.5 ? -120 : 120;
  const dragProbe = await window.webContents.executeJavaScript(`(async () => {
    const canvas = document.querySelector('canvas');
    const startX = ${dragStart.x} * innerWidth;
    const startY = ${dragStart.y} * innerHeight;
    const move = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 7, button: 0, clientX: x, clientY: y,
    }));
    move('pointerdown', startX, startY);
    const downSelection = document.querySelector('.jelly-item.selected')?.textContent;
    move('pointermove', startX + ${dragDeltaX}, startY + 50);
    move('pointerup', startX + ${dragDeltaX}, startY + 50);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { downSelection, finalSelection: document.querySelector('.jelly-item.selected')?.textContent, startX, startY, canvasWidth: canvas.width, canvasHeight: canvas.height };
  })()`);
  const dragEnd = lastSaved.jellies.find((jelly) => jelly.id === dragStart.id);
  if (Math.abs((dragEnd?.x ?? dragStart.x) - dragStart.x) <= 0.05) {
    throw new Error(`Dragging a jelly did not move and save its position: ${JSON.stringify({ dragStart, dragEnd: { x: dragEnd?.x, y: dragEnd?.y }, dragProbe, saved: lastSaved.jellies.map((jelly) => ({ id: jelly.id, x: jelly.x, y: jelly.y })) })}`);
  }
  loadSave = structuredClone(lastSaved);
  loadSave.coins = 1000;
  await window.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  const edited = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = (predicate) => new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const poll = () => predicate() ? resolve() : Date.now() > deadline
        ? reject(new Error('Funded editor did not reach expected state')) : setTimeout(poll, 50);
      poll();
    });
    await waitFor(() => document.querySelectorAll('.jelly-item').length === 3);
    const original = document.querySelector('#genome-sequence').textContent.replace(/\\s/g, '');
    document.querySelector('#gene-edit-button').click();
    const cells = document.querySelectorAll('.gene-base');
    const change = (cell) => {
      const originalBase = cell.textContent;
      cell.click();
      const option = [...document.querySelectorAll('#editor-base-options button')]
        .find((button) => button.dataset.base !== originalBase);
      option.click();
      return option.dataset.base;
    };
    const first = change(cells[0]);
    const second = change(cells[1]);
    if (!document.querySelector('#editor-count').textContent.includes('2 / 5') ||
        !document.querySelector('#editor-price').textContent.includes('500') ||
        document.querySelector('#editor-confirm').disabled) {
      throw new Error('Two-base edit price or state was incorrect');
    }
    document.querySelector('#editor-confirm').click();
    await waitFor(() => document.querySelector('#gene-editor').hidden);
    const updated = document.querySelector('#genome-sequence').textContent.replace(/\\s/g, '');
    if (updated.slice(0, 2) !== first + second || updated.slice(2) !== original.slice(2) ||
        !document.querySelector('#gene-edit-button').disabled ||
        document.querySelector('#coin-total').textContent !== '500') {
      throw new Error('Paid gene edit did not update the jelly and wallet exactly once');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { edited: true, genome: updated };
  })()`);
  if (lastSaved.coins !== 500 || lastSaved.jellies[0].geneEdited !== true ||
      lastSaved.jellies[0].genome !== edited.genome) {
    throw new Error('Gene edit and one-time lock were not saved');
  }
  loadSave = structuredClone(lastSaved);
  await window.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  const restored = await window.webContents.executeJavaScript(`(async () => {
    const deadline = Date.now() + 5000;
    while (!document.querySelector('#gene-edit-button')?.disabled && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return document.querySelector('#gene-edit-button')?.disabled &&
      document.querySelector('#coin-total')?.textContent === '500';
  })()`);
  if (!restored) throw new Error('Gene edit lock or balance was lost after reload');
  const cleared = await window.webContents.executeJavaScript(`(() => {
    document.querySelector('#panel-close').click();
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 2, button: 0, clientX: innerWidth * 0.5, clientY: innerHeight * 0.9,
    }));
    const empty = document.querySelectorAll('.jelly-item.selected').length === 0 &&
      document.querySelector('#details').hidden;
    document.querySelector('#panel-toggle').click();
    document.querySelector('.jelly-item').click();
    return empty && document.querySelectorAll('.jelly-item.selected').length === 1 &&
      !document.querySelector('#details').hidden;
  })()`);
  if (!cleared) throw new Error('Clicking empty canvas did not clear and restore selection');
  console.log('Electron smoke passed:', JSON.stringify({ ...result, geneEdited: true, editRestored: true, cleared: true }));
  clearTimeout(timeout);
  app.quit();
}).catch((error) => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});
