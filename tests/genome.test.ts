import { describe, expect, it } from 'vitest';
import { BASES, breedGenomes, express, founderGenome, GENOME_LENGTH, GENE_REGIONS,
  isGenome, migrateLegacyGenome, randomGenome, withColor } from '../src/shared/genome';

describe('512 bp virtual genome', () => {
  it('covers all positions exactly once', () => {
    const regions = Object.values(GENE_REGIONS);
    expect(regions[0][0]).toBe(0);
    expect(regions.at(-1)?.[1]).toBe(GENOME_LENGTH - 1);
    for (let index = 1; index < regions.length; index += 1) {
      expect(regions[index][0]).toBe(regions[index - 1][1] + 1);
    }
  });

  it('can express every 8-bit value in each RGB channel', () => {
    const blank = 'A'.repeat(GENOME_LENGTH);
    for (let value = 0; value <= 255; value += 1) {
      const rgb = (value << 16) | ((255 - value) << 8) | value;
      expect(express(withColor(blank, rgb)).color).toBe(rgb);
    }
  });

  it('bounds the effect of a single substitution on shape and color', () => {
    const genome = withColor(founderGenome(() => 0.37), 0x7fa9e3);
    const original = express(genome);
    for (let index = 0; index < GENOME_LENGTH; index += 1) {
      for (const base of BASES) {
        if (base === genome[index]) continue;
        const mutated = express(genome.slice(0, index) + base + genome.slice(index + 1));
        for (const shift of [0, 8, 16]) {
          expect(Math.abs(((mutated.color >>> shift) & 255) - ((original.color >>> shift) & 255))).toBeLessThanOrEqual(18);
        }
        expect(Math.abs(mutated.bellWidth - original.bellWidth)).toBeLessThan(7);
        expect(Math.abs(mutated.bellHeight - original.bellHeight)).toBeLessThan(4);
        expect(Math.abs(mutated.tentacleLength - original.tentacleLength)).toBeLessThan(10);
        expect(Math.abs(mutated.scallops - original.scallops)).toBeLessThanOrEqual(1);
        expect(Math.abs(mutated.tentacles - original.tentacles)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps reserved bases silent in this genome version', () => {
    const genome = randomGenome(() => 0.45);
    const changed = genome.slice(0, 496) + 'T'.repeat(16);
    expect(express(changed)).toEqual(express(genome));
  });

  it('uses inherited eye and backlight genes without changing genome length', () => {
    const replace = (genome: string, start: number, base: string): string =>
      genome.slice(0, start) + base.repeat(16) + genome.slice(start + 16);
    const normal = 'ACGT'.repeat(GENOME_LENGTH / 4);
    expect(express(normal).eyeShape).toBe('dot');
    expect(express(normal).glowShape).toBe('circle');
    expect(express(replace(normal, 464, 'A')).eyeShape).toBe('triangle');
    expect(express(replace(normal, 464, 'T')).eyeShape).toBe('smile');
    expect(express(replace(normal, 464, 'C')).eyeShape).toBe('line');
    expect(express(replace(normal, 480, 'A')).glowShape).toBe('star');
    expect(express(replace(normal, 480, 'T')).glowShape).toBe('cross');
  });

  it('makes high motion and length values striking but uncommon', () => {
    const low = express('A'.repeat(GENOME_LENGTH));
    const mid = express('C'.repeat(GENOME_LENGTH));
    const high = express('T'.repeat(GENOME_LENGTH));
    expect(high.tentacleLength).toBeCloseTo(399);
    expect(high.swimSpeed).toBeCloseTo(94.08);
    expect(high.pulseHz).toBeCloseTo(2.3);
    expect(mid.tentacleLength).toBeLessThan(140);
    expect(mid.swimSpeed).toBeLessThan(40);
    expect(mid.pulseHz).toBeLessThan(1.1);
    let seed = 1234567;
    const random = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const founders = Array.from({ length: 1000 }, () => express(founderGenome(random)));
    expect(founders.filter((traits) => traits.pulseHz > 1.5).length).toBeLessThan(50);
    expect(founders.filter((traits) => traits.swimSpeed > 61).length).toBeLessThan(50);
  });

  it('expresses distinct moving tentacle forms from inherited trait combinations', () => {
    const replace = (genome: string, start: number, base: string): string =>
      genome.slice(0, start) + base.repeat(16) + genome.slice(start + 16);
    const baseline = replace('C'.repeat(GENOME_LENGTH), 128, 'A');
    const long = replace(baseline, 144, 'T');
    const ribbon = replace(replace(long, 160, 'T'), 176, 'T');
    expect(express(baseline).tentacleForm).toBe('filament');
    expect(express(ribbon).tentacleForm).toBe('ribbon');
    expect(express(replace(ribbon, 176, 'A')).tentacleForm).toBe('filament');
    const starlit = replace(replace(long, 416, 'T'), 448, 'T');
    expect(express(starlit).tentacleForm).toBe('starlit');
    expect(express(replace(starlit, 448, 'A')).tentacleForm).toBe('filament');
  });

  it('allows wider silhouettes and genome driven bell ornaments', () => {
    const low = express('A'.repeat(GENOME_LENGTH));
    const high = express('T'.repeat(GENOME_LENGTH));
    expect(low.tentacles).toBe(3);
    expect(high.tentacles).toBe(18);
    expect(low.scallops).toBe(3);
    expect(high.scallops).toBe(12);
    expect(high.bellWidth / low.bellWidth).toBeGreaterThan(7);
    expect(high.tentacleLength / low.tentacleLength).toBeGreaterThan(10);
    expect(low.bellPattern).toBe(0);
    expect(high.bellPattern).toBe(5);
    const midPattern = 'A'.repeat(432) + 'G'.repeat(12) + 'T'.repeat(4) + 'A'.repeat(64);
    expect(express(midPattern).bellPattern).toBe(2);
  });

  it('requires gene combinations for crown, lantern and lotus contours', () => {
    const replace = (genome: string, start: number, bases: string): string =>
      genome.slice(0, start) + bases + genome.slice(start + bases.length);
    const baseline = 'C'.repeat(GENOME_LENGTH);
    const crown = replace(replace(replace(baseline, 96, 'T'.repeat(16)), 112, 'T'.repeat(16)), 432, 'T'.repeat(16));
    expect(express(crown).bellShape).toBe('crown');
    expect(express(replace(crown, 432, 'C'.repeat(16))).bellShape).toBe('dome');
    const lotus = replace(crown, 112, 'A'.repeat(16));
    expect(express(lotus).bellShape).toBe('lotus');
    const lantern = replace(replace(replace(replace(baseline, 64, 'A'.repeat(16)), 80, 'T'.repeat(16)),
      112, 'T'.repeat(16)), 416, 'T'.repeat(16));
    expect(express(lantern).bellShape).toBe('lantern');
    expect(express(replace(lantern, 416, 'A'.repeat(16))).bellShape).toBe('dome');
  });

  it('unlocks crystal and wing contours and higher ornament tiers through combined genes', () => {
    const replace = (genome: string, start: number, bases: string): string =>
      genome.slice(0, start) + bases + genome.slice(start + bases.length);
    const baseline = 'C'.repeat(GENOME_LENGTH);
    const crystal = replace(replace(replace(replace(baseline, 96, 'T'.repeat(16)),
      112, 'T'.repeat(16)), 416, 'T'.repeat(16)), 432, 'T'.repeat(16));
    expect(express(crystal).bellShape).toBe('crystal');
    expect(express(crystal).bellPattern).toBe(5);
    expect(express(replace(crystal, 416, 'A'.repeat(16))).bellShape).toBe('crown');
    const wing = replace(replace(replace(replace(replace(baseline, 64, 'T'.repeat(16)),
      80, 'A'.repeat(16)), 96, 'A'.repeat(16)), 432, 'T'.repeat(16)), 448, 'T'.repeat(16));
    expect(express(wing).bellShape).toBe('wing');
    expect(express(replace(wing, 448, 'A'.repeat(16))).bellShape).toBe('dome');
    expect(express(replace(baseline, 432, 'T'.repeat(14) + 'A'.repeat(2))).bellPattern).toBe(4);
    expect(express(replace(baseline, 432, 'T'.repeat(13) + 'A'.repeat(3))).bellPattern).toBe(3);
  });

  it('produces several new bases per child at the default mutation rate', () => {
    let state = 12345;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const base = 'A'.repeat(GENOME_LENGTH);
    const changed = Array.from({ length: 20 }, () => breedGenomes(base, base, random))
      .reduce((total, genome) => total + [...genome].filter((letter) => letter !== 'A').length, 0);
    expect(changed / 20).toBeGreaterThan(5);
    expect(changed / 20).toBeLessThan(11);
  });

  it('inherits eight-base blocks and mutates to other bases', () => {
    const first = 'A'.repeat(GENOME_LENGTH);
    const second = 'T'.repeat(GENOME_LENGTH);
    let call = 0;
    const child = breedGenomes(first, second, () => (Math.floor(call++ / 9) % 2 === 0 ? 0 : 0.9), 0);
    expect(isGenome(child)).toBe(true);
    expect(child).toContain('AAAAAAAA');
    expect(child).toContain('TTTTTTTT');
    expect(breedGenomes(first, second, () => 0, 1)).toBe('C'.repeat(GENOME_LENGTH));
  });

  it('migrates the old 100-base color without losing it', () => {
    const oldGenome = 'ACGT'.repeat(25);
    const migrated = migrateLegacyGenome(oldGenome);
    expect(migrated).toHaveLength(GENOME_LENGTH);
    expect(express(migrated).color).toBe(0x1b1b1b);
  });
});
