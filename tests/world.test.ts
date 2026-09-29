import { describe, expect, it } from 'vitest';
import { express, isGenome, wildGenome, withColor } from '../src/shared/genome';
import { breed, coinYield, collectCoins, discoverSpecialTraits, discoverTentacleForm, editGenes,
  energySpeedFactor, feed, geneEditCost, huntPlankton, introduce, newWorld, parseWorld,
  preyCaptureChance, removeJelly, renameJelly, traitSnapshot } from '../src/renderer/world';

describe('habitat lifecycle', () => {
  it('keeps the atlas discoveries after deletion and recovers old bell records from lineage', () => {
    const world = newWorld();
    const jelly = world.jellies[0];
    world.jellies[1].genome = wildGenome(() => 0.5);
    world.lineage[1].traits = traitSnapshot(world.jellies[1]);
    world.discoveredForms = [];
    world.discoveredBellShapes = [];
    world.discoveredBellPatterns = [];
    world.discoveredEyeShapes = [];
    world.discoveredGlowShapes = [];
    const replace = (start: number, base: string): void => {
      jelly.genome = jelly.genome.slice(0, start) + base.repeat(16) + jelly.genome.slice(start + 16);
    };
    jelly.genome = 'C'.repeat(512);
    replace(464, 'G');
    replace(96, 'T'); replace(112, 'T'); replace(416, 'T'); replace(432, 'T');
    replace(128, 'A'); replace(144, 'T'); replace(160, 'T'); replace(176, 'T');
    expect(discoverSpecialTraits(world, jelly)).toEqual(['丝带触手', '水晶伞', '星芒纹']);
    expect(discoverSpecialTraits(world, jelly)).toEqual([]);
    world.lineage[0].traits = traitSnapshot(jelly);
    removeJelly(world, jelly.id);
    const restored = parseWorld(JSON.parse(JSON.stringify(world)));
    expect(restored?.discoveredForms).toEqual(['ribbon']);
    expect(restored?.discoveredBellShapes).toEqual(['crystal']);
    expect(restored?.discoveredBellPatterns).toEqual([5]);
    const oldSave = { ...world };
    delete (oldSave as { discoveredForms?: unknown }).discoveredForms;
    delete (oldSave as { discoveredBellShapes?: unknown }).discoveredBellShapes;
    delete (oldSave as { discoveredBellPatterns?: unknown }).discoveredBellPatterns;
    expect(parseWorld(oldSave)?.discoveredBellShapes).toEqual(['crystal']);
    expect(parseWorld(oldSave)?.discoveredBellPatterns).toEqual([5]);
    expect(parseWorld({ ...world, discoveredBellShapes: ['dome'] })).toBeNull();
    expect(parseWorld({ ...world, discoveredBellPatterns: [0] })).toBeNull();
  });
  it('records eye and backlight discoveries and restores them from lineage', () => {
    const world = newWorld();
    const jelly = world.jellies[0];
    world.discoveredEyeShapes = [];
    world.discoveredGlowShapes = [];
    jelly.genome = 'ACGT'.repeat(128);
    jelly.genome = jelly.genome.slice(0, 464) + 'T'.repeat(16) + 'A'.repeat(16) + jelly.genome.slice(496);
    const found = discoverSpecialTraits(world, jelly);
    expect(found).toContain('笑眼');
    expect(found).toContain('星形背光');
    expect(discoverSpecialTraits(world, jelly)).not.toContain('笑眼');
    world.lineage[0].traits = traitSnapshot(jelly);
    removeJelly(world, jelly.id);
    const oldSave = { ...world } as Partial<typeof world>;
    delete oldSave.discoveredEyeShapes;
    delete oldSave.discoveredGlowShapes;
    expect(parseWorld(oldSave)?.discoveredEyeShapes).toContain('smile');
    expect(parseWorld(oldSave)?.discoveredGlowShapes).toContain('star');
    expect(parseWorld({ ...world, discoveredEyeShapes: ['dot'] })).toBeNull();
    expect(parseWorld({ ...world, discoveredGlowShapes: ['__proto__'] })).toBeNull();
  });
  it('announces each dynamic form once and keeps discoveries after its owner is removed', () => {
    const world = newWorld();
    world.jellies[1].genome = wildGenome(() => 0.5);
    world.discoveredForms = [];
    const jelly = world.jellies[0];
    jelly.genome = wildGenome(() => 0.5);
    const replace = (start: number, base: string): void => {
      jelly.genome = jelly.genome.slice(0, start) + base.repeat(16) + jelly.genome.slice(start + 16);
    };
    replace(128, 'A'); replace(144, 'T'); replace(160, 'T'); replace(176, 'T');
    expect(discoverTentacleForm(world, jelly)).toBe('ribbon');
    expect(discoverTentacleForm(world, jelly)).toBeNull();
    replace(416, 'T'); replace(448, 'T');
    expect(discoverTentacleForm(world, jelly)).toBe('starlit');
    removeJelly(world, jelly.id);
    expect(parseWorld(JSON.parse(JSON.stringify(world)))?.discoveredForms).toEqual(['ribbon', 'starlit']);
    expect(parseWorld({ ...world, discoveredForms: ['ribbon', 'ribbon'] })).toBeNull();
    expect(parseWorld({ ...world, discoveredForms: ['constructor'] })).toBeNull();
    const oldSave = { ...world };
    delete (oldSave as { discoveredForms?: unknown }).discoveredForms;
    expect(parseWorld(oldSave)?.discoveredForms).toEqual([]);
  });
  it('charges the stated prices for one through five edited bases', () => {
    expect([1, 2, 3, 4, 5].map(geneEditCost)).toEqual([100, 500, 3000, 21000, 168000]);
    expect(() => geneEditCost(0)).toThrow();
    expect(() => geneEditCost(6)).toThrow();
  });

  it('keeps encountered trait extremes after a jelly is removed and the save is reloaded', () => {
    const world = newWorld();
    const originalMin = world.traitRecords.tentacleLength!.min;
    const unusual = introduce(world);
    unusual.genome = unusual.genome.slice(0, 144) + 'T'.repeat(16) + unusual.genome.slice(160);
    // Gene editing and birth paths update the permanent records.
    world.coins = 100;
    const edit = { index: 144, base: 'A' };
    expect(unusual.genome[144]).not.toBe('A');
    editGenes(world, unusual, [edit]);
    const high = world.traitRecords.tentacleLength!.max;
    expect(high).toBeGreaterThan(originalMin);
    removeJelly(world, unusual.id);
    expect(parseWorld(JSON.parse(JSON.stringify(world)))?.traitRecords.tentacleLength?.max).toBe(high);
    const oldSave = { ...world };
    delete (oldSave as { traitRecords?: unknown }).traitRecords;
    expect(parseWorld(oldSave)?.traitRecords.tentacles).toBeDefined();
    expect(parseWorld({ ...world, traitRecords: { tentacles: { min: 18, max: 3 } } })).toBeNull();
  });

  it('edits a jelly only once, spends coins atomically and preserves the birth snapshot', () => {
    const world = newWorld();
    const jelly = world.jellies[0];
    const original = jelly.genome;
    const birthColor = world.lineage[0].traits?.color;
    const nextBase = 'ACGT'.split('').find((base) => base !== original[0])!;
    const edit = { index: 0, base: nextBase };
    world.coins = 99;
    expect(() => editGenes(world, jelly, [edit])).toThrow('金币不足');
    expect(jelly.genome).toBe(original);
    expect(jelly.geneEdited).toBe(false);
    world.coins = 500;
    expect(() => editGenes(world, jelly, [edit, edit])).toThrow('不同的位置');
    expect(() => editGenes(world, jelly, [{ index: 512, base: nextBase }])).toThrow();
    expect(() => editGenes(world, jelly, [{ index: 0, base: original[0] }])).toThrow();
    expect(world.coins).toBe(500);
    expect(editGenes(world, jelly, [edit])).toBe(100);
    expect(world.coins).toBe(400);
    expect(jelly.genome[0]).toBe(nextBase);
    expect(jelly.geneEdited).toBe(true);
    expect(world.lineage[0].traits?.color).toBe(birthColor);
    expect(() => editGenes(world, jelly, [{ index: 1, base: nextBase }])).toThrow('已经');
    expect(parseWorld(JSON.parse(JSON.stringify(world)))?.jellies[0].geneEdited).toBe(true);
    expect(world.jellies[1].geneEdited).toBe(false);
    expect(parseWorld({ ...world, jellies: [{ ...jelly, geneEdited: 'yes' }, world.jellies[1]] })).toBeNull();
  });

  it('accepts five distinct changes in a single edit and rejects a sixth', () => {
    const world = newWorld();
    const jelly = world.jellies[0];
    const changes = Array.from({ length: 5 }, (_, index) => ({
      index, base: 'ACGT'.split('').find((base) => base !== jelly.genome[index])!,
    }));
    world.coins = 168000;
    expect(() => editGenes(world, jelly, [...changes, { index: 5, base: 'A' }])).toThrow('1–5');
    expect(world.coins).toBe(168000);
    expect(editGenes(world, jelly, changes)).toBe(168000);
    expect(world.coins).toBe(0);
    for (const { index, base } of changes) expect(jelly.genome[index]).toBe(base);
  });

  it('rewards unusual traits and color with more coins than an ordinary wild jelly', () => {
    const ordinary = { ...newWorld().jellies[0], genome: wildGenome(() => 0.5) };
    const longTentacles = { ...ordinary, genome: ordinary.genome.slice(0, 144) + 'T'.repeat(16) + ordinary.genome.slice(160) };
    const redAndLong = { ...longTentacles, genome: withColor(longTentacles.genome, 0xff2020) };
    expect(coinYield(ordinary)).toBeGreaterThanOrEqual(1);
    expect(coinYield(longTentacles)).toBeGreaterThan(coinYield(ordinary));
    expect(coinYield(redAndLong)).toBeGreaterThan(coinYield(longTentacles));
  });

  it('collects all live jelly yields every ten seconds and preserves the remaining progress', () => {
    const world = newWorld();
    const perCycle = world.jellies.reduce((total, jelly) => total + coinYield(jelly), 0);
    expect(collectCoins(world, 9.75)).toBe(0);
    expect(world.coins).toBe(0);
    expect(collectCoins(world, 0.25)).toBe(perCycle);
    expect(world.coins).toBe(perCycle);
    expect(collectCoins(world, 21)).toBe(perCycle * 2);
    expect(world.coinProgressSeconds).toBe(1);
    const restored = parseWorld(JSON.parse(JSON.stringify(world)));
    expect(restored?.coins).toBe(perCycle * 3);
    expect(restored?.coinProgressSeconds).toBe(1);
    const { coins: _coins, coinProgressSeconds: _progress, ...oldSave } = world;
    expect(parseWorld(oldSave)?.coins).toBe(0);
    expect(parseWorld(oldSave)?.coinProgressSeconds).toBe(0);
    expect(parseWorld({ ...world, coins: -1 })).toBeNull();
    expect(parseWorld({ ...world, coinProgressSeconds: 10 })).toBeNull();
  });

  it('reduces target swim speed substantially as energy falls', () => {
    expect(energySpeedFactor(1)).toBe(1);
    expect(energySpeedFactor(0.5)).toBeCloseTo(0.6);
    expect(energySpeedFactor(0)).toBeCloseTo(0.2);
  });
  it('makes venom improve prey capture and restores energy when prey is caught', () => {
    const world = newWorld();
    const [low, high] = world.jellies;
    low.genome = low.genome.slice(0, 304) + 'A'.repeat(16) + low.genome.slice(320);
    high.genome = high.genome.slice(0, 304) + 'T'.repeat(16) + high.genome.slice(320);
    low.genome = low.genome.slice(0, 144) + 'A'.repeat(16) + low.genome.slice(160);
    high.genome = high.genome.slice(0, 144) + 'A'.repeat(16) + high.genome.slice(160);
    low.energy = 0.4;
    high.energy = 0.4;
    expect(preyCaptureChance(high)).toBeGreaterThan(preyCaptureChance(low) + 0.7);
    expect(huntPlankton(low, () => 0.5)).toBe(false);
    expect(huntPlankton(high, () => 0.5)).toBe(true);
    expect(low.energy).toBe(0.4);
    expect(high.energy).toBeCloseTo(0.406);
    expect(high.preyCaught).toBe(1);
    expect(parseWorld(JSON.parse(JSON.stringify(world)))?.jellies[1].preyCaught).toBe(1);
  });
  it('breeds the explicitly supplied two parents and charges both', () => {
    const world = newWorld();
    introduce(world);
    const [first, second, third] = world.jellies;
    const child = breed(world, first, third);
    expect(world.jellies).toHaveLength(4);
    expect(isGenome(child.genome)).toBe(true);
    expect(child.ageSeconds).toBe(0);
    expect(first.energy).toBeCloseTo(0.72);
    expect(second.energy).toBeCloseTo(0.9);
    expect(third.energy).toBeCloseTo(0.72);
    expect(world.lineage.at(-1)?.parentIds).toEqual([first.id, third.id]);
    expect(world.lineage.at(-1)?.traits?.tentacles).toBe(express(child.genome).tentacles);
    expect(parseWorld(JSON.parse(JSON.stringify(world)))).not.toBeNull();
  });

  it('rejects self-breeding, immaturity and low energy', () => {
    const world = newWorld();
    const [first, second] = world.jellies;
    expect(() => breed(world, first, first)).toThrow('不同');
    first.ageSeconds = 0;
    expect(() => breed(world, first, second)).toThrow('尚未成熟');
    first.ageSeconds = 120;
    first.energy = 0.1;
    expect(() => breed(world, first, second)).toThrow('喂食');
    feed(first);
    expect(first.energy).toBeCloseTo(0.4);
  });

  it('renames, deletes and can repopulate an empty habitat', () => {
    const world = newWorld();
    const first = world.jellies[0];
    expect(renameJelly(world, first, '  小海  ')).toBe('小海');
    expect(() => renameJelly(world, first, ' ')).toThrow('名字');
    removeJelly(world, first.id);
    removeJelly(world, world.jellies[0].id);
    expect(parseWorld(world)?.jellies).toHaveLength(0);
    expect(introduce(world).name).toContain('野生水母');
    expect(world.jellies).toHaveLength(1);
  });

  it('migrates a v1 save while preserving individuals, age and exact RGB color', () => {
    const oldGenome = 'ACGT'.repeat(25);
    const save = {
      version: 1,
      bornCount: 2,
      jellies: [0, 1].map((index) => ({
        id: `legacy-${index}`, name: `旧水母 ${index}`, genome: oldGenome,
        x: 0.3 + index * 0.3, y: 0.4, ageSeconds: 123, energy: 0.71,
      })),
    };
    const migrated = parseWorld(save);
    expect(migrated?.version).toBe(3);
    expect(migrated?.jellies.map((jelly) => jelly.id)).toEqual(['legacy-0', 'legacy-1']);
    expect(migrated?.jellies[0].ageSeconds).toBe(123);
    expect(migrated?.jellies[0].energy).toBe(0.71);
    expect(express(migrated!.jellies[0].genome).color).toBe(0x1b1b1b);
    expect(migrated?.lineage.map((entry) => entry.parentIds)).toEqual([null, null]);
  });

  it('keeps ancestors after removal and updates their recorded names', () => {
    const world = newWorld();
    const [first, second] = world.jellies;
    const child = breed(world, first, second);
    child.ageSeconds = 120;
    const grandchild = breed(world, child, second);
    renameJelly(world, first, '蓝祖先');
    removeJelly(world, first.id);
    removeJelly(world, child.id);
    const restored = parseWorld(JSON.parse(JSON.stringify(world)));
    expect(restored?.lineage.find((entry) => entry.id === first.id)?.name).toBe('蓝祖先');
    expect(restored?.lineage.find((entry) => entry.id === child.id)?.parentIds).toEqual([first.id, second.id]);
    expect(restored?.lineage.find((entry) => entry.id === grandchild.id)?.parentIds).toEqual([child.id, second.id]);
    expect(restored?.lineage.find((entry) => entry.id === first.id)?.traits?.color).toBe(express(first.genome).color);
    expect(restored?.lineage.find((entry) => entry.id === child.id)?.traits?.tentacleLength)
      .toBeCloseTo(express(child.genome).tentacleLength);
  });

  it('migrates a v2 save and rejects broken family records', () => {
    const original = newWorld();
    const oldSave = { version: 2, bornCount: original.bornCount, jellies: original.jellies };
    const migrated = parseWorld(oldSave);
    expect(migrated?.version).toBe(3);
    expect(migrated?.lineage).toHaveLength(2);
    const oldV3 = newWorld();
    oldV3.lineage.forEach((record) => { delete record.traits; });
    oldV3.jellies.forEach((jelly) => { delete jelly.preyCaught; });
    const restoredOldV3 = parseWorld(oldV3);
    expect(restoredOldV3?.lineage.every((record) => record.traits === undefined)).toBe(true);
    expect(restoredOldV3?.jellies.every((jelly) => jelly.preyCaught === undefined)).toBe(true);
    const olderSnapshot = newWorld();
    delete olderSnapshot.lineage[0].traits?.bellShape;
    expect(parseWorld(olderSnapshot)).not.toBeNull();
    const broken = newWorld();
    broken.lineage[1].parentIds = [broken.lineage[0].id, 'missing'];
    expect(parseWorld(broken)).toBeNull();
  });

  it('introduces ordinary blue, midrange wild jellies', () => {
    const world = newWorld();
    for (let index = 0; index < 10; index += 1) {
      const jelly = introduce(world);
      const traits = express(jelly.genome);
      const red = (traits.color >>> 16) & 255;
      const green = (traits.color >>> 8) & 255;
      const blue = traits.color & 255;
      expect(red).toBeGreaterThanOrEqual(100);
      expect(red).toBeLessThanOrEqual(124);
      expect(green).toBeGreaterThanOrEqual(169);
      expect(green).toBeLessThanOrEqual(193);
      expect(blue).toBeGreaterThanOrEqual(211);
      expect(blue).toBeLessThanOrEqual(235);
      expect(traits.metabolism).toBeGreaterThan(0.94);
      expect(traits.metabolism).toBeLessThan(1.06);
      expect(traits.rare).toBe(false);
      expect(traits.bellPattern).toBe(0);
      expect(world.lineage.at(-1)?.parentIds).toBeNull();
    }
  });

  it('rejects corrupted saves', () => {
    const world = newWorld();
    world.jellies[1].id = world.jellies[0].id;
    expect(parseWorld(world)).toBeNull();
  });
});
