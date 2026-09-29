import { afterEach, describe, expect, it, vi } from 'vitest';
import { JellyView } from '../src/renderer/jelly';
import { newWorld } from '../src/renderer/world';

afterEach(() => vi.restoreAllMocks());

describe('jelly swimming', () => {
  it('turns its bell while swimming in open water', () => {
    const data = newWorld().jellies[0];
    data.x = 0.5;
    data.y = 0.5;
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const view = new JellyView(data, 1600, 1000);
    view.update(0.05, 1600, 1000, false, false);
    const initial = (view as unknown as { heading: number }).heading;
    for (let frame = 0; frame < 100; frame += 1) view.update(0.05, 1600, 1000, false, false);
    const heading = (view as unknown as { heading: number }).heading;
    const turn = Math.atan2(Math.sin(heading - initial), Math.cos(heading - initial));
    expect(Math.abs(turn)).toBeGreaterThan(0.3);
    expect(view.x).toBeGreaterThan(150);
    expect(view.x).toBeLessThan(1450);
    expect(view.y).toBeGreaterThan(150);
    expect(view.y).toBeLessThan(850);
    view.destroy();
  });
});
