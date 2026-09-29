// The bell faces local -Y. Convert screen velocity before applying drag to
// tentacles, which are simulated and drawn in the bell's local coordinates.
export interface BellFrame { x: number; y: number; heading: number; scale: number }

export interface FrameTransform {
  cos: number;
  sin: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Keep free nodes close to their previous screen positions as the bell moves.
// Large pointer jumps retain bounded lag so the chain does not stretch wildly.
export function tentacleFrameTransform(previous: BellFrame, current: BellFrame, maxLag: number): FrameTransform {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const fraction = Math.min(1, maxLag / Math.hypot(dx, dy));
  const lagX = -dx * fraction;
  const lagY = -dy * fraction;
  const cos = Math.cos(current.heading);
  const sin = Math.sin(current.heading);
  const turn = previous.heading - current.heading;
  return {
    cos: Math.cos(turn), sin: Math.sin(turn), scale: previous.scale / current.scale,
    offsetX: (lagX * cos + lagY * sin) / current.scale,
    offsetY: (-lagX * sin + lagY * cos) / current.scale,
  };
}

export function transformTentaclePoint(x: number, y: number, frame: FrameTransform): { x: number; y: number } {
  return {
    x: frame.offsetX + (x * frame.cos - y * frame.sin) * frame.scale,
    y: frame.offsetY + (x * frame.sin + y * frame.cos) * frame.scale,
  };
}

export function tentacleDrift(vx: number, vy: number, heading: number, dt: number, dragged = false): { x: number; y: number } {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  if (dragged) {
    // During a drag, gravity stays screen-down even when the bell is rotated.
    return { x: sin * 260 * dt * dt, y: cos * 260 * dt * dt };
  }
  const lateral = vx * cos + vy * sin;
  const forward = vx * sin - vy * cos;
  return {
    x: -lateral * dt * 0.12,
    y: 180 * dt * dt + Math.max(0, forward) * dt * 0.06,
  };
}
