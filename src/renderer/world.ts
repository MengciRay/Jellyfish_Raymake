import { BELL_PATTERN_NAMES, BELL_SHAPE_NAMES, EYE_SHAPE_NAMES, GLOW_SHAPE_NAMES, breedGenomes, express, founderGenome, wildGenome,
  GENOME_LENGTH, isGenome, isLegacyGenome, migrateLegacyGenome, TENTACLE_FORM_NAMES, withColor,
  type BellShape, type EyeShape, type GlowShape, type Genome, type Phenotype, type SpecialBellShape,
  type SpecialEyeShape, type SpecialGlowShape, type SpecialTentacleForm } from '../shared/genome';

export interface JellyData {
  id: string;
  name: string;
  genome: Genome;
  x: number;
  y: number;
  ageSeconds: number;
  energy: number;
  preyCaught?: number;
  geneEdited?: boolean;
}

export interface WorldData {
  version: 3;
  bornCount: number;
  coins: number;
  coinProgressSeconds: number;
  jellies: JellyData[];
  lineage: LineageRecord[];
  traitRecords: TraitRecords;
  discoveredForms: SpecialTentacleForm[];
  discoveredBellShapes: SpecialBellShape[];
  discoveredBellPatterns: number[];
  discoveredEyeShapes: SpecialEyeShape[];
  discoveredGlowShapes: SpecialGlowShape[];
}

export interface TraitRecord { min: number; max: number }

export function traitRecordValues(traits: Phenotype) {
  const { color, gradientColor, bellShape: _bellShape, tentacleForm: _tentacleForm,
    eyeShape: _eyeShape, glowShape: _glowShape, rare: _rare, ...numeric } = traits;
  return {
    ...numeric,
    colorR: (color >>> 16) & 255, colorG: (color >>> 8) & 255, colorB: color & 255,
    gradientColorR: (gradientColor >>> 16) & 255,
    gradientColorG: (gradientColor >>> 8) & 255,
    gradientColorB: gradientColor & 255,
  };
}

export type TraitRecordKey = keyof ReturnType<typeof traitRecordValues>;
export type TraitRecords = Partial<Record<TraitRecordKey, TraitRecord>>;
const TRAIT_RECORD_KEYS = new Set(Object.keys(traitRecordValues(express('A'.repeat(GENOME_LENGTH)))));

function observeValues(records: TraitRecords, values: Partial<Record<TraitRecordKey, number>>): void {
  for (const [key, value] of Object.entries(values) as [TraitRecordKey, number][]) {
    const previous = records[key];
    records[key] = { min: Math.min(previous?.min ?? value, value), max: Math.max(previous?.max ?? value, value) };
  }
}

export function recordTraits(world: WorldData, jelly: JellyData): void {
  observeValues(world.traitRecords, traitRecordValues(express(jelly.genome)));
}

function formsAmong(jellies: JellyData[]): SpecialTentacleForm[] {
  const found = new Set<SpecialTentacleForm>();
  for (const jelly of jellies) {
    const form = express(jelly.genome).tentacleForm;
    if (form !== 'filament') found.add(form);
  }
  return [...found];
}

function bellShapesAmong(jellies: JellyData[], lineage: LineageRecord[]): SpecialBellShape[] {
  const found = new Set<SpecialBellShape>();
  for (const jelly of jellies) {
    const shape = express(jelly.genome).bellShape;
    if (shape !== 'dome') found.add(shape);
  }
  for (const record of lineage) {
    const shape = record.traits?.bellShape;
    if (shape && shape !== 'dome') found.add(shape);
  }
  return [...found];
}

function bellPatternsAmong(jellies: JellyData[], lineage: LineageRecord[]): number[] {
  const found = new Set<number>();
  for (const jelly of jellies) {
    const pattern = express(jelly.genome).bellPattern;
    if (pattern > 0) found.add(pattern);
  }
  for (const record of lineage) {
    const pattern = record.traits?.bellPattern;
    if (pattern && pattern > 0) found.add(pattern);
  }
  return [...found];
}

