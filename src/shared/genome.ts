export const GENOME_LENGTH = 100;
export const BASES = 'ACGT' as const;

export type Genome = string;

export interface Phenotype {
  color: number;
  bellWidth: number;
  bellHeight: number;
  scallops: number;
  tentacles: number;
  tentacleLength: number;
  filamentWidth: number;
  swimSpeed: number;
  wander: number;
  toxicity: number;
  pulseHz: number;
  rare: boolean;
}

export function isGenome(value: unknown): value is Genome {
  return typeof value === 'string' && value.length === GENOME_LENGTH && /^[ACGT]+$/.test(value);
}

function baseValue(base: string): number {
  return BASES.indexOf(base as (typeof BASES)[number]);
}

function readBases(genome: Genome, start: number, length: number): number {
  let value = 0;
  for (let index = start; index < start + length; index += 1) {
    value = value * 4 + baseValue(genome[index]);
  }
  return value;
}

function fraction(genome: Genome, start: number, length = 8): number {
  return readBases(genome, start, length) / (4 ** length - 1);
}

function between(value: number, min: number, max: number): number {
  return min + value * (max - min);
}

export function express(genome: Genome): Phenotype {
  if (!isGenome(genome)) throw new Error('Invalid 100-base genome');
  return {
    // Twelve bases are exactly 24 bits, so these are the RGB bytes without a palette lookup.
    color: readBases(genome, 0, 12),
    bellWidth: between(fraction(genome, 12), 52, 106),
    bellHeight: between(fraction(genome, 20), 25, 52),
    scallops: Math.round(between(fraction(genome, 28), 4, 9)),
    tentacles: Math.round(between(fraction(genome, 36), 5, 12)),
    tentacleLength: between(fraction(genome, 44), 65, 165),
    swimSpeed: between(fraction(genome, 52), 15, 55),
    wander: between(fraction(genome, 60), 0.25, 1),
    toxicity: Math.round(fraction(genome, 68) * 100),
    pulseHz: between(fraction(genome, 76), 0.55, 1.5),
    filamentWidth: between(fraction(genome, 84), 1, 3.2),
    rare: fraction(genome, 92) > 0.988,
  };
}

export function randomGenome(random: () => number = Math.random): Genome {
  return Array.from({ length: GENOME_LENGTH }, () => BASES[Math.min(3, Math.floor(random() * 4))]).join('');
}

export function withColor(genome: Genome, color: number): Genome {
  if (!isGenome(genome) || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error('Invalid genome or RGB color');
  }
  const encoded = Array.from({ length: 12 }, (_, index) => BASES[(color >>> (22 - index * 2)) & 3]).join('');
  return encoded + genome.slice(12);
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
  // Inherit four-base blocks. RGB channels and other traits can recombine visibly.
  for (let index = 0; index < GENOME_LENGTH; index += 4) {
    const parent = random() < 0.5 ? first : second;
    for (let offset = 0; offset < 4; offset += 1) {
      let base = parent[index + offset];
      if (random() < mutationRate) {
        const alternatives = BASES.split('').filter((candidate) => candidate !== base);
        base = alternatives[Math.min(2, Math.floor(random() * 3))];
      }
      child.push(base);
    }
  }
  return child.join('');
}
