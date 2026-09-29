export const GENOME_LENGTH = 512;
export const BASES = 'ACGT' as const;
export type Genome = string;
export type BellShape = 'dome' | 'crown' | 'lantern' | 'lotus' | 'crystal' | 'wing';
export type SpecialBellShape = Exclude<BellShape, 'dome'>;
export type TentacleForm = 'filament' | 'ribbon' | 'starlit';
export type SpecialTentacleForm = Exclude<TentacleForm, 'filament'>;
export type EyeShape = 'dot' | 'line' | 'triangle' | 'smile';
export type SpecialEyeShape = Exclude<EyeShape, 'dot'>;
export type GlowShape = 'circle' | 'cross' | 'star';
export type SpecialGlowShape = Exclude<GlowShape, 'circle'>;

export const EYE_SHAPE_NAMES: Record<EyeShape, string> = {
  dot: '圆点眼', line: '横线眼', triangle: '三角眼', smile: '笑眼',
};
export const GLOW_SHAPE_NAMES: Record<GlowShape, string> = {
  circle: '圆形背光', cross: '十字背光', star: '星形背光',
};

export const TENTACLE_FORM_NAMES: Record<SpecialTentacleForm, string> = {
  ribbon: '丝带触手', starlit: '星尾',
};

export const BELL_SHAPE_NAMES: Record<BellShape, string> = {
  dome: '圆伞', crown: '冠伞', lantern: '灯笼伞', lotus: '莲瓣伞',
  crystal: '水晶伞', wing: '蝶翼伞',
};

export const BELL_PATTERN_NAMES = ['无', '放射纹', '珍珠纹', '光环纹', '流光纹', '星芒纹'] as const;

// Inclusive, zero-based coordinates. The last 16 bp remain silent.
export const GENE_REGIONS = {
  pigmentation: [0, 63],
  bell: [64, 127],
  tentacle: [128, 191],
  body: [192, 239],
  movement: [240, 303],
  physiology: [304, 351],
  regulation: [352, 415],
  special: [416, 463],
  eyes: [464, 479],
  glowShape: [480, 495],
  reserved: [496, 511],
} as const;

export interface Phenotype {
  color: number;
  gradientColor: number;
  gradientStrength: number;
  bellWidth: number;
  bellHeight: number;
  bellCurve: number;
  bellShape: BellShape;
  scallops: number;
  tentacles: number;
  tentacleLength: number;
  filamentWidth: number;
  tentacleSway: number;
  tentacleForm: TentacleForm;
  swimSpeed: number;
  wander: number;
  buoyancy: number;
  toxicity: number;
  metabolism: number;
  resilience: number;
  pulseHz: number;
  glow: number;
  eyeShape: EyeShape;
  glowShape: GlowShape;
  sparkle: number;
  bellPattern: number;
  rare: boolean;
}

// 1 + 2 + 4 + 13*6 = 85; each base contributes 0..3, so the channel spans 0..255.
// The small weights fill every gap between multiples of six. A substitution changes
// one channel by at most 18, even at the largest-weight loci.
const CHANNEL_WEIGHTS = [1, 2, 4, ...Array<number>(13).fill(6)] as const;

export function isGenome(value: unknown): value is Genome {
  return typeof value === 'string' && value.length === GENOME_LENGTH && /^[ACGT]+$/.test(value);
}

export function isLegacyGenome(value: unknown): value is string {
  return typeof value === 'string' && value.length === 100 && /^[ACGT]+$/.test(value);
}

function baseValue(base: string): number {
  return BASES.indexOf(base as (typeof BASES)[number]);
}

function mean(genome: string, start: number, length = 16): number {
  let total = 0;
  for (let index = start; index < start + length; index += 1) total += baseValue(genome[index]);
  return total / (length * 3);
}

function between(value: number, min: number, max: number): number {
  return min + value * (max - min);
}

