import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { express, founderGenome, withColor, type Genome } from '../src/shared/genome';
import { MAX_JELLIES, parseWorld, recordTraits, traitSnapshot, type JellyData } from '../src/renderer/world';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: showcase-save <source world.json> <output world.json>');

function setMean(bases: string[], start: number, target: number): void {
  const total = Math.round(target * 48);
  const low = Math.floor(total / 16);
  for (let index = 0; index < 16; index += 1) {
    bases[start + index] = 'ACGT'[low + (index < total % 16 ? 1 : 0)];
  }
}

function showcaseGenome(color: number, blocks: ReadonlyArray<readonly [number, number]>): Genome {
  const bases = founderGenome(() => 0.5).split('');
  for (const [start, target] of blocks) setMean(bases, start, target);
  return withColor(bases.join(''), color);
}

const specimens = [
  {
    name: '展示·金冠', color: 0xffc94d, x: 0.16, y: 0.24,
    blocks: [[96, 0.96], [112, 0.88], [432, 0.88], [416, 0.86], [128, 0.82],
      [144, 0.82], [304, 0.88], [64, 0.72]] as const,
    shape: 'crown',
  },
  {
    name: '展示·莲影', color: 0xfa78c3, x: 0.37, y: 0.32,
    blocks: [[96, 0.94], [112, 0.13], [432, 0.75], [416, 0.76], [128, 0.18],
      [144, 0.88], [160, 0.82], [448, 0.9]] as const,
    shape: 'lotus',
  },
  {
    name: '展示·星灯', color: 0x59e5e5, x: 0.59, y: 0.24,
    blocks: [[64, 0.12], [80, 0.94], [96, 0.3], [112, 0.88], [416, 0.95],
      [432, 0.9], [128, 0.94], [144, 0.92], [448, 0.95]] as const,
    shape: 'lantern',
  },
] as const;

async function main(): Promise<void> {
  const world = parseWorld(JSON.parse(await readFile(input, 'utf8')) as unknown);
  if (!world) throw new Error('Source save is invalid');
  if (world.jellies.length + specimens.length > MAX_JELLIES) throw new Error('Not enough room for showcase jellies');
  if (specimens.some((specimen) => world.lineage.some((entry) => entry.name === specimen.name))) {
    throw new Error('Showcase jellies are already present');
  }
  for (const specimen of specimens) {
    const genome = showcaseGenome(specimen.color, specimen.blocks);
    const traits = express(genome);
    if (traits.bellShape !== specimen.shape) throw new Error(`Unexpected shape for ${specimen.name}`);
    const jelly: JellyData = {
      id: randomUUID(), name: specimen.name, genome, x: specimen.x, y: specimen.y,
      ageSeconds: 300, energy: 0.95, preyCaught: 0, geneEdited: false,
    };
    world.bornCount += 1;
    world.jellies.push(jelly);
    world.lineage.push({ id: jelly.id, name: jelly.name, parentIds: null, traits: traitSnapshot(jelly) });
    recordTraits(world, jelly);
    process.stdout.write(`${specimen.name}: ${traits.bellShape}, ${traits.tentacles} tentacles, ${traits.bellPattern} pattern\n`);
  }
  if (!parseWorld(world)) throw new Error('Generated save failed validation');
  await writeFile(output, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