function eyeShapesAmong(jellies: JellyData[], lineage: LineageRecord[]): SpecialEyeShape[] {
  const found = new Set<SpecialEyeShape>();
  for (const jelly of jellies) {
    const shape = express(jelly.genome).eyeShape;
    if (shape !== 'dot') found.add(shape);
  }
  for (const record of lineage) {
    const shape = record.traits?.eyeShape;
    if (shape && shape !== 'dot') found.add(shape);
  }
  return [...found];
}

function glowShapesAmong(jellies: JellyData[], lineage: LineageRecord[]): SpecialGlowShape[] {
  const found = new Set<SpecialGlowShape>();
  for (const jelly of jellies) {
    const shape = express(jelly.genome).glowShape;
    if (shape !== 'circle') found.add(shape);
  }
  for (const record of lineage) {
    const shape = record.traits?.glowShape;
    if (shape && shape !== 'circle') found.add(shape);
  }
  return [...found];
}

export function discoverTentacleForm(world: WorldData, jelly: JellyData): SpecialTentacleForm | null {
  const form = express(jelly.genome).tentacleForm;
  if (form === 'filament' || world.discoveredForms.includes(form)) return null;
  world.discoveredForms.push(form);
  return form;
}

export function discoverSpecialTraits(world: WorldData, jelly: JellyData): string[] {
  const found: string[] = [];
  const form = discoverTentacleForm(world, jelly);
  if (form) found.push(TENTACLE_FORM_NAMES[form]);
  const traits = express(jelly.genome);
  if (traits.bellShape !== 'dome' && !world.discoveredBellShapes.includes(traits.bellShape)) {
    world.discoveredBellShapes.push(traits.bellShape);
    found.push(BELL_SHAPE_NAMES[traits.bellShape]);
  }
  if (traits.bellPattern > 0 && !world.discoveredBellPatterns.includes(traits.bellPattern)) {
    world.discoveredBellPatterns.push(traits.bellPattern);
    found.push(BELL_PATTERN_NAMES[traits.bellPattern]);
  }
  if (traits.eyeShape !== 'dot' && !world.discoveredEyeShapes.includes(traits.eyeShape)) {
    world.discoveredEyeShapes.push(traits.eyeShape);
    found.push(EYE_SHAPE_NAMES[traits.eyeShape]);
  }
  if (traits.glowShape !== 'circle' && !world.discoveredGlowShapes.includes(traits.glowShape)) {
    world.discoveredGlowShapes.push(traits.glowShape);
    found.push(GLOW_SHAPE_NAMES[traits.glowShape]);
  }
  return found;
}

function snapshotRecordValues(snapshot: TraitSnapshot): Partial<Record<TraitRecordKey, number>> {
  return {
    bellWidth: snapshot.bellWidth, tentacles: snapshot.tentacles,
    tentacleLength: snapshot.tentacleLength, swimSpeed: snapshot.swimSpeed,
    toxicity: snapshot.toxicity, bellPattern: snapshot.bellPattern,
    colorR: (snapshot.color >>> 16) & 255,
    colorG: (snapshot.color >>> 8) & 255,
    colorB: snapshot.color & 255,
  };
}

function restoreTraitRecords(jellies: JellyData[], lineage: LineageRecord[], saved: TraitRecords = {}): TraitRecords {
  const records: TraitRecords = { ...saved };
  for (const entry of lineage) if (entry.traits) observeValues(records, snapshotRecordValues(entry.traits));
  for (const jelly of jellies) observeValues(records, traitRecordValues(express(jelly.genome)));
  return records;
}

function validTraitRecords(value: unknown): value is TraitRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, range]) =>
    TRAIT_RECORD_KEYS.has(key) && !!range && typeof range === 'object' &&
    typeof (range as TraitRecord).min === 'number' && Number.isFinite((range as TraitRecord).min) &&
    typeof (range as TraitRecord).max === 'number' && Number.isFinite((range as TraitRecord).max) &&
    (range as TraitRecord).min <= (range as TraitRecord).max);
}

export interface LineageRecord {
  id: string;
  name: string;
  parentIds: [string, string] | null;
  traits?: TraitSnapshot;
}