// Middle values keep the old range. The last 30% of the gene signal
// grows faster, while inherited multi-base means keep that tail scarce.
function highTail(value: number, min: number, oldMax: number, extra: number): number {
  const tail = Math.max(0, (value - 0.7) / 0.3);
  return between(value, min, oldMax) + extra * tail * tail;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function channel(genome: Genome, start: number): number {
  return CHANNEL_WEIGHTS.reduce((value, weight, index) => value + baseValue(genome[start + index]) * weight, 0);
}

export function express(genome: Genome): Phenotype {
  if (!isGenome(genome)) throw new Error('Invalid 512-base genome');
  const red = channel(genome, 0);
  const green = channel(genome, 16);
  const blue = channel(genome, 32);
  const pigmentRegulation = between(mean(genome, 352), 0.85, 1.15);
  const bellRegulation = between(mean(genome, 368), 0.86, 1.14);
  const tentacleRegulation = between(mean(genome, 384), 0.86, 1.14);
  const movementRegulation = between(mean(genome, 400), 0.88, 1.12);
  const bodyScale = between(mean(genome, 192), 0.75, 1.25);
  const proportion = between(mean(genome, 208), 0.88, 1.12);
  const patternSignal = mean(genome, 432);
  const bellWidth = between(mean(genome, 64), 42, 130) * bodyScale * proportion * bellRegulation;
  const bellHeight = between(mean(genome, 80), 19, 68) * bodyScale / proportion * bellRegulation;
  const bellCurve = between(mean(genome, 112), 0.76, 1.2);
  const scallops = Math.round(between(mean(genome, 96), 3, 12));
  const glow = between(mean(genome, 416), 0.2, 1);
  const sparkle = between(mean(genome, 448), 0.15, 1);
  const tentacles = Math.round(between(mean(genome, 128), 3, 18));
  const tentacleLength = highTail(mean(genome, 144), 40, 220, 60) * bodyScale * tentacleRegulation;
  const filamentWidth = between(mean(genome, 160), 0.8, 3.8) * tentacleRegulation;
  const tentacleSway = between(mean(genome, 176), 0.6, 1.5);
  // Existing inherited traits combine into visibly different tentacle motion.
  const tentacleForm: TentacleForm = tentacles <= 12 && tentacleLength >= 130 &&
    glow >= 0.65 && sparkle >= 0.65 ? 'starlit'
    : tentacles <= 13 && tentacleLength >= 120 && filamentWidth >= 2.4 &&
      tentacleSway >= 1.1 ? 'ribbon' : 'filament';
  const bellPattern = patternSignal < 0.56 ? 0 : patternSignal < 0.67 ? 1
    : patternSignal < 0.79 ? 2 : patternSignal < 0.86 ? 3 : patternSignal < 0.94 ? 4 : 5;
  // Each silhouette needs several independently inherited regions to align.
  const bellShape: BellShape = bellPattern === 5 && scallops >= 9 && bellCurve > 1.08 && glow > 0.78 ? 'crystal'
    : bellPattern >= 3 && scallops <= 5 && bellWidth / bellHeight > 2.25 && sparkle > 0.7 ? 'wing'
    : scallops >= 9 && bellCurve < 0.94 && bellPattern >= 1 ? 'lotus'
    : bellHeight / bellWidth > 0.62 && bellCurve > 1.04 && glow > 0.58 ? 'lantern'
    : scallops >= 9 && bellCurve > 1.04 && bellPattern >= 1 ? 'crown' : 'dome';
  const gradientStrength = between(mean(genome, 48), 0.12, 0.4) * pigmentRegulation;
  const eyeSignal = mean(genome, 464);
  const eyeShape: EyeShape = eyeSignal < 0.31 ? 'triangle'
    : eyeSignal < 0.42 ? 'line' : eyeSignal <= 0.68 ? 'dot' : 'smile';
  const glowSignal = mean(genome, 480);
  const glowShape: GlowShape = glowSignal < 0.32 ? 'star' : glowSignal > 0.68 ? 'cross' : 'circle';
  const tone = (mean(genome, 224) - 0.5) * 22;
  const highlight = (value: number, shift: number): number =>
    clampByte(value + (255 - value) * gradientStrength + tone * shift);
  return {
    color: red * 65536 + green * 256 + blue,
    gradientColor: highlight(red, 1) * 65536 + highlight(green, 0.35) * 256 + highlight(blue, -0.6),
    gradientStrength,
    bellWidth,
    bellHeight,
    bellCurve,
    bellShape,
    scallops,
    tentacles,
    tentacleLength,
    filamentWidth,
    tentacleSway,
    tentacleForm,
    swimSpeed: highTail(mean(genome, 240), 15, 54, 30) * movementRegulation,
    wander: between(mean(genome, 256), 0.25, 1.05) * movementRegulation,
    buoyancy: between(mean(genome, 288), -0.4, 0.4),
    toxicity: Math.round(mean(genome, 304) * 100),
    metabolism: between(mean(genome, 320), 0.6, 1.4),
    resilience: between(mean(genome, 336), 0.75, 1.25),
    pulseHz: highTail(mean(genome, 272), 0.55, 1.5, 0.8),
    glow,
    eyeShape,
    glowShape,
    sparkle,
    bellPattern,
    rare: patternSignal > 0.79,
  };
}

export function randomGenome(random: () => number = Math.random): Genome {
  return Array.from({ length: GENOME_LENGTH }, () => BASES[Math.min(3, Math.floor(random() * 4))]).join('');
}

function encodeChannel(value: number): string {
  const highCount = Math.min(39, Math.floor(value / 6));
  const rest = value - highCount * 6;
  const digits = Array<number>(16).fill(0);
  for (let index = 0; index < highCount; index += 1) digits[3 + index % 13] += 1;
  let found = false;
  for (let fours = 0; fours <= 3 && !found; fours += 1) {
    for (let twos = 0; twos <= 3 && !found; twos += 1) {
      const ones = rest - fours * 4 - twos * 2;
      if (ones >= 0 && ones <= 3) {
        digits[0] = ones;
        digits[1] = twos;
        digits[2] = fours;
        found = true;
      }
    }
  }
  if (!found) throw new Error('Cannot encode color channel');
  return digits.map((digit) => BASES[digit]).join('');
}

export function withColor(genome: Genome, color: number): Genome {
  if (!isGenome(genome) || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error('Invalid genome or RGB color');
  }
  return encodeChannel((color >>> 16) & 255) + encodeChannel((color >>> 8) & 255) +
    encodeChannel(color & 255) + genome.slice(48);
}

function setMean(bases: string[], start: number, target: number, length = 16): void {
  const sum = Math.max(0, Math.min(length * 3, Math.round(target * length * 3)));
  const floor = Math.floor(sum / length);
  const remainder = sum % length;
  for (let index = 0; index < length; index += 1) {
    const extra = Math.floor((index + 1) * remainder / length) - Math.floor(index * remainder / length);
    bases[start + index] = BASES[floor + extra];
  }
}

export function founderGenome(random: () => number = Math.random): Genome {
  const bases = randomGenome(random).split('');
  const traitStarts = [48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224,
    240, 256, 272, 288, 304, 320, 336, 352, 368, 384, 400, 416, 448];
  for (const start of traitStarts) setMean(bases, start, 0.1 + random() * 0.8);
  // Average independent draws so very fast and very long founders are uncommon.
  for (const start of [144, 240, 272]) {
    setMean(bases, start, 0.1 + (random() + random() + random()) / 3 * 0.8);
  }
  return bases.join('');
}

// Wild arrivals start near the middle of each trait range. Variation in their
// color and traits is deliberately small; breeding remains the source of variety.
export function wildGenome(random: () => number = Math.random): Genome {
  const bases = founderGenome(random).split('');
  const traitStarts = [48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224,
    240, 256, 272, 288, 304, 320, 336, 352, 368, 384, 400, 416, 448];
  for (const start of traitStarts) setMean(bases, start, 0.44 + random() * 0.12);
  setMean(bases, 432, 0.44 + random() * 0.09);
  const blue = Math.round(0xdf + (random() - 0.5) * 24);
  return withColor(bases.join(''),
    (Math.round(0x70 + (random() - 0.5) * 24) << 16) |
    (Math.round(0xb5 + (random() - 0.5) * 24) << 8) | blue);
}

function legacyFraction(genome: string, start: number): number {
  let value = 0;
  for (let index = start; index < start + 8; index += 1) value = value * 4 + baseValue(genome[index]);
  return value / 65535;
}

export function migrateLegacyGenome(legacy: string): Genome {
  if (!isLegacyGenome(legacy)) throw new Error('Invalid legacy genome');
  const bases = Array.from({ length: GENOME_LENGTH }, (_, index) => BASES[index % 2 ? 2 : 1]);
  const mapping: ReadonlyArray<readonly [number, number]> = [
    [64, 12], [80, 20], [96, 28], [128, 36], [144, 44],
    [160, 84], [240, 52], [256, 60], [272, 76], [304, 68],
  ];
  for (const [newStart, oldStart] of mapping) setMean(bases, newStart, legacyFraction(legacy, oldStart));
  let oldColor = 0;
  for (let index = 0; index < 12; index += 1) oldColor = oldColor * 4 + baseValue(legacy[index]);
  let migrated = withColor(bases.join(''), oldColor);
  if (legacyFraction(legacy, 92) > 0.988) {
    const rareBases = migrated.split('');
    setMean(rareBases, 432, 0.9);
    migrated = rareBases.join('');
  }
  return migrated;
}

export function breedGenomes(
  first: Genome,
  second: Genome,
  random: () => number = Math.random,
  mutationRate = 0.015,
): Genome {
  if (!isGenome(first) || !isGenome(second)) throw new Error('Invalid parent genome');
  if (mutationRate < 0 || mutationRate > 1) throw new Error('Invalid mutation rate');
  const child: string[] = [];
  for (let index = 0; index < GENOME_LENGTH; index += 8) {
    const parent = random() < 0.5 ? first : second;
    for (let offset = 0; offset < 8; offset += 1) {
      let base = parent[index + offset];
      if (random() < mutationRate) {
        const other = Math.min(2, Math.floor(random() * 3));
        base = BASES[(baseValue(base) + 1 + other) % 4];
      }
      child.push(base);
    }
  }
  return child.join('');
}
