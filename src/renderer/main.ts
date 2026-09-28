import { Application } from 'pixi.js';
import { express } from '../shared/genome';
import { JellyView } from './jelly';
import { breed, feed, MAX_JELLIES, newWorld, parseWorld, traitSummary, type JellyData } from './world';
import './style.css';

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
  const toggle = element<HTMLButtonElement>('panel-toggle');
  const list = element<HTMLDivElement>('jelly-list');
  const mateSelect = element<HTMLSelectElement>('mate-select');
  const feedButton = element<HTMLButtonElement>('feed-button');
  const breedButton = element<HTMLButtonElement>('breed-button');
  const status = element<HTMLParagraphElement>('status');
  const world = parseWorld(await window.habitat.load()) ?? newWorld();
  const views = new Map<string, JellyView>();
  world.jellies.forEach(addView);
  let selectedId = world.jellies[0]?.id ?? '';
  let mateId = world.jellies[1]?.id ?? '';
  let dragging: { view: JellyView; offsetX: number; offsetY: number } | null = null;
  let lastPointer = { x: -1, y: -1 };
  let saveTimer: number | undefined;

  function addView(jelly: JellyData): void {
    const view = new JellyView(jelly, window.innerWidth, window.innerHeight);
    views.set(jelly.id, view);
    app.stage.addChild(view.container);
  }

  function selected(): JellyData | undefined {
    return world.jellies.find((jelly) => jelly.id === selectedId);
  }

  function report(message: string): void {
    status.textContent = message;
  }

  function saveSoon(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void window.habitat.save(world).catch((error: unknown) => report(`存档失败：${String(error)}`));
    }, 350);
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
      item.addEventListener('click', () => { selectedId = jelly.id; renderPanel(); });
      list.append(item);
    }
    element('population').textContent = `${world.jellies.length} / ${MAX_JELLIES}`;
  }

  function renderPanel(): void {
    renderList();
    const jelly = selected();
    element('details').hidden = !jelly;
    if (!jelly) return;
    const traits = express(jelly.genome);
    element('jelly-name').textContent = jelly.name;
    element('rare-badge').hidden = !traits.rare;
    element('jelly-traits').textContent = traitSummary(jelly);
    element('genome-sequence').textContent = jelly.genome.match(/.{1,10}/g)?.join(' ') ?? jelly.genome;
    mateSelect.replaceChildren();
    const mates = world.jellies.filter((other) => other.id !== jelly.id);
    if (!mates.some((mate) => mate.id === mateId)) mateId = mates[0]?.id ?? '';
    for (const mate of mates) {
      const option = document.createElement('option');
      option.value = mate.id;
      option.textContent = mate.name;
      mateSelect.append(option);
    }
    mateSelect.value = mateId;
    mateSelect.disabled = mates.length === 0;
    breedButton.disabled = mates.length === 0 || world.jellies.length >= MAX_JELLIES;
    renderEnergy();
  }

  function renderEnergy(): void {
    const jelly = selected();
    if (!jelly) return;
    element('energy-bar').style.width = `${Math.round(jelly.energy * 100)}%`;
    element('energy-value').textContent = `${Math.round(jelly.energy * 100)}%`;
  }

  function inside(target: HTMLElement, x: number, y: number): boolean {
    const rect = target.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function routeMouse(x: number, y: number): void {
    lastPointer = { x, y };
    const overControls = inside(toggle, x, y) || (!panel.hidden && inside(panel, x, y));
    const overJelly = [...views.values()].some((view) => view.hit(x, y));
    window.habitat.ignoreMouse(!(dragging || overControls || overJelly));
  }

  function setPanelOpen(open: boolean): void {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭养护面板' : '打开养护面板');
    routeMouse(lastPointer.x, lastPointer.y);
  }

  toggle.addEventListener('click', () => setPanelOpen(panel.hidden));
  element('panel-close').addEventListener('click', () => setPanelOpen(false));
  element('quit-button').addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    void window.habitat.save(world).then(() => window.habitat.quit())
      .catch((error: unknown) => report(`存档失败，未退出：${String(error)}`));
  });
  window.habitat.onTogglePanel(() => setPanelOpen(panel.hidden));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setPanelOpen(false);
  });
  mateSelect.addEventListener('change', () => { mateId = mateSelect.value; });

  feedButton.addEventListener('click', () => {
    const jelly = selected();
    if (!jelly) return;
    feed(jelly);
    renderEnergy();
    report(`${jelly.name} 的活力恢复了。`);
    saveSoon();
  });

  breedButton.addEventListener('click', () => {
    const first = selected();
    const second = world.jellies.find((jelly) => jelly.id === mateSelect.value);
    if (!first || !second) return;
    try {
      const child = breed(world, first, second);
      addView(child);
      selectedId = child.id;
      mateId = first.id;
      renderPanel();
      report(`${child.name} 诞生了！基因来自 ${first.name} 和 ${second.name}。`);
      saveSoon();
    } catch (error) {
      report(error instanceof Error ? error.message : '繁殖失败');
    }
  });

  window.addEventListener('mousemove', (event) => routeMouse(event.clientX, event.clientY));
  canvas.addEventListener('pointerdown', (event) => {
    const hit = [...views.values()].reverse().find((view) => view.hit(event.clientX, event.clientY));
    if (!hit) return;
    selectedId = hit.data.id;
    renderPanel();
    setPanelOpen(true);
    dragging = { view: hit, offsetX: hit.x - event.clientX, offsetY: hit.y - event.clientY };
    canvas.setPointerCapture(event.pointerId);
    routeMouse(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragging.view.x = Math.max(25, Math.min(window.innerWidth - 25, event.clientX + dragging.offsetX));
    dragging.view.y = Math.max(40, Math.min(window.innerHeight - 30, event.clientY + dragging.offsetY));
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    routeMouse(event.clientX, event.clientY);
    saveSoon();
  });
  canvas.addEventListener('pointercancel', () => { dragging = null; saveSoon(); });

  window.addEventListener('resize', () => {
    for (const view of views.values()) {
      view.x = view.data.x * window.innerWidth;
      view.y = view.data.y * window.innerHeight;
    }
  });
  let sincePanelRefresh = 0;
  let sinceSave = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    for (const view of views.values()) view.update(dt, window.innerWidth, window.innerHeight, dragging?.view === view);
    sincePanelRefresh += dt;
    sinceSave += dt;
    if (sincePanelRefresh >= 1) { renderEnergy(); sincePanelRefresh = 0; }
    if (sinceSave >= 20) { saveSoon(); sinceSave = 0; }
  });

  renderPanel();
  report('点击水母试试拖动、投喂和繁殖。');
  saveSoon();
  routeMouse(-1, -1);
}

void main().catch((error: unknown) => {
  document.body.textContent = `水母实验室启动失败：${String(error)}`;
});