export interface TraitSnapshot {
  color: number;
  bellWidth: number;
  tentacles: number;
  tentacleLength: number;
  swimSpeed: number;
  toxicity: number;
  bellPattern: number;
  bellShape?: BellShape;
  eyeShape?: EyeShape;
  glowShape?: GlowShape;
}

export function traitSnapshot(jelly: JellyData): TraitSnapshot {
  const { color, bellWidth, tentacles, tentacleLength, swimSpeed, toxicity, bellPattern, bellShape, eyeShape, glowShape } = express(jelly.genome);
  return { color, bellWidth, tentacles, tentacleLength, swimSpeed, toxicity, bellPattern, bellShape, eyeShape, glowShape };
}

export const MAX_JELLIES = 16;
export const MATURITY_SECONDS = 90;
export const MAX_NAME_LENGTH = 20;
export const COIN_INTERVAL_SECONDS = 10;
export const MAX_GENE_EDITS = 5;
const GENE_EDIT_COSTS = [0, 100, 500, 3000, 21000, 168000] as const;

export interface GeneEdit { index: number; base: string }

export function geneEditCost(count: number): number {
  if (!Number.isInteger(count) || count < 1 || count > MAX_GENE_EDITS) {
    throw new Error('一次只能修改 1–5 个碱基');
  }
  return GENE_EDIT_COSTS[count];
}

export function editGenes(world: WorldData, jelly: JellyData, edits: readonly GeneEdit[]): number {
  if (!world.jellies.includes(jelly)) throw new Error('找不到这只水母');
  if (jelly.geneEdited) throw new Error('这只水母已经进行过基因编辑');
  const cost = geneEditCost(edits.length);
  const positions = new Set<number>();
  for (const { index, base } of edits) {
    if (!Number.isInteger(index) || index < 0 || index >= jelly.genome.length ||
        !'ACGT'.includes(base) || base.length !== 1 || positions.has(index) || jelly.genome[index] === base) {
      throw new Error('请选择不同的位置，并将碱基改为 A、C、G 或 T');
    }
    positions.add(index);
  }
  if (world.coins < cost) throw new Error(`金币不足，需要 ${cost} 金币`);
  const bases = jelly.genome.split('');
  for (const { index, base } of edits) bases[index] = base;
  jelly.genome = bases.join('');
  jelly.geneEdited = true;
  world.coins -= cost;
  recordTraits(world, jelly);
  return cost;
}

// A typical wild jelly is blue and close to the middle of each inherited trait range.
const COIN_TRAITS = [
  ['bellWidth', 86, 23, 208], ['bellHeight', 44, 10, 111],
  ['bellCurve', 0.98, 0.76, 1.2], ['scallops', 8, 3, 12],
  ['tentacles', 11, 3, 18], ['tentacleLength', 130, 25, 400],
  ['filamentWidth', 2.3, 0.68, 4.34], ['tentacleSway', 1.05, 0.6, 1.5],
  ['swimSpeed', 34.5, 13, 95], ['wander', 0.65, 0.22, 1.18],
  ['buoyancy', 0, -0.4, 0.4], ['pulseHz', 1.025, 0.55, 2.3],
  ['toxicity', 50, 0, 100], ['metabolism', 1, 0.6, 1.4],
  ['resilience', 1, 0.75, 1.25], ['glow', 0.6, 0.2, 1],
  ['sparkle', 0.575, 0.15, 1],
] as const;

export function coinYield(jelly: JellyData): number {
  const traits = express(jelly.genome);
  const deviation = COIN_TRAITS.reduce((total, [key, normal, min, max]) =>
    total + Math.abs(traits[key] - normal) / (max - min), 0);
  const red = (traits.color >>> 16) & 255;
  const green = (traits.color >>> 8) & 255;
  const blue = traits.color & 255;
  const colorDeviation = (Math.abs(red - 0x70) + Math.abs(green - 0xb5) + Math.abs(blue - 0xdf)) / 255;
  return Math.max(1, Math.round(1 + deviation * 3 + colorDeviation * 2 +
    traits.bellPattern * 1.5 + (traits.bellShape === 'dome' ? 0 : 2)));
}

