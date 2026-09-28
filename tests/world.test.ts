import { describe, expect, it } from 'vitest';
import { express, isGenome } from '../src/shared/genome';
import { breed, feed, newWorld, parseWorld } from '../src/renderer/world';

describe('habitat lifecycle', () => {
  it('breeds a viable child and charges both parents', () => {
    const world = newWorld();
    const [first, second] = world.jellies;
    const child = breed(world, first, second);
    expect(world.jellies).toHaveLength(3);
    expect(isGenome(child.genome)).toBe(true);
    expect(express(child.genome).color).toBeGreaterThanOrEqual(0);
    expect(child.ageSeconds).toBe(0);
    expect(first.energy).toBeCloseTo(0.72);
    expect(second.energy).toBeCloseTo(0.72);
    expect(parseWorld(JSON.parse(JSON.stringify(world)))).not.toBeNull();
  });

  it('rejects immature breeding and restores energy with feeding', () => {
    const world = newWorld();
    const [first, second] = world.jellies;
    first.ageSeconds = 0;
    expect(() => breed(world, first, second)).toThrow('尚未成熟');
    expect(world.jellies).toHaveLength(2);
    first.energy = 0.1;
    feed(first);
    expect(first.energy).toBeCloseTo(0.4);
  });

  it('rejects corrupted saves', () => {
    const world = newWorld();
    world.jellies[1].id = world.jellies[0].id;
    expect(parseWorld(world)).toBeNull();
  });
});
