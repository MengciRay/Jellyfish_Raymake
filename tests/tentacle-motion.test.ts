import { describe, expect, it } from 'vitest';
import { tentacleDrift, tentacleFrameTransform, transformTentaclePoint } from '../src/renderer/tentacle-motion';

describe('tentacle motion relative to the bell', () => {
  it('trails behind forward swimming at all four headings', () => {
    const speed = 50;
    const dt = 1 / 60;
    for (const [vx, vy, heading] of [
      [0, -speed, 0], [speed, 0, Math.PI / 2],
      [0, speed, Math.PI], [-speed, 0, -Math.PI / 2],
    ]) {
      const drift = tentacleDrift(vx, vy, heading, dt);
      expect(drift.x).toBeCloseTo(0, 8);
      expect(drift.y).toBeCloseTo(tentacleDrift(0, -speed, 0, dt).y, 8);
      expect(drift.y).toBeGreaterThan(0);
      const worldX = drift.x * Math.cos(heading) - drift.y * Math.sin(heading);
      const worldY = drift.x * Math.sin(heading) + drift.y * Math.cos(heading);
      expect(worldX * vx + worldY * vy).toBeLessThan(0);
    }
  });

  it('bends sideways in body coordinates during a turn and never pushes tentacles through the bell', () => {
    const dt = 1 / 60;
    expect(tentacleDrift(40, 0, 0, dt).x).toBeLessThan(0);
    expect(tentacleDrift(0, 40, Math.PI / 2, dt).x).toBeLessThan(0);
    expect(tentacleDrift(0, 40, 0, dt).y).toBeGreaterThan(0);
  });

  it('lets a dragged bell move ahead of its free tentacle nodes', () => {
    const previous = { x: 100, y: 100, heading: 0, scale: 1 };
    const moved = { x: 140, y: 100, heading: 0, scale: 1 };
    const tail = transformTentaclePoint(0, 80, tentacleFrameTransform(previous, moved, 100));
    expect(tail).toEqual({ x: -40, y: 80 });
    // A fast pointer jump keeps visible lag without stretching a chain by hundreds of pixels.
    const jumped = transformTentaclePoint(0, 80,
      tentacleFrameTransform(previous, { ...moved, x: 300 }, 25));
    expect(jumped).toEqual({ x: -25, y: 80 });
    const turned = transformTentaclePoint(0, 80,
      tentacleFrameTransform(previous, { ...previous, heading: Math.PI / 2 }, 100));
    expect(turned.x).toBeCloseTo(80);
    expect(turned.y).toBeCloseTo(0);
  });

  it('keeps drag gravity pointing down on screen at every bell heading', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const drift = tentacleDrift(0, 0, heading, 1 / 60, true);
      const screenX = drift.x * Math.cos(heading) - drift.y * Math.sin(heading);
      const screenY = drift.x * Math.sin(heading) + drift.y * Math.cos(heading);
      expect(screenX).toBeCloseTo(0, 8);
      expect(screenY).toBeGreaterThan(0);
    }
  });
});