export function collectCoins(world: WorldData, elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid coin clock interval');
  const elapsed = world.coinProgressSeconds + elapsedSeconds;
  const cycles = Math.floor(elapsed / COIN_INTERVAL_SECONDS);
  world.coinProgressSeconds = elapsed - cycles * COIN_INTERVAL_SECONDS;
  if (!cycles) return 0;
  const perCycle = world.jellies.reduce((total, jelly) => total + coinYield(jelly), 0);
  const earned = Math.min(Number.MAX_SAFE_INTEGER - world.coins, cycles * perCycle);
  world.coins += earned;
  return earned;
}

export function energySpeedFactor(energy: number): number {
  return 0.2 + Math.max(0, Math.min(1, energy)) * 0.8;
}

export function preyCaptureChance(jelly: JellyData): number {
  const traits = express(jelly.genome);
  return Math.min(0.9, 0.08 + traits.toxicity * 0.0075 + traits.tentacleLength / 1800);
}

export function huntPlankton(jelly: JellyData, random: () => number = Math.random): boolean {
  if (random() >= preyCaptureChance(jelly)) return false;
  jelly.energy = Math.min(1, jelly.energy + 0.006);
  jelly.preyCaught = (jelly.preyCaught ?? 0) + 1;
  return true;
}

function newId(): string {
  return crypto.randomUUID();
}

function founder(name: string, color: number, x: number, y: number): JellyData {
  return { id: newId(), name, genome: withColor(founderGenome(), color), x, y, ageSeconds: 120, energy: 0.9,
    preyCaught: 0, geneEdited: false };
}

export function newWorld(): WorldData {
  const jellies = [founder('小蓝', 0x75d8f1, 0.32, 0.35), founder('小樱', 0xf4a2da, 0.68, 0.43)];
  return {
    version: 3,
    bornCount: 2,
    coins: 0,
    coinProgressSeconds: 0,
    jellies,
    lineage: jellies.map((jelly) => ({ id: jelly.id, name: jelly.name, parentIds: null, traits: traitSnapshot(jelly) })),
    traitRecords: restoreTraitRecords(jellies, []),
    discoveredForms: formsAmong(jellies),
    discoveredBellShapes: bellShapesAmong(jellies, []),
    discoveredBellPatterns: bellPatternsAmong(jellies, []),
    discoveredEyeShapes: eyeShapesAmong(jellies, []),
    discoveredGlowShapes: glowShapesAmong(jellies, []),
  };
}

function validJelly(value: unknown, genomeCheck: (value: unknown) => boolean): value is JellyData {
  if (!value || typeof value !== 'object') return false;
  const jelly = value as Partial<JellyData>;
  return typeof jelly.id === 'string' && jelly.id.length > 0 && jelly.id.length < 100 &&
    typeof jelly.name === 'string' && jelly.name.length <= 40 && genomeCheck(jelly.genome) &&
    typeof jelly.x === 'number' && Number.isFinite(jelly.x) && jelly.x >= 0 && jelly.x <= 1 &&
    typeof jelly.y === 'number' && Number.isFinite(jelly.y) && jelly.y >= 0 && jelly.y <= 1 &&
    typeof jelly.ageSeconds === 'number' && Number.isFinite(jelly.ageSeconds) && jelly.ageSeconds >= 0 &&
    typeof jelly.energy === 'number' && Number.isFinite(jelly.energy) && jelly.energy >= 0 && jelly.energy <= 1 &&
    (jelly.preyCaught === undefined || (Number.isSafeInteger(jelly.preyCaught) && jelly.preyCaught >= 0)) &&
    (jelly.geneEdited === undefined || typeof jelly.geneEdited === 'boolean');
}

