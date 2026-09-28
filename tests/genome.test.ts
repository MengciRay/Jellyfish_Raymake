import { describe, expect, it } from 'vitest';
import { breedGenomes, express, isGenome, randomGenome, withColor } from '../src/shared/genome';

describe('virtual genome', () => {
  it('maps twelve bases directly to an exact RGB color', () => {
    const genome = withColor('A'.repeat(100), 0x7fa9e3);
    expect(genome).toHaveLength(100);
    expect(express(genome).color).toBe(0x7fa9e3);
  });

  it('expresses the same shape and behavior for the same sequence', () => {
    const genome = randomGenome(() => 0.35);
    expect(express(genome)).toEqual(express(genome));
    expect(express(genome).tentacles).toBeGreaterThanOrEqual(5);
  });

  it('inherits both parents and changes only bases when mutation occurs', () => {
    const first = 'A'.repeat(100);
    const second = 'T'.repeat(100);
    let call = 0;
    const child = breedGenomes(first, second, () => (Math.floor(call++ / 5) % 2 === 0 ? 0 : 0.9), 0);
    expect(isGenome(child)).toBe(true);
    expect(child).toContain('A');
    expect(child).toContain('T');
    const mutated = breedGenomes(first, second, () => 0, 1);
    expect(mutated).toBe('C'.repeat(100));
  });
});
