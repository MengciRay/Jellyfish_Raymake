import { Application } from 'pixi.js';
import { BELL_PATTERN_NAMES, BELL_SHAPE_NAMES, EYE_SHAPE_NAMES, GLOW_SHAPE_NAMES, express, GENOME_LENGTH, TENTACLE_FORM_NAMES,
  type Phenotype, type SpecialBellShape, type SpecialEyeShape, type SpecialGlowShape,
  type SpecialTentacleForm } from '../shared/genome';
import { JellyView } from './jelly';
import { breed, COIN_INTERVAL_SECONDS, coinYield, collectCoins, discoverSpecialTraits, editGenes, energySpeedFactor, feed, geneEditCost, introduce,
  MATURITY_SECONDS, MAX_GENE_EDITS, MAX_JELLIES, newWorld, parseWorld, preyCaptureChance, removeJelly,
  renameJelly, traitSnapshot, traitSummary, type GeneEdit, type JellyData, type LineageRecord,
  type TraitRecordKey, type TraitSnapshot } from './world';
import './style.css';

type NumericTraitKey = Exclude<TraitRecordKey, 'colorR' | 'colorG' | 'colorB' |
  'gradientColorR' | 'gradientColorG' | 'gradientColorB'>;
const traitAxes: ReadonlyArray<{ key: NumericTraitKey; label: string; min: number; max: number; unit?: string; digits?: number }> = [
  { key: 'gradientStrength', label: '渐变强度', min: 0.1, max: 0.46, digits: 2 },
  { key: 'bellWidth', label: '伞盖宽度', min: 23, max: 208, unit: ' px' },
  { key: 'bellHeight', label: '伞盖高度', min: 10, max: 111, unit: ' px' },
  { key: 'bellCurve', label: '伞盖曲率', min: 0.76, max: 1.2, digits: 2 },
  { key: 'scallops', label: '边缘瓣数', min: 3, max: 12, digits: 0 },
  { key: 'tentacles', label: '触手数量', min: 3, max: 18, digits: 0 },
  { key: 'tentacleLength', label: '触手长度', min: 25, max: 400, unit: ' px' },
  { key: 'filamentWidth', label: '触手粗细', min: 0.68, max: 4.34, unit: ' px', digits: 2 },
  { key: 'tentacleSway', label: '触手摆幅', min: 0.6, max: 1.5, digits: 2 },
  { key: 'swimSpeed', label: '游泳速度', min: 13, max: 95, unit: ' px/s' },
  { key: 'wander', label: '游动随机性', min: 0.22, max: 1.18, digits: 2 },
  { key: 'buoyancy', label: '浮力倾向', min: -0.4, max: 0.4, digits: 2 },
  { key: 'pulseHz', label: '脉动频率', min: 0.55, max: 2.3, unit: ' Hz', digits: 2 },
  { key: 'toxicity', label: '毒性', min: 0, max: 100, digits: 0 },
  { key: 'metabolism', label: '代谢倍率', min: 0.6, max: 1.4, unit: '×', digits: 2 },
  { key: 'resilience', label: '活力韧性', min: 0.75, max: 1.25, digits: 2 },
  { key: 'glow', label: '发光强度', min: 0.2, max: 1, digits: 2 },
  { key: 'sparkle', label: '闪烁强度', min: 0.15, max: 1, digits: 2 },
  { key: 'bellPattern', label: '伞盖纹饰阶段', min: 0, max: 5, digits: 0 },
];
const ATLAS_TAILS: readonly SpecialTentacleForm[] = ['ribbon', 'starlit'];
const ATLAS_BELLS: readonly SpecialBellShape[] = ['crown', 'lantern', 'lotus', 'crystal', 'wing'];
const ATLAS_PATTERNS = [1, 2, 3, 4, 5] as const;
const ATLAS_EYES: readonly SpecialEyeShape[] = ['line', 'triangle', 'smile'];
const ATLAS_GLOWS: readonly SpecialGlowShape[] = ['cross', 'star'];

function ageLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole % 3600 / 60);
  const rest = whole % 60;
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${rest} 秒`;
}

function remainingLabel(seconds: number): string {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)} 分 ${whole % 60} 秒`;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ backgroundAlpha: 0, antialias: true, resizeTo: window, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2) });
  const canvas = app.canvas;
  element('app').prepend(canvas);

  const panel = element<HTMLElement>('panel');
  const atlasPanel = element<HTMLElement>('atlas-panel');
  const helpPanel = element<HTMLElement>('help-panel');
  const atlasButton = element<HTMLButtonElement>('atlas-button');
  const helpButton = element<HTMLButtonElement>('help-button');
  const toggle = element<HTMLButtonElement>('panel-toggle');
  const list = element<HTMLDivElement>('jelly-list');
  const mateList = element<HTMLDivElement>('mate-list');
  const feedButton = element<HTMLButtonElement>('feed-button');
  const breedButton = element<HTMLButtonElement>('breed-button');
  const introduceButton = element<HTMLButtonElement>('introduce-button');
  const infoButton = element<HTMLButtonElement>('info-button');
  const infoPanel = element<HTMLDivElement>('jelly-info');
  const nameInput = element<HTMLInputElement>('name-input');
  const geneEditButton = element<HTMLButtonElement>('gene-edit-button');
  const editor = element<HTMLElement>('gene-editor');
  const editorSequence = element<HTMLDivElement>('editor-sequence');
  const editorConfirm = element<HTMLButtonElement>('editor-confirm');
  const editorClose = element<HTMLButtonElement>('editor-close');
  const editorBaseOptions = Array.from(element<HTMLDivElement>('editor-base-options').querySelectorAll<HTMLButtonElement>('button'));
  const deleteButton = element<HTMLButtonElement>('delete-button');
  const status = element<HTMLParagraphElement>('status');
  const discoveryToast = element<HTMLDivElement>('discovery-toast');
  const stored = await window.habitat.load();
  const world = parseWorld(stored) ?? newWorld();
  const views = new Map<string, JellyView>();
  world.jellies.forEach(addView);
  let selectedId = world.jellies[0]?.id ?? '';
  let mateId = world.jellies[1]?.id ?? '';
  let pendingDeleteId = '';
  let deleteTimer: number | undefined;
  let dragging: { view: JellyView; pointerId: number; startX: number; startY: number;
    offsetX: number; offsetY: number; moved: boolean } | null = null;
  let pendingDashTimer: number | undefined;
  let lastClick: { id: string; x: number; y: number; time: number } | null = null;
  let quickInfoTimer: number | undefined;
  let discoveryTimer: number | undefined;
  let quickInfoId = '';
  let lastPointer = { x: -1, y: -1 };
  let saveTimer: number | undefined;
  let editingId = '';
  let editorPosition = 0;
  const pendingGeneEdits = new Map<number, string>();
  const editorCells: HTMLButtonElement[] = [];

  function addView(jelly: JellyData): void {
    const view = new JellyView(jelly, window.innerWidth, window.innerHeight);
    views.set(jelly.id, view);
    app.stage.addChild(view.container);
  }

  function replaceView(jelly: JellyData): void {
    const previous = views.get(jelly.id);
    if (!previous) { addView(jelly); return; }
    const stageIndex = app.stage.getChildIndex(previous.container);
    app.stage.removeChild(previous.container);
    previous.destroy();
    const view = new JellyView(jelly, window.innerWidth, window.innerHeight);
    views.set(jelly.id, view);
    app.stage.addChildAt(view.container, stageIndex);
    if (quickInfoId === jelly.id) element('quick-info').hidden = true;
  }

  function selected(): JellyData | undefined {
    return world.jellies.find((jelly) => jelly.id === selectedId);
  }

  function report(message: string): void {
    status.textContent = message;
  }

  function announceDiscovery(jelly: JellyData): string {
    const names = discoverSpecialTraits(world, jelly);
    if (!names.length) return '';
    element('discovery-name').textContent = names.join(' · ');
    element('discovery-jelly').textContent = `${jelly.name} 展现了新的特殊形态`;
    discoveryToast.hidden = false;
    window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(() => { discoveryToast.hidden = true; }, 5000);
    return `首次发现${names.join('、')}！`;
  }

  function renderAtlas(): void {
    const groups = [
      { list: 'atlas-tails', count: 'atlas-tail-count', kind: 'tail', icon: '〰',
        entries: ATLAS_TAILS.map((id) => ({ name: TENTACLE_FORM_NAMES[id], found: world.discoveredForms.includes(id) })) },
      { list: 'atlas-bells', count: 'atlas-bell-count', kind: 'bell', icon: '◡',
        entries: ATLAS_BELLS.map((id) => ({ name: BELL_SHAPE_NAMES[id], found: world.discoveredBellShapes.includes(id) })) },
      { list: 'atlas-patterns', count: 'atlas-pattern-count', kind: 'pattern', icon: '✦',
        entries: ATLAS_PATTERNS.map((id) => ({ name: BELL_PATTERN_NAMES[id], found: world.discoveredBellPatterns.includes(id) })) },
      { list: 'atlas-eyes', count: 'atlas-eye-count', kind: 'eye', icon: '◡',
        entries: ATLAS_EYES.map((id) => ({ name: EYE_SHAPE_NAMES[id], found: world.discoveredEyeShapes.includes(id) })) },
      { list: 'atlas-glows', count: 'atlas-glow-count', kind: 'glow', icon: '✧',
        entries: ATLAS_GLOWS.map((id) => ({ name: GLOW_SHAPE_NAMES[id], found: world.discoveredGlowShapes.includes(id) })) },
    ];
    for (const group of groups) {
      const found = group.entries.filter((entry) => entry.found).length;
      element(group.count).textContent = `${found} / ${group.entries.length}`;
      const cards = group.entries.map((entry) => {
        const card = document.createElement('div');
        card.className = `atlas-card${entry.found ? '' : ' locked'}`;
        card.dataset.kind = group.kind;
        card.setAttribute('aria-label', `${entry.found ? entry.name : '未知形态'}，${entry.found ? '已发现' : '尚未发现'}`);
        const icon = document.createElement('span');
        icon.className = 'atlas-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = entry.found ? group.icon : '?';
        const copy = document.createElement('span');
        copy.className = 'atlas-card-copy';
        const name = document.createElement('strong');
        name.textContent = entry.found ? entry.name : '未发现';
        const state = document.createElement('small');
        state.textContent = entry.found ? '已发现' : '等待新的基因组合';
        copy.append(name, state);
        card.append(icon, copy);
        return card;
      });
      element(group.list).replaceChildren(...cards);
    }
    const total = world.discoveredForms.length + world.discoveredBellShapes.length + world.discoveredBellPatterns.length +
      world.discoveredEyeShapes.length + world.discoveredGlowShapes.length;
    element('atlas-progress').textContent = `${total} / 17`;
  }

  function saveSoon(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void window.habitat.save(world).catch((error: unknown) => report(`存档失败：${String(error)}`));
    }, 350);
  }

  function renderWallet(): void {
    element('coin-total').textContent = world.coins.toLocaleString('zh-CN');
    element('coin-countdown').textContent = `${Math.ceil(COIN_INTERVAL_SECONDS - world.coinProgressSeconds)} 秒后结算`;
    if (!editor.hidden) renderEditorTotals();
  }

  function editingJelly(): JellyData | undefined {
    return world.jellies.find((jelly) => jelly.id === editingId);
  }

  function renderEditorTotals(): void {
    element('editor-balance').textContent = world.coins.toLocaleString('zh-CN');
    const count = pendingGeneEdits.size;
    element('editor-count').textContent = `已修改 ${count} / ${MAX_GENE_EDITS}`;
    const cost = count ? geneEditCost(count) : 0;
    element('editor-price').textContent = count
      ? `花费 ${cost.toLocaleString('zh-CN')} 金币${world.coins < cost ? ' · 余额不足' : ''}`
      : '选择碱基后显示价格';
    editorConfirm.disabled = count === 0 || world.coins < cost || !editingJelly() || editingJelly()?.geneEdited === true;
  }

  function renderGeneEditor(): void {
    const jelly = editingJelly();
    if (!jelly) return;
    for (let index = 0; index < editorCells.length; index += 1) {
      const cell = editorCells[index];
      const base = pendingGeneEdits.get(index) ?? jelly.genome[index];
      cell.textContent = base;
      cell.classList.toggle('selected', index === editorPosition);
      cell.classList.toggle('changed', pendingGeneEdits.has(index));
      cell.setAttribute('aria-label', `第 ${index + 1} 位：${base}`);
    }
    const current = pendingGeneEdits.get(editorPosition) ?? jelly.genome[editorPosition];
    element('editor-position').textContent = `第 ${editorPosition + 1} 位 · 原 ${jelly.genome[editorPosition]}`;
    for (const button of editorBaseOptions) button.classList.toggle('selected', button.dataset.base === current);
    element('editor-changes').textContent = pendingGeneEdits.size
      ? [...pendingGeneEdits.entries()].sort(([a], [b]) => a - b)
        .map(([index, base]) => `${String(index + 1).padStart(3, '0')} ${jelly.genome[index]}→${base}`).join(' · ')
      : '尚未修改';
    renderEditorTotals();
  }

  function buildGeneSequence(jelly: JellyData): void {
    editorCells.length = 0;
    const fragment = document.createDocumentFragment();
    for (let start = 0; start < GENOME_LENGTH; start += 16) {
      const row = document.createElement('div');
      row.className = 'gene-row';
      const label = document.createElement('span');
      label.className = 'gene-row-label';
      label.textContent = String(start + 1).padStart(3, '0');
      row.append(label);
      for (let index = start; index < start + 16; index += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'gene-base';
        cell.textContent = jelly.genome[index];
        cell.title = `第 ${index + 1} 位`;
        cell.addEventListener('click', () => {
          editorPosition = index;
          element('editor-status').textContent = '';
          renderGeneEditor();
        });
        editorCells.push(cell);
        row.append(cell);
      }
      fragment.append(row);
    }
    editorSequence.replaceChildren(fragment);
    editorSequence.scrollTop = 0;
  }

  function openGeneEditor(): void {
    const jelly = selected();
    if (!jelly || jelly.geneEdited) return;
    editingId = jelly.id;
    editorPosition = 0;
    pendingGeneEdits.clear();
    element('editor-jelly-name').textContent = jelly.name;
    element('editor-status').textContent = '';
    buildGeneSequence(jelly);
    editor.hidden = false;
    toggle.hidden = true;
    window.clearTimeout(pendingDashTimer);
    lastClick = null;
    setPanelOpen(false);
    renderGeneEditor();
    editorClose.focus();
  }

  function closeGeneEditor(): void {
    editor.hidden = true;
    editingId = '';
    pendingGeneEdits.clear();
    toggle.hidden = false;
    setPanelOpen(true);
    panel.scrollTop = 0;
    if (geneEditButton.disabled) infoButton.focus();
    else geneEditButton.focus();
  }

  function renderList(): void {
    list.replaceChildren();
    for (const jelly of world.jellies) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `jelly-item${jelly.id === selectedId ? ' selected' : ''}`;
      const dot = document.createElement('span');
      dot.className = 'jelly-dot';
      const rgb = express(jelly.genome).color.toString(16).padStart(6, '0');
      dot.style.backgroundColor = `#${rgb}`;
      dot.style.color = `#${rgb}`;
      const name = document.createElement('span');
      name.textContent = jelly.name;
      item.append(dot, name);
      item.addEventListener('click', () => {
        selectedId = jelly.id;
        renderPanel();
        panel.scrollTo({ top: 0, behavior: 'smooth' });
      });
      list.append(item);
    }
    element('population').textContent = `${world.jellies.length} / ${MAX_JELLIES}`;
  }

  function renderPanel(): void {
    for (const view of views.values()) view.selected = view.data.id === selectedId;
    renderWallet();
    renderList();
    renderBreeding();
    const jelly = selected();
    element('details').hidden = !jelly;
    element('rename-section').hidden = !jelly;
    routeMouse(lastPointer.x, lastPointer.y);
    if (!jelly) return;
    element('rename-current-name').textContent = jelly.name;
    const traits = express(jelly.genome);
    element('jelly-name').textContent = jelly.name;
    element('shape-badge').hidden = traits.bellShape === 'dome';
    element('shape-badge').textContent = BELL_SHAPE_NAMES[traits.bellShape];
    element('form-badge').hidden = traits.tentacleForm === 'filament';
    element('form-badge').textContent = traits.tentacleForm === 'filament' ? '' : TENTACLE_FORM_NAMES[traits.tentacleForm];
    element('rare-badge').hidden = !traits.rare;
    element('jelly-traits').textContent = traitSummary(jelly);
    geneEditButton.disabled = jelly.geneEdited === true;
    geneEditButton.textContent = jelly.geneEdited ? '基因编辑 · 已使用' : '基因编辑';
    element('genome-sequence').textContent = jelly.genome.match(/.{1,32}/g)?.join('\n') ?? jelly.genome;
    nameInput.value = jelly.name;
    resetDelete();
    renderEnergy();
    renderComparison(jelly);
    if (!infoPanel.hidden) renderInfo(jelly, traits);
  }

  function renderComparison(jelly: JellyData): void {
    const comparison = element<HTMLElement>('comparison');
    const origin = element<HTMLElement>('origin-info');
    const record = world.lineage.find((entry) => entry.id === jelly.id);
    comparison.hidden = !record?.parentIds;
    origin.hidden = Boolean(record?.parentIds);
    if (!record?.parentIds) {
      const traits = express(jelly.genome);
      const values = [
        ['主色', `#${traits.color.toString(16).padStart(6, '0').toUpperCase()}`],
        ['伞形', BELL_SHAPE_NAMES[traits.bellShape]],
        ['伞盖宽度', `${Math.round(traits.bellWidth)} px`],
        ['触手', `${traits.tentacles} 条 · ${Math.round(traits.tentacleLength)} px`],
        ['毒性', String(traits.toxicity)],
        ['产币', `每 10 秒 +${coinYield(jelly)}`],
      ];
      const overview = element<HTMLDivElement>('origin-traits');
      overview.replaceChildren();
      for (const [label, value] of values) {
        const row = document.createElement('div');
        const name = document.createElement('span');
        const number = document.createElement('strong');
        name.textContent = label;
        number.textContent = value;
        row.append(name, number);
        overview.append(row);
      }
      return;
    }
    const parents = record.parentIds.map((id) => world.lineage.find((entry) => entry.id === id));
    const snapshots = parents.map((parent) => {
      const live = world.jellies.find((entry) => entry.id === parent?.id);
      return parent?.traits ? { ...(live ? traitSnapshot(live) : {}), ...parent.traits }
        : live ? traitSnapshot(live) : undefined;
    });
    const child = { ...traitSnapshot(jelly), ...record.traits };
    element('comparison-caption').textContent = `${parents[0]?.name ?? '未知'} × ${parents[1]?.name ?? '未知'} → ${jelly.name}`;
    const table = document.createElement('table');
    table.className = 'comparison-table';
    const head = document.createElement('tr');
    for (const title of ['特征', '亲代 A', '亲代 B', '子代']) {
      const cell = document.createElement('th');
      cell.textContent = title;
      head.append(cell);
    }
    table.append(head);
    let closerA = 0;
    let closerB = 0;
    let equal = 0;
    type NumericTraitKey = Exclude<keyof TraitSnapshot, 'bellShape' | 'eyeShape' | 'glowShape'>;
    const distance = (key: NumericTraitKey, a: number, b: number): number => key === 'color'
      ? [0, 8, 16].reduce((total, shift) => total + Math.abs(((a >>> shift) & 255) - ((b >>> shift) & 255)), 0)
      : Math.abs(a - b);
    const rows: ReadonlyArray<{ key: NumericTraitKey; label: string; format: (value: number) => string }> = [
      { key: 'color', label: '主色', format: (value) => `#${value.toString(16).padStart(6, '0').toUpperCase()}` },
      { key: 'bellWidth', label: '伞宽', format: (value) => `${Math.round(value)} px` },
      { key: 'tentacles', label: '触手', format: (value) => `${value} 条` },
      { key: 'tentacleLength', label: '触手长', format: (value) => `${Math.round(value)} px` },
      { key: 'swimSpeed', label: '游速', format: (value) => `${Math.round(value)} px/s` },
      { key: 'toxicity', label: '毒性', format: String },
      { key: 'bellPattern', label: '伞纹', format: (value) => BELL_PATTERN_NAMES[value] ?? '无' },
    ];
    for (const { key, label, format } of rows) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.textContent = label;
      row.append(name);
      for (const [index, traits] of [...snapshots, child].entries()) {
        const cell = document.createElement('td');
        if (index === 2) cell.className = 'child-trait';
        if (traits) {
          if (key === 'color') {
            const swatch = document.createElement('span');
            swatch.className = 'comparison-swatch';
            swatch.style.backgroundColor = format(traits.color);
            cell.append(swatch);
          }
          cell.append(document.createTextNode(format(traits[key])));
        } else cell.textContent = '—';
        row.append(cell);
      }
      if (snapshots[0] && snapshots[1]) {
        const firstDistance = distance(key, child[key], snapshots[0][key]);
        const secondDistance = distance(key, child[key], snapshots[1][key]);
        if (Math.abs(firstDistance - secondDistance) < 0.001) equal += 1;
        else if (firstDistance < secondDistance) closerA += 1;
        else closerB += 1;
      }
      table.append(row);
    }
    const shapeRow = document.createElement('tr');
    const shapeLabel = document.createElement('th');
    shapeLabel.textContent = '伞形';
    shapeRow.append(shapeLabel);
    for (const [index, traits] of [...snapshots, child].entries()) {
      const cell = document.createElement('td');
      if (index === 2) cell.className = 'child-trait';
      cell.textContent = traits?.bellShape ? BELL_SHAPE_NAMES[traits.bellShape] : '—';
      shapeRow.append(cell);
    }
    table.append(shapeRow);
    element('comparison-table').replaceChildren(table);
    element('comparison-summary').textContent = snapshots[0] && snapshots[1]
      ? `更接近亲代 A：${closerA} 项 · 亲代 B：${closerB} 项 · 相近：${equal} 项`
      : '旧档案缺少部分亲代性状，现有数据仍可查看。';
  }

  function renderInfo(jelly: JellyData, traits: Phenotype): void {
    const details = element<HTMLDivElement>('trait-details');
    details.replaceChildren();
    for (const [label, colorKey, color] of [
      ['主体颜色', 'color', traits.color], ['渐变颜色', 'gradientColor', traits.gradientColor],
    ] as const) {
      const row = document.createElement('div');
      row.className = 'color-trait';
      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
      row.textContent = `${label} · #${color.toString(16).padStart(6, '0').toUpperCase()}`;
      row.prepend(swatch);
      details.append(row);
      for (const [channel, shift] of [['R', 16], ['G', 8], ['B', 0]] as const) {
        const key = `${colorKey}${channel}` as TraitRecordKey;
        appendTraitAxis(details, `${label} ${channel}`, (color >>> shift) & 255, 0, 255, '', 0, key);
      }
    }
    for (const axis of traitAxes) {
      appendTraitAxis(details, axis.label, traits[axis.key] as number, axis.min, axis.max,
        axis.unit ?? '', axis.digits ?? 1, axis.key);
    }
    const rare = document.createElement('p');
    rare.className = 'boolean-trait';
    rare.textContent = `伞形：${BELL_SHAPE_NAMES[traits.bellShape]} · 触手形态：${traits.tentacleForm === 'filament' ? '细丝' : TENTACLE_FORM_NAMES[traits.tentacleForm]} · 伞盖纹饰：${BELL_PATTERN_NAMES[traits.bellPattern]} · 眼睛：${EYE_SHAPE_NAMES[traits.eyeShape]} · 背光：${GLOW_SHAPE_NAMES[traits.glowShape]} · 稀有斑点：${traits.rare ? '有' : '无'}`;
    details.append(rare);
    renderFamilyTree(jelly.id);
  }

  function appendTraitAxis(target: HTMLElement, label: string, value: number,
    min: number, max: number, unit: string, digits: number, key: TraitRecordKey): void {
    const row = document.createElement('div');
    row.className = 'trait-row';
    const heading = document.createElement('div');
    heading.className = 'trait-heading';
    const name = document.createElement('span');
    name.textContent = label;
    const number = document.createElement('strong');
    number.textContent = `${value.toFixed(digits)}${unit}`;
    heading.append(name, number);
    const track = document.createElement('div');
    track.className = 'trait-track';
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', String(min));
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(Math.max(min, Math.min(max, value))));
    const position = (amount: number): string =>
      `${Math.max(0, Math.min(100, (amount - min) / (max - min) * 100))}%`;
    const marker = document.createElement('span');
    marker.className = 'trait-marker';
    marker.style.left = position(value);
    track.append(marker);
    const ends = document.createElement('div');
    ends.className = 'trait-ends';
    const lower = document.createElement('span');
    lower.textContent = `${min}${unit}`;
    const upper = document.createElement('span');
    upper.textContent = `${max}${unit}`;
    ends.append(lower, upper);
    const record = world.traitRecords[key];
    if (record) {
      for (const [kind, amount] of [['min', record.min], ['max', record.max]] as const) {
        const recordMarker = document.createElement('span');
        recordMarker.className = `trait-record-marker ${kind}`;
        recordMarker.style.left = position(amount);
        recordMarker.title = `已遇${kind === 'min' ? '最低' : '最高'} ${amount.toFixed(digits)}${unit}`;
        recordMarker.setAttribute('aria-hidden', 'true');
        track.append(recordMarker);
      }
    }
    const history = document.createElement('div');
    history.className = 'trait-history';
    history.textContent = record
      ? `已遇最低 ${record.min.toFixed(digits)}${unit} · 最高 ${record.max.toFixed(digits)}${unit}`
      : '暂无纪录';
    row.append(heading, track, ends, history);
    target.append(row);
  }

  function renderFamilyTree(id: string): void {
    const tree = element<HTMLDivElement>('family-tree');
    tree.replaceChildren();
    const records = new Map(world.lineage.map((record) => [record.id, record]));
    const current = new Set(world.jellies.map((jelly) => jelly.id));
    const root = records.get(id);
    if (!root) return;
    const rootName = document.createElement('p');
    rootName.className = 'family-root';
    rootName.textContent = root.name;
    tree.append(rootName);

    function appendParents(parent: LineageRecord, container: HTMLElement): void {
      if (!parent.parentIds) {
        const origin = document.createElement('p');
        origin.className = 'family-origin';
        origin.textContent = '初代 / 野外引入 · 无亲代记录';
        container.append(origin);
        return;
      }
      for (const [index, parentId] of parent.parentIds.entries()) {
        const ancestor = records.get(parentId);
        if (!ancestor) continue;
        const branch = document.createElement('details');
        branch.className = 'family-branch';
        const summary = document.createElement('summary');
        summary.textContent = `亲代 ${index === 0 ? 'A' : 'B'}：${ancestor.name}${current.has(parentId) ? '' : '（已离开）'}`;
        branch.append(summary);
        branch.addEventListener('toggle', () => {
          if (branch.open && branch.childElementCount === 1) appendParents(ancestor, branch);
        });
        container.append(branch);
      }
    }
    appendParents(root, tree);
  }

  function renderBreeding(): void {
    const first = selected();
    const mates = world.jellies.filter((jelly) => jelly.id !== first?.id);
    if (!mates.some((jelly) => jelly.id === mateId)) {
      mateId = mates.find((jelly) => jelly.ageSeconds >= MATURITY_SECONDS && jelly.energy >= 0.3)?.id ?? mates[0]?.id ?? '';
    }
    element('breeding-parent').textContent = first?.name ?? '未选择';
    mateList.replaceChildren();
    for (const jelly of mates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mate-chip${jelly.id === mateId ? ' selected' : ''}`;
      button.dataset.jellyId = jelly.id;
      const dot = document.createElement('span');
      dot.className = 'jelly-dot';
      const color = express(jelly.genome).color.toString(16).padStart(6, '0');
      dot.style.backgroundColor = `#${color}`;
      dot.style.color = `#${color}`;
      const name = document.createElement('span');
      name.className = 'mate-name';
      name.textContent = jelly.name;
      const note = document.createElement('span');
      note.className = 'mate-note';
      button.append(dot, name, note);
      button.addEventListener('click', () => { mateId = jelly.id; renderBreeding(); });
      mateList.append(button);
    }
    introduceButton.disabled = world.jellies.length >= MAX_JELLIES;
    renderMaturity();
  }

  function renderMaturity(): void {
    for (const chip of Array.from(mateList.querySelectorAll<HTMLButtonElement>('.mate-chip'))) {
      const jelly = world.jellies.find((entry) => entry.id === chip.dataset.jellyId);
      const note = chip.querySelector('.mate-note');
      if (jelly && note) note.textContent = jelly.ageSeconds < MATURITY_SECONDS
        ? `还需 ${remainingLabel(MATURITY_SECONDS - jelly.ageSeconds)}`
        : jelly.energy < 0.3 ? '需投喂' : '可繁殖';
    }
    const first = selected();
    const second = world.jellies.find((jelly) => jelly.id === mateId);
    breedButton.disabled = !first || !second ||
      world.jellies.length >= MAX_JELLIES || first.ageSeconds < MATURITY_SECONDS ||
      second.ageSeconds < MATURITY_SECONDS || first.energy < 0.3 || second.energy < 0.3;
    const waiting: string[] = [];
    if (first && first.ageSeconds < MATURITY_SECONDS) waiting.push(`${first.name} 还需 ${remainingLabel(MATURITY_SECONDS - first.ageSeconds)}`);
    if (second && second.ageSeconds < MATURITY_SECONDS) waiting.push(`${second.name} 还需 ${remainingLabel(MATURITY_SECONDS - second.ageSeconds)}`);
    element('breed-hint').textContent = waiting.length ? waiting.join(' · ')
      : world.jellies.length >= MAX_JELLIES ? '水母数量已达上限。'
      : first && second && (first.energy < 0.3 || second.energy < 0.3) ? '亲代活力不足，请先投喂。'
      : first && second ? '配对已就绪。' : '选择一只水母和一只伴侣。';
    const jelly = selected();
    if (jelly) element('maturity-value').textContent = jelly.ageSeconds < MATURITY_SECONDS
      ? `幼体 · 还需 ${remainingLabel(MATURITY_SECONDS - jelly.ageSeconds)}` : '成熟 · 可繁殖';
  }

  function resetDelete(): void {
    pendingDeleteId = '';
    window.clearTimeout(deleteTimer);
    deleteButton.textContent = '删除这只水母';
    deleteButton.classList.remove('confirm');
  }

  function renderEnergy(): void {
    const jelly = selected();
    if (!jelly) return;
    element('energy-bar').style.width = `${Math.round(jelly.energy * 100)}%`;
    element('energy-value').textContent = `${Math.round(jelly.energy * 100)}%`;
    element('age-value').textContent = ageLabel(jelly.ageSeconds);
    element('hunger-value').textContent = `${Math.round((1 - jelly.energy) * 100)}%`;
    element('metabolism-value').textContent = `${express(jelly.genome).metabolism.toFixed(2)}×`;
    element('speed-value').textContent = `${Math.round(express(jelly.genome).swimSpeed * energySpeedFactor(jelly.energy))} px/s`;
    element('capture-chance').textContent = `${Math.round(preyCaptureChance(jelly) * 100)}%`;
    element('prey-count').textContent = String(jelly.preyCaught ?? 0);
    renderMaturity();
  }

  function inside(target: HTMLElement, x: number, y: number): boolean {
    const rect = target.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function routeMouse(x: number, y: number): void {
    lastPointer = { x, y };
    const dialog = !editor.hidden ? editor : !atlasPanel.hidden ? atlasPanel : !helpPanel.hidden ? helpPanel : null;
    const overControls = dialog ? inside(dialog, x, y)
      : inside(toggle, x, y) || (!panel.hidden && inside(panel, x, y));
    const overJelly = !dialog && [...views.values()].some((view) => view.hit(x, y));
    // While a jelly is selected, the next background click clears selection.
    // Once cleared, the transparent desktop receives clicks again.
    window.habitat.ignoreMouse(!(dragging || overControls || overJelly || (!dialog && selectedId)));
  }

  function clearSelection(): void {
    if (!selectedId) return;
    selectedId = '';
    window.clearTimeout(pendingDashTimer);
    lastClick = null;
    window.clearTimeout(quickInfoTimer);
    quickInfoId = '';
    element('quick-info').hidden = true;
    renderPanel();
  }

  function setPanelOpen(open: boolean): void {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭养护面板' : '打开养护面板');
    routeMouse(lastPointer.x, lastPointer.y);
  }

  function openSubpanel(target: HTMLElement, back: HTMLButtonElement): void {
    window.clearTimeout(pendingDashTimer);
    lastClick = null;
    element('quick-info').hidden = true;
    toggle.hidden = true;
    setPanelOpen(false);
    target.hidden = false;
    target.scrollTop = 0;
    routeMouse(lastPointer.x, lastPointer.y);
    back.focus();
  }

  function closeSubpanel(): void {
    const opener = !atlasPanel.hidden ? atlasButton : helpButton;
    atlasPanel.hidden = true;
    helpPanel.hidden = true;
    toggle.hidden = false;
    setPanelOpen(true);
    opener.focus();
  }

  toggle.addEventListener('click', () => setPanelOpen(panel.hidden));
  atlasButton.addEventListener('click', () => {
    renderAtlas();
    openSubpanel(atlasPanel, element<HTMLButtonElement>('atlas-back'));
  });
  helpButton.addEventListener('click', () => openSubpanel(helpPanel, element<HTMLButtonElement>('help-back')));
  element('atlas-back').addEventListener('click', closeSubpanel);
  element('help-back').addEventListener('click', closeSubpanel);
  geneEditButton.addEventListener('click', openGeneEditor);
  editorClose.addEventListener('click', closeGeneEditor);
  for (const button of editorBaseOptions) button.addEventListener('click', () => {
    const jelly = editingJelly();
    const base = button.dataset.base;
    if (!jelly || !base) return;
    if (base === jelly.genome[editorPosition]) pendingGeneEdits.delete(editorPosition);
    else if (!pendingGeneEdits.has(editorPosition) && pendingGeneEdits.size >= MAX_GENE_EDITS) {
      element('editor-status').textContent = '一次最多修改 5 个位点。';
      return;
    } else pendingGeneEdits.set(editorPosition, base);
    element('editor-status').textContent = '';
    renderGeneEditor();
  });
  editorConfirm.addEventListener('click', () => {
    const jelly = editingJelly();
    if (!jelly) return;
    const edits: GeneEdit[] = [...pendingGeneEdits].map(([index, base]) => ({ index, base }));
    try {
      const spent = editGenes(world, jelly, edits);
      replaceView(jelly);
      renderPanel();
      closeGeneEditor();
      report(`已为 ${jelly.name} 编辑 ${edits.length} 个位点，花费 ${spent.toLocaleString('zh-CN')} 金币。${announceDiscovery(jelly)}`);
      saveSoon();
    } catch (error) {
      element('editor-status').textContent = error instanceof Error ? error.message : '基因编辑失败';
      renderEditorTotals();
    }
  });
  infoButton.addEventListener('click', () => {
    infoPanel.hidden = !infoPanel.hidden;
    infoButton.setAttribute('aria-expanded', String(!infoPanel.hidden));
    if (!infoPanel.hidden) {
      const jelly = selected();
      if (jelly) renderInfo(jelly, express(jelly.genome));
    }
  });
  element('panel-close').addEventListener('click', () => setPanelOpen(false));
  element('quit-button').addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    void window.habitat.save(world).then(() => window.habitat.quit())
      .catch((error: unknown) => report(`存档失败，未退出：${String(error)}`));
  });
  window.habitat.onTogglePanel(() => {
    if (!editor.hidden) closeGeneEditor();
    else if (!atlasPanel.hidden || !helpPanel.hidden) closeSubpanel();
    else setPanelOpen(panel.hidden);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!editor.hidden) closeGeneEditor();
      else if (!atlasPanel.hidden || !helpPanel.hidden) closeSubpanel();
      else setPanelOpen(false);
    }
  });
  element('rename-button').addEventListener('click', () => {
    const jelly = selected();
    if (!jelly) return;
    try {
      const name = renameJelly(world, jelly, nameInput.value);
      renderPanel();
      report(`已将水母改名为 ${name}。`);
      saveSoon();
    } catch (error) {
      report(error instanceof Error ? error.message : '改名失败');
    }
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') element<HTMLButtonElement>('rename-button').click();
  });
  deleteButton.addEventListener('click', () => {
    const jelly = selected();
    if (!jelly) return;
    if (pendingDeleteId !== jelly.id) {
      pendingDeleteId = jelly.id;
      deleteButton.textContent = `确认删除 ${jelly.name}？`;
      deleteButton.classList.add('confirm');
      deleteTimer = window.setTimeout(resetDelete, 5000);
      return;
    }
    const removed = removeJelly(world, jelly.id);
    const view = views.get(removed.id);
    if (view) {
      app.stage.removeChild(view.container);
      view.destroy();
      views.delete(removed.id);
    }
    if (quickInfoId === removed.id) element('quick-info').hidden = true;
    selectedId = world.jellies[0]?.id ?? '';
    renderPanel();
    panel.scrollTo({ top: 0, behavior: 'smooth' });
    report(`已删除 ${removed.name}。可随时引入野生水母。`);
    saveSoon();
  });
  introduceButton.addEventListener('click', () => {
    try {
      const newcomer = introduce(world);
      addView(newcomer);
      selectedId = newcomer.id;
      renderPanel();
      panel.scrollTo({ top: 0, behavior: 'smooth' });
      report(`${newcomer.name} 加入了养护箱。${announceDiscovery(newcomer)}`);
      saveSoon();
    } catch (error) {
      report(error instanceof Error ? error.message : '引入失败');
    }
  });

  feedButton.addEventListener('click', () => {
    const jelly = selected();
    if (!jelly) return;
    feed(jelly);
    views.get(jelly.id)?.playFeeding();
    feedButton.classList.remove('feeding');
    void feedButton.offsetWidth;
    feedButton.classList.add('feeding');
    window.setTimeout(() => feedButton.classList.remove('feeding'), 650);
    renderEnergy();
    report(`${jelly.name} 的活力恢复了。`);
    saveSoon();
  });

  breedButton.addEventListener('click', () => {
    const first = selected();
    const second = world.jellies.find((jelly) => jelly.id === mateId);
    if (!first || !second) return;
    try {
      const child = breed(world, first, second);
      addView(child);
      selectedId = child.id;
      renderPanel();
      element('comparison').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const shape = express(child.genome).bellShape;
      report(`${child.name} 诞生了！基因来自 ${first.name} 和 ${second.name}。${shape === 'dome' ? '' : `形成了${BELL_SHAPE_NAMES[shape]}！`}${announceDiscovery(child)}`);
      saveSoon();
    } catch (error) {
      report(error instanceof Error ? error.message : '繁殖失败');
    }
  });

  function positionQuickInfo(view: JellyView): void {
    const popup = element<HTMLDivElement>('quick-info');
    popup.style.left = `${Math.max(105, Math.min(window.innerWidth - 105, view.x))}px`;
    popup.style.top = `${Math.max(18, Math.min(window.innerHeight - 90,
      view.y - view.phenotype.bellHeight * view.scale - 80))}px`;
  }

  function showQuickInfo(view: JellyView): void {
    const jelly = view.data;
    quickInfoId = jelly.id;
    element('quick-info-name').textContent = jelly.name;
    const form = view.phenotype.tentacleForm;
    element('quick-info-stats').textContent = `${BELL_SHAPE_NAMES[view.phenotype.bellShape]} · ${form === 'filament' ? `${view.phenotype.tentacles} 条触手` : TENTACLE_FORM_NAMES[form]} · 活力 ${Math.round(jelly.energy * 100)}%`;
    element('quick-info-coins').textContent = `每 10 秒 +${coinYield(jelly)} 金币`;
    element('quick-info').hidden = false;
    positionQuickInfo(view);
    window.clearTimeout(quickInfoTimer);
    quickInfoTimer = window.setTimeout(() => { element('quick-info').hidden = true; quickInfoId = ''; }, 2600);
  }

  window.addEventListener('mousemove', (event) => routeMouse(event.clientX, event.clientY));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !editor.hidden || !atlasPanel.hidden || !helpPanel.hidden) return;
    const hit = [...views.values()].reverse().find((view) => view.hit(event.clientX, event.clientY));
    if (!hit) { clearSelection(); return; }
    selectedId = hit.data.id;
    renderPanel();
    if (!panel.hidden) panel.scrollTo({ top: 0, behavior: 'smooth' });
    dragging = { view: hit, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: hit.x - event.clientX, offsetY: hit.y - event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
    routeMouse(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    if (!dragging.moved && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 6) return;
    dragging.moved = true;
    dragging.view.x = Math.max(25, Math.min(window.innerWidth - 25, event.clientX + dragging.offsetX));
    dragging.view.y = Math.max(40, Math.min(window.innerHeight - 30, event.clientY + dragging.offsetY));
    dragging.view.data.x = dragging.view.x / window.innerWidth;
    dragging.view.data.y = dragging.view.y / window.innerHeight;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const gesture = dragging;
    dragging = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    routeMouse(event.clientX, event.clientY);
    if (gesture.moved) { saveSoon(); return; }
    const now = performance.now();
    if (lastClick && lastClick.id === gesture.view.data.id && now - lastClick.time < 340 &&
        Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) < 24) {
      window.clearTimeout(pendingDashTimer);
      lastClick = null;
      showQuickInfo(gesture.view);
    } else {
      if (lastClick && lastClick.id !== gesture.view.data.id) {
        window.clearTimeout(pendingDashTimer);
        views.get(lastClick.id)?.dashTowardBell();
      }
      lastClick = { id: gesture.view.data.id, x: event.clientX, y: event.clientY, time: now };
      pendingDashTimer = window.setTimeout(() => {
        if (views.has(gesture.view.data.id)) gesture.view.dashTowardBell();
        lastClick = null;
      }, 340);
    }
  });
  canvas.addEventListener('pointercancel', () => {
    if (dragging?.moved) saveSoon();
    dragging = null;
  });

  window.addEventListener('resize', () => {
    for (const view of views.values()) {
      view.x = view.data.x * window.innerWidth;
      view.y = view.data.y * window.innerHeight;
    }
  });
  let sincePanelRefresh = 0;
  let sinceSave = 0;
  let lastSimulationTick = performance.now();
  function advanceSimulation(now: number): void {
    const elapsed = Math.max(0, (now - lastSimulationTick) / 1000);
    lastSimulationTick = now;
    if (elapsed === 0) return;
    const earned = collectCoins(world, elapsed);
    if (earned > 0) { renderWallet(); saveSoon(); }
    let remaining = Math.min(elapsed, 5);
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 0.05);
      remaining -= step;
      for (const view of views.values()) {
        view.update(step, window.innerWidth, window.innerHeight,
          dragging?.view === view, remaining <= 0.000001);
      }
    }
    if (elapsed > 5) for (const view of views.values()) view.fastForward(elapsed - 5);
    if (quickInfoId && !element('quick-info').hidden) {
      const view = views.get(quickInfoId);
      if (view) positionQuickInfo(view);
    }
    sincePanelRefresh += elapsed;
    sinceSave += elapsed;
    if (sincePanelRefresh >= 1) { renderEnergy(); renderWallet(); sincePanelRefresh = 0; }
    if (sinceSave >= 20) { saveSoon(); sinceSave = 0; }
  }
  app.ticker.add(() => advanceSimulation(performance.now()));

  renderPanel();
  report(stored && typeof stored === 'object' && 'version' in stored && stored.version === 1
    ? '旧存档已迁移到 512 bp，个体与原有颜色已保留。'
    : '选择亲代 A 和 B，试试繁殖、改名或投喂。');
  saveSoon();
  routeMouse(-1, -1);
}

void main().catch((error: unknown) => {
  document.body.textContent = `桌面水母启动失败：${String(error)}`;
});