export function parseWorld(value: unknown): WorldData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as { version?: unknown; bornCount?: unknown; coins?: unknown;
    coinProgressSeconds?: unknown; jellies?: unknown; lineage?: unknown; traitRecords?: unknown;
    discoveredForms?: unknown; discoveredBellShapes?: unknown; discoveredBellPatterns?: unknown;
    discoveredEyeShapes?: unknown; discoveredGlowShapes?: unknown };
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) return null;
  if (!Array.isArray(data.jellies) || data.jellies.length > MAX_JELLIES ||
      !Number.isSafeInteger(data.bornCount) || (data.bornCount as number) < data.jellies.length) return null;
  const check = data.version === 1 ? isLegacyGenome : isGenome;
  if (!data.jellies.every((jelly: unknown) => validJelly(jelly, check))) return null;
  if (new Set(data.jellies.map((jelly: JellyData) => jelly.id)).size !== data.jellies.length) return null;
  const jellies = data.version === 1
    ? data.jellies.map((jelly: JellyData) => ({ ...jelly, genome: migrateLegacyGenome(jelly.genome) }))
    : data.jellies as JellyData[];
  if (data.version !== 3) return {
    version: 3,
    bornCount: data.bornCount as number,
    coins: 0,
    coinProgressSeconds: 0,
    jellies,
    lineage: jellies.map((jelly) => ({ id: jelly.id, name: jelly.name, parentIds: null, traits: traitSnapshot(jelly) })),
    traitRecords: restoreTraitRecords(jellies, []),
    discoveredForms: formsAmong(jellies),
    discoveredBellShapes: bellShapesAmong(jellies, []),
    discoveredBellPatterns: bellPatternsAmong(jellies, []),
    discoveredEyeShapes: eyeShapesAmong(jellies, []),
    discoveredGlowShapes: glowShapesAmong(jellies, []),
  };
  if (!Array.isArray(data.lineage) || data.lineage.length > 10000 ||
      data.lineage.length > (data.bornCount as number) ||
      !data.lineage.every((record: unknown) => validLineageRecord(record))) return null;
  const coins = data.coins === undefined ? 0 : data.coins;
  const coinProgressSeconds = data.coinProgressSeconds === undefined ? 0 : data.coinProgressSeconds;
  if (!Number.isSafeInteger(coins) || (coins as number) < 0 ||
      typeof coinProgressSeconds !== 'number' || !Number.isFinite(coinProgressSeconds) ||
      coinProgressSeconds < 0 || coinProgressSeconds >= COIN_INTERVAL_SECONDS) return null;
  if (data.traitRecords !== undefined && !validTraitRecords(data.traitRecords)) return null;
  if (data.discoveredForms !== undefined && (!Array.isArray(data.discoveredForms) ||
      data.discoveredForms.length > Object.keys(TENTACLE_FORM_NAMES).length ||
      data.discoveredForms.some((form: unknown) => typeof form !== 'string' ||
        !Object.prototype.hasOwnProperty.call(TENTACLE_FORM_NAMES, form)) ||
      new Set(data.discoveredForms).size !== data.discoveredForms.length)) return null;
  if (data.discoveredBellShapes !== undefined && (!Array.isArray(data.discoveredBellShapes) ||
      data.discoveredBellShapes.length > 5 ||
      data.discoveredBellShapes.some((shape: unknown) => typeof shape !== 'string' || shape === 'dome' ||
        !Object.prototype.hasOwnProperty.call(BELL_SHAPE_NAMES, shape)) ||
      new Set(data.discoveredBellShapes).size !== data.discoveredBellShapes.length)) return null;
  if (data.discoveredBellPatterns !== undefined && (!Array.isArray(data.discoveredBellPatterns) ||
      data.discoveredBellPatterns.length > 5 ||
      data.discoveredBellPatterns.some((pattern: unknown) => !Number.isInteger(pattern) ||
        (pattern as number) < 1 || (pattern as number) >= BELL_PATTERN_NAMES.length) ||
      new Set(data.discoveredBellPatterns).size !== data.discoveredBellPatterns.length)) return null;
  if (data.discoveredEyeShapes !== undefined && (!Array.isArray(data.discoveredEyeShapes) ||
      data.discoveredEyeShapes.length > 3 ||
      data.discoveredEyeShapes.some((shape: unknown) => typeof shape !== 'string' || shape === 'dot' ||
        !Object.prototype.hasOwnProperty.call(EYE_SHAPE_NAMES, shape)) ||
      new Set(data.discoveredEyeShapes).size !== data.discoveredEyeShapes.length)) return null;
  if (data.discoveredGlowShapes !== undefined && (!Array.isArray(data.discoveredGlowShapes) ||
      data.discoveredGlowShapes.length > 2 ||
      data.discoveredGlowShapes.some((shape: unknown) => typeof shape !== 'string' || shape === 'circle' ||
        !Object.prototype.hasOwnProperty.call(GLOW_SHAPE_NAMES, shape)) ||
      new Set(data.discoveredGlowShapes).size !== data.discoveredGlowShapes.length)) return null;
  const lineage = data.lineage as LineageRecord[];
  const records = new Map(lineage.map((record) => [record.id, record]));
  if (records.size !== lineage.length || jellies.some((jelly) => !records.has(jelly.id))) return null;
  for (const record of lineage) {
    if (record.parentIds && (record.parentIds[0] === record.parentIds[1] ||
        record.parentIds.some((id) => id === record.id || !records.has(id)))) return null;
  }
  // Parents must precede descendants in the archive. This also rules out cycles.
  const seen = new Set<string>();
  for (const record of lineage) {
    if (record.parentIds?.some((id) => !seen.has(id))) return null;
    seen.add(record.id);
  }
  return {
    version: 3,
    bornCount: data.bornCount as number,
    coins: coins as number,
    coinProgressSeconds,
    jellies,
    lineage,
    traitRecords: restoreTraitRecords(jellies, lineage, data.traitRecords as TraitRecords | undefined),
    discoveredForms: data.discoveredForms === undefined ? formsAmong(jellies)
      : [...new Set([...(data.discoveredForms as SpecialTentacleForm[]), ...formsAmong(jellies)])],
    discoveredBellShapes: [...new Set([
      ...(data.discoveredBellShapes as SpecialBellShape[] | undefined ?? []), ...bellShapesAmong(jellies, lineage),
    ])],
    discoveredBellPatterns: [...new Set([
      ...(data.discoveredBellPatterns as number[] | undefined ?? []), ...bellPatternsAmong(jellies, lineage),
    ])],
    discoveredEyeShapes: [...new Set([
      ...(data.discoveredEyeShapes as SpecialEyeShape[] | undefined ?? []), ...eyeShapesAmong(jellies, lineage),
    ])],
    discoveredGlowShapes: [...new Set([
      ...(data.discoveredGlowShapes as SpecialGlowShape[] | undefined ?? []), ...glowShapesAmong(jellies, lineage),
    ])],
  };
}

