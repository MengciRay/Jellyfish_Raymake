import { breedGenomes, express, isGenome, randomGenome, withColor, type Genome } from '../shared/genome';

export interface JellyData {
  id: string;
  name: string;
  genome: Genome;
  x: number;
  y: number;
  ageSeconds: number;
  energy: number;
}

export interface WorldData {
  version: 1;
  bornCount: number;
  jellies: JellyData[];
}

export const MAX_JELLIES = 12;
export const MATURITY_SECONDS = 90;

function newId(): string {
  return crypto.randomUUID();
}

function founder(name: string, color: number, x: number, y: number): JellyData {
  return { id: newId(), name, genome: withColor(randomGenome(), color), x, y, ageSeconds: 120, energy: 0.9 };
}

export function newWorld(): WorldData {
  return {
    version: 1,
    bornCount: 2,
    jellies: [founder('小蓝', 0x75d8f1, 0.32, 0.35), founder('小樱', 0xf4a2da, 0.68, 0.43)],
  };
}

export function parseWorld(value: unknown): WorldData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<WorldData>;
  if (data.version !== 1 || !Array.isArray(data.jellies) || data.jellies.length < 2 || data.jellies.length > MAX_JELLIES ||
      !Number.isSafeInteger(data.bornCount) || (data.bornCount ?? 0) < data.jellies.length) return null;
  if (!data.jellies.every((jelly) =>
    jelly && typeof jelly.id === 'string' && jelly.id.length < 100 &&
    typeof jelly.name === 'string' && jelly.name.length < 40 && isGenome(jelly.genome) &&
    Number.isFinite(jelly.x) && jelly.x >= 0 && jelly.x <= 1 &&
    Number.isFinite(jelly.y) && jelly.y >= 0 && jelly.y <= 1 &&
    Number.isFinite(jelly.ageSeconds) && jelly.ageSeconds >= 0 &&
    Number.isFinite(jelly.energy) && jelly.energy >= 0 && jelly.energy <= 1
  )) return null;
  if (new Set(data.jellies.map((jelly) => jelly.id)).size !== data.jellies.length) return null;
  return data as WorldData;
}

export function feed(jelly: JellyData): void {
  jelly.energy = Math.min(1, jelly.energy + 0.3);
}

export function breed(world: WorldData, first: JellyData, second: JellyData): JellyData {
  if (world.jellies.length >= MAX_JELLIES) throw new Error('水母数量已达上限');
  if (first.id === second.id) throw new Error('请选择另一只亲代');
  if (first.ageSeconds < MATURITY_SECONDS || second.ageSeconds < MATURITY_SECONDS) throw new Error('亲代尚未成熟');
  if (first.energy < 0.3 || second.energy < 0.3) throw new Error('先给亲代喂食吧');
  first.energy -= 0.18;
  second.energy -= 0.18;
  world.bornCount += 1;
  const child: JellyData = {
    id: newId(),
    name: `小水母 ${world.bornCount}`,
    genome: breedGenomes(first.genome, second.genome),
    x: Math.max(0.1, Math.min(0.9, (first.x + second.x) / 2 + (Math.random() - 0.5) * 0.08)),
    y: Math.max(0.15, Math.min(0.8, (first.y + second.y) / 2)),
    ageSeconds: 0,
    energy: 0.7,
  };
  world.jellies.push(child);
  return child;
}

export function traitSummary(jelly: JellyData): string {
  const trait = express(jelly.genome);
  return `${trait.tentacles} 条触手 · 毒性 ${trait.toxicity} · 游速 ${Math.round(trait.swimSpeed)}`;
}