function validLineageRecord(value: unknown): value is LineageRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LineageRecord>;
  return typeof record.id === 'string' && record.id.length > 0 && record.id.length < 100 &&
    typeof record.name === 'string' && record.name.length <= 40 &&
    (record.parentIds === null || (Array.isArray(record.parentIds) && record.parentIds.length === 2 &&
      record.parentIds.every((id: unknown) => typeof id === 'string' && id.length > 0 && id.length < 100))) &&
    (record.traits === undefined || validTraitSnapshot(record.traits));
}

function validTraitSnapshot(value: unknown): value is TraitSnapshot {
  if (!value || typeof value !== 'object') return false;
  const traits = value as Partial<TraitSnapshot>;
  return Number.isInteger(traits.color) && traits.color! >= 0 && traits.color! <= 0xffffff &&
    typeof traits.bellWidth === 'number' && Number.isFinite(traits.bellWidth) && traits.bellWidth > 0 && traits.bellWidth < 300 &&
    Number.isInteger(traits.tentacles) && traits.tentacles! >= 3 && traits.tentacles! <= 18 &&
    typeof traits.tentacleLength === 'number' && Number.isFinite(traits.tentacleLength) && traits.tentacleLength > 0 && traits.tentacleLength <= 400 &&
    typeof traits.swimSpeed === 'number' && Number.isFinite(traits.swimSpeed) && traits.swimSpeed >= 0 && traits.swimSpeed < 100 &&
    Number.isInteger(traits.toxicity) && traits.toxicity! >= 0 && traits.toxicity! <= 100 &&
    Number.isInteger(traits.bellPattern) && traits.bellPattern! >= 0 && traits.bellPattern! <= 5 &&
    (traits.bellShape === undefined || Object.prototype.hasOwnProperty.call(BELL_SHAPE_NAMES, traits.bellShape)) &&
    (traits.eyeShape === undefined || Object.prototype.hasOwnProperty.call(EYE_SHAPE_NAMES, traits.eyeShape)) &&
    (traits.glowShape === undefined || Object.prototype.hasOwnProperty.call(GLOW_SHAPE_NAMES, traits.glowShape));
}

export function introduce(world: WorldData): JellyData {
  if (world.jellies.length >= MAX_JELLIES) throw new Error('水母数量已达上限');
  world.bornCount += 1;
  const jelly: JellyData = {
    id: newId(),
    name: `野生水母 ${world.bornCount}`,
    genome: wildGenome(),
    x: 0.22 + Math.random() * 0.56,
    y: 0.25 + Math.random() * 0.45,
    ageSeconds: 120,
    energy: 0.9,
    preyCaught: 0,
    geneEdited: false,
  };
  world.jellies.push(jelly);
  world.lineage.push({ id: jelly.id, name: jelly.name, parentIds: null, traits: traitSnapshot(jelly) });
  recordTraits(world, jelly);
  return jelly;
}

export function renameJelly(world: WorldData, jelly: JellyData, requestedName: string): string {
  if (!world.jellies.includes(jelly)) throw new Error('找不到这只水母');
  const name = requestedName.trim();
  if (!name || Array.from(name).length > MAX_NAME_LENGTH || /[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`名字需为 1–${MAX_NAME_LENGTH} 个字符，且不能包含控制字符`);
  }
  jelly.name = name;
  const record = world.lineage.find((entry) => entry.id === jelly.id);
  if (record) record.name = name;
  return name;
}

export function removeJelly(world: WorldData, id: string): JellyData {
  const index = world.jellies.findIndex((jelly) => jelly.id === id);
  if (index < 0) throw new Error('找不到这只水母');
  return world.jellies.splice(index, 1)[0];
}

export function feed(jelly: JellyData): void {
  jelly.energy = Math.min(1, jelly.energy + 0.3);
}

export function breed(world: WorldData, first: JellyData, second: JellyData): JellyData {
  if (world.jellies.length >= MAX_JELLIES) throw new Error('水母数量已达上限');
  if (!world.jellies.includes(first) || !world.jellies.includes(second)) throw new Error('亲代不在养护箱中');
  if (first.id === second.id) throw new Error('请选择两只不同的亲代');
  if (first.ageSeconds < MATURITY_SECONDS || second.ageSeconds < MATURITY_SECONDS) throw new Error('亲代尚未成熟');
  if (first.energy < 0.3 || second.energy < 0.3) throw new Error('先给亲代喂食吧');
  first.energy -= 0.18;
  second.energy -= 0.18;
  for (const parent of [first, second]) {
    const record = world.lineage.find((entry) => entry.id === parent.id);
    if (record && !record.traits) record.traits = traitSnapshot(parent);
  }
  world.bornCount += 1;
  const child: JellyData = {
    id: newId(),
    name: `小水母 ${world.bornCount}`,
    genome: breedGenomes(first.genome, second.genome),
    x: Math.max(0.1, Math.min(0.9, (first.x + second.x) / 2 + (Math.random() - 0.5) * 0.08)),
    y: Math.max(0.15, Math.min(0.8, (first.y + second.y) / 2)),
    ageSeconds: 0,
    energy: 0.7,
    preyCaught: 0,
    geneEdited: false,
  };
  world.jellies.push(child);
  world.lineage.push({ id: child.id, name: child.name, parentIds: [first.id, second.id], traits: traitSnapshot(child) });
  recordTraits(world, child);
  return child;
}

export function traitSummary(jelly: JellyData): string {
  const trait = express(jelly.genome);
  const form = trait.tentacleForm === 'filament' ? '' : ` · ${TENTACLE_FORM_NAMES[trait.tentacleForm]}`;
  return `${trait.tentacles} 条触手 · 毒性 ${trait.toxicity} · 游速 ${Math.round(trait.swimSpeed)}${form}`;
}
