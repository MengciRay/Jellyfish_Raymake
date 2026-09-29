import { Container, FillGradient, Graphics } from 'pixi.js';
import { express, type Phenotype } from '../shared/genome';
import { energySpeedFactor, huntPlankton, type JellyData } from './world';
import { tentacleDrift, tentacleFrameTransform, transformTentaclePoint, type BellFrame } from './tentacle-motion';

interface Point { x: number; y: number; oldX: number; oldY: number }

function blendColor(first: number, second: number, fraction: number): number {
  let color = 0;
  for (const shift of [0, 8, 16]) {
    const a = (first >>> shift) & 255;
    const b = (second >>> shift) & 255;
    color |= Math.round(a + (b - a) * fraction) << shift;
  }
  return color;
}

export class JellyView {
  readonly container = new Container();
  readonly phenotype: Phenotype;
  selected = false;
  private readonly selectionInk = new Graphics();
  private readonly ink = new Graphics();
  private readonly effects = new Graphics();
  private readonly forageInk = new Graphics();
  private readonly bellGradient: FillGradient;
  private readonly chains: Point[][];
  private readonly tentacleSegments: number;
  private tailFrame: BellFrame;
  private phase = Math.random() * Math.PI * 2;
  private direction = Math.random() * Math.PI * 2;
  private heading = this.direction + Math.PI / 2;
  private wanderTarget = this.direction;
  private wanderSeconds = 1 + Math.random() * 1.5;
  private vx = 0;
  private vy = 0;
  private dashSeconds = 0;
  private feedingSeconds = 0;
  private foodDots: Array<{ x: number; y: number; delay: number }> = [];
  private forageCooldown = 5 + Math.random() * 9;
  private forageSeconds = 0;
  private forageSuccess = false;
  private forageSide = 1;
  private forageChain = 0;
  x: number;
  y: number;

  constructor(readonly data: JellyData, width: number, height: number) {
    this.phenotype = express(data.genome);
    this.bellGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: this.phenotype.gradientColor },
        { offset: 1, color: this.phenotype.color },
      ],
    });
    this.x = data.x * width;
    this.y = data.y * height;
    this.tentacleSegments = Math.max(7, Math.ceil(this.phenotype.tentacleLength / 32));
    this.tailFrame = { x: this.x, y: this.y, heading: this.heading, scale: this.scale };
    this.container.addChild(this.selectionInk, this.ink, this.forageInk, this.effects);
    this.chains = Array.from({ length: this.phenotype.tentacles }, (_, tentacle) => {
      const anchorX = this.anchorX(tentacle);
      return Array.from({ length: this.tentacleSegments + 1 }, (_, node) => {
        const y = node * this.phenotype.tentacleLength / this.tentacleSegments;
        return { x: anchorX, y, oldX: anchorX, oldY: y };
      });
    });
  }

  get scale(): number {
    return Math.min(1, 0.58 + this.data.ageSeconds / 210);
  }

  hit(x: number, y: number): boolean {
    const angle = this.container.rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - this.x;
    const dy = y - this.y;
    const localX = (dx * cos + dy * sin) / this.scale;
    const localY = (-dx * sin + dy * cos) / this.scale;
    return Math.abs(localX) < this.phenotype.bellWidth * 0.6 &&
      localY > -this.phenotype.bellHeight * 1.6 && localY < this.phenotype.bellHeight * 0.6;
  }

  dashTowardBell(): void {
    const speed = this.phenotype.swimSpeed * energySpeedFactor(this.data.energy);
    this.direction = this.heading - Math.PI / 2;
    this.wanderTarget = this.direction;
    this.wanderSeconds = 2.5;
    const impulse = Math.max(70, speed * 2.2);
    this.vx = Math.cos(this.direction) * impulse;
    this.vy = Math.sin(this.direction) * impulse;
    this.dashSeconds = 0.5;
  }

  playFeeding(): void {
    this.feedingSeconds = 1.25;
    this.foodDots = Array.from({ length: 11 }, (_, index) => ({
      x: (Math.random() - 0.5) * this.phenotype.bellWidth * 0.9,
      y: this.phenotype.bellHeight * (0.6 + Math.random() * 1.2),
      delay: index * 0.055,
    }));
  }

  update(deltaSeconds: number, width: number, height: number, dragged: boolean, render = true): void {
    const dt = Math.min(deltaSeconds, 0.05);
    this.dashSeconds = Math.max(0, this.dashSeconds - dt);
    this.feedingSeconds = Math.max(0, this.feedingSeconds - dt);
    this.forageSeconds = Math.max(0, this.forageSeconds - dt);
    this.forageCooldown -= dt;
    if (this.forageCooldown <= 0) {
      this.forageCooldown = 11 + Math.random() * 7;
      this.forageSuccess = huntPlankton(this.data);
      this.forageSeconds = 0.95;
      this.forageSide = Math.random() < 0.5 ? -1 : 1;
      this.forageChain = Math.floor(Math.random() * this.chains.length);
    }
    this.phase += dt * this.phenotype.pulseHz * (0.65 + this.data.energy * 0.35) * Math.PI * 2;
    if (!dragged) {
      this.wanderSeconds -= dt;
      if (this.wanderSeconds <= 0) {
        const sign = Math.random() < 0.5 ? -1 : 1;
        this.wanderTarget = this.direction + sign *
          (0.35 + Math.random() * 0.5 + this.phenotype.wander * 0.5);
        this.wanderSeconds = 2.5 + Math.random() * 1.5;
      }
      const wanderTurn = Math.atan2(Math.sin(this.wanderTarget - this.direction),
        Math.cos(this.wanderTarget - this.direction));
      const maxTurn = dt * (0.45 + this.phenotype.wander * 0.65);
      this.direction += Math.max(-maxTurn, Math.min(maxTurn, wanderTurn));
      const tailLength = this.phenotype.tentacleLength * this.scale;
      const tailX = -Math.sin(this.heading) * tailLength;
      const tailY = Math.cos(this.heading) * tailLength;
      const bellSide = Math.max(30, this.phenotype.bellWidth * this.scale * 0.55);
      const left = Math.max(bellSide, -tailX + 12);
      const right = Math.max(bellSide, tailX + 12);
      const topMultiplier = this.phenotype.bellShape === 'lantern' || this.phenotype.bellShape === 'crystal' ? 1.45 : 1.2;
      const bellTop = Math.max(55, this.phenotype.bellHeight * this.scale * topMultiplier);
      const top = Math.max(bellTop, -tailY + 12);
      const bottom = Math.max(40, tailY + 12);
      if (this.x < left) this.direction = 0;
      if (this.x > width - right) this.direction = Math.PI;
      if (this.y < top) this.direction = Math.PI / 2;
      if (this.y > height - bottom) this.direction = -Math.PI / 2;
      if (this.x < left || this.x > width - right || this.y < top || this.y > height - bottom) {
        this.wanderTarget = this.direction;
        this.wanderSeconds = 2.5;
      }
      const speed = this.phenotype.swimSpeed * energySpeedFactor(this.data.energy) *
        (this.dashSeconds > 0 ? 2.2 : 1);
      this.vx += (Math.cos(this.direction) * speed - this.vx) * Math.min(1, dt * 1.2);
      this.vy += (Math.sin(this.direction) * speed - this.vy) * Math.min(1, dt * 1.2);
      if (Math.hypot(this.vx, this.vy) > 1) {
        const target = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        const turn = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
        this.heading += turn * Math.min(1, dt * 3.8);
      }
      const nextX = this.x + this.vx * dt;
      const nextY = this.y + this.vy * dt + Math.sin(this.phase) * dt * 8 - this.phenotype.buoyancy * speed * dt * 0.5;
      this.x = left + right > width ? width / 2 : Math.max(left, Math.min(width - right, nextX));
      this.y = top + bottom > height ? height / 2 : Math.max(top, Math.min(height - bottom, nextY));
    } else {
      this.vx = 0;
      this.vy = 0;
    }
    this.advanceLife(dt);
    this.data.x = this.x / width;
    this.data.y = this.y / height;
    this.rebaseTentacles();
    this.updateTentacles(dt, dragged);
    if (render) {
      this.draw();
      this.drawFeeding();
      this.drawForage();
    }
  }

  fastForward(seconds: number): void {
    this.advanceLife(seconds);
    this.dashSeconds = Math.max(0, this.dashSeconds - seconds);
    this.feedingSeconds = Math.max(0, this.feedingSeconds - seconds);
    this.forageSeconds = Math.max(0, this.forageSeconds - seconds);
    this.forageCooldown -= seconds;
  }

  private advanceLife(seconds: number): void {
    this.data.ageSeconds += seconds;
    this.data.energy = Math.max(0, this.data.energy - seconds * 0.00028 *
      this.phenotype.metabolism / this.phenotype.resilience * (1 + this.phenotype.toxicity * 0.0025));
  }

  private anchorX(index: number): number {
    return (index / Math.max(1, this.phenotype.tentacles - 1) - 0.5) * this.phenotype.bellWidth * 0.76;
  }

  private tentacleWaveX(index: number, node: number): number {
    return Math.sin(this.phase * 0.65 + index * 0.48 + node * 0.62) *
      this.phenotype.tentacleSway * (node / this.tentacleSegments) ** 1.4 * 6;
  }

  private drawRibbon(g: Graphics, chain: Point[], index: number, color: number, rim: number): void {
    const left: Array<{ x: number; y: number }> = [];
    const right: Array<{ x: number; y: number }> = [];
    for (let node = 0; node < chain.length; node += 1) {
      const point = chain[node];
      const before = chain[Math.max(0, node - 1)];
      const after = chain[Math.min(chain.length - 1, node + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const wave = this.tentacleWaveX(index, node) + Math.sin(this.phase * 0.8 + index + node * 0.95) * node * 0.85;
      const halfWidth = this.phenotype.filamentWidth * (1.45 + 0.4 * Math.sin(this.phase + node * 0.95 + index)) *
        (1 - node / (chain.length - 1) * 0.68);
      left.push({ x: point.x + wave - dy / distance * halfWidth, y: point.y + dx / distance * halfWidth });
      right.push({ x: point.x + wave + dy / distance * halfWidth, y: point.y - dx / distance * halfWidth });
    }
    g.moveTo(left[0].x, left[0].y);
    for (const point of left.slice(1)) g.lineTo(point.x, point.y);
    for (const point of right.reverse()) g.lineTo(point.x, point.y);
    g.closePath().fill({ color, alpha: 0.4 + this.phenotype.glow * 0.18 })
      .stroke({ color: rim, alpha: 0.55, width: 0.8 });
    g.moveTo(chain[0].x, chain[0].y);
    for (let node = 1; node < chain.length; node += 1) {
      g.lineTo(chain[node].x + this.tentacleWaveX(index, node), chain[node].y);
    }
    g.stroke({ color: rim, alpha: 0.7, width: 1.15 });
  }

  private drawStarlit(g: Graphics, chain: Point[], index: number, rim: number): void {
    if (this.chains.length > 5 && index % 2 !== 0) return;
    for (let mote = 0; mote < 3; mote += 1) {
      const travel = (this.phase * 0.12 + index * 0.17 + mote / 3) % 1;
      const segment = Math.min(chain.length - 2, Math.floor(travel * (chain.length - 1)));
      const fraction = travel * (chain.length - 1) - segment;
      const a = chain[segment];
      const b = chain[segment + 1];
      const x = a.x + (b.x - a.x) * fraction + this.tentacleWaveX(index, segment);
      const y = a.y + (b.y - a.y) * fraction;
      const twinkle = 0.7 + 0.3 * Math.sin(this.phase * 1.4 + mote * 2.1);
      g.circle(x, y, 8 * twinkle).fill({ color: rim, alpha: 0.13 });
      g.moveTo(x - 5 * twinkle, y).lineTo(x + 5 * twinkle, y)
        .moveTo(x, y - 5 * twinkle).lineTo(x, y + 5 * twinkle)
        .stroke({ color: rim, alpha: 0.55, width: 0.9 });
      g.circle(x, y, 3.5 * twinkle).fill({ color: rim, alpha: 0.88 });
      g.circle(x, y, 1.5).fill({ color: 0xffffff, alpha: 0.95 });
    }
  }

  private rebaseTentacles(): void {
    const current = { x: this.x, y: this.y, heading: this.heading, scale: this.scale };
    const maxLag = Math.max(28, this.phenotype.tentacleLength * this.scale * 0.55);
    const frame = tentacleFrameTransform(this.tailFrame, current, maxLag);
    for (const chain of this.chains) {
      for (let node = 1; node < chain.length; node += 1) {
        const point = chain[node];
        const position = transformTentaclePoint(point.x, point.y, frame);
        const previous = transformTentaclePoint(point.oldX, point.oldY, frame);
        point.x = position.x;
        point.y = position.y;
        point.oldX = previous.x;
        point.oldY = previous.y;
      }
    }
    this.tailFrame = current;
  }

  private updateTentacles(dt: number, dragged: boolean): void {
    const rest = this.phenotype.tentacleLength / this.tentacleSegments;
    const drift = tentacleDrift(this.vx, this.vy, this.heading, dt, dragged);
    this.chains.forEach((chain, index) => {
      chain[0].x = this.anchorX(index);
      chain[0].y = 2;
      for (let node = 1; node < chain.length; node += 1) {
        const point = chain[node];
        const velocityX = (point.x - point.oldX) * 0.985;
        const velocityY = (point.y - point.oldY) * 0.985;
        point.oldX = point.x;
        point.oldY = point.y;
        point.x += velocityX + Math.sin(this.phase * 0.75 + index + node * 0.52) * dt * 2.4 *
          this.phenotype.tentacleSway + drift.x;
        point.y += velocityY + drift.y;
      }
      for (let pass = 0; pass < 3; pass += 1) {
        chain[0].x = this.anchorX(index);
        chain[0].y = 2;
        for (let node = 1; node < chain.length; node += 1) {
          const previous = chain[node - 1];
          const point = chain[node];
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          const distance = Math.max(0.001, Math.hypot(dx, dy));
          const correction = (distance - rest) / distance;
          point.x -= dx * correction * (node === 1 ? 1 : 0.5);
          point.y -= dy * correction * (node === 1 ? 1 : 0.5);
          if (node > 1) {
            previous.x += dx * correction * 0.5;
            previous.y += dy * correction * 0.5;
          }
        }
      }
    });
  }

  private draw(): void {
    const p = this.phenotype;
    const g = this.ink;
    g.clear();
    const glow = p.color;
    const pulseAmplitude = 0.065 + Math.max(0, p.pulseHz - 1.2) / 1.1 * 0.075;
    const pulse = 1 + Math.sin(this.phase) * pulseAmplitude + this.dashSeconds * 0.12;
    const w = p.bellWidth * pulse;
    const h = p.bellHeight / pulse;
    const rim = blendColor(p.gradientColor, 0xffffff, 0.58);
    const deep = blendColor(p.color, 0x102c49, 0.55);
    this.container.position.set(this.x, this.y);
    this.container.scale.set(this.scale);
    this.container.rotation = this.heading + Math.sin(this.phase * 0.4) * 0.025;
    const selection = this.selectionInk;
    selection.clear();
    if (this.selected) {
      selection.ellipse(0, -h * 0.43, w * 0.68, h * 1.04)
        .fill({ color: 0x8defff, alpha: 0.06 })
        .stroke({ color: 0xb8f7ff, alpha: 0.68, width: 2.1 });
      selection.circle(0, -h * 1.62, 3.4)
        .fill({ color: 0xe6ffff, alpha: 0.9 });
    }

    // Glow silhouette is inherited independently of brightness and bell pattern.
    for (const [scale, alpha] of [[1.35, 0.035], [1.15, 0.055], [0.97, 0.075]] as const) {
      const radiusX = w * scale * 0.58;
      const radiusY = h * scale * 0.82;
      const centerY = -h * 0.43;
      if (p.glowShape === 'circle') g.ellipse(0, centerY, radiusX, radiusY);
      else if (p.glowShape === 'cross') {
        const armX = radiusX * 0.31;
        const armY = radiusY * 0.31;
        g.moveTo(-armX, centerY - radiusY).lineTo(armX, centerY - radiusY)
          .lineTo(armX, centerY - armY).lineTo(radiusX, centerY - armY)
          .lineTo(radiusX, centerY + armY).lineTo(armX, centerY + armY)
          .lineTo(armX, centerY + radiusY).lineTo(-armX, centerY + radiusY)
          .lineTo(-armX, centerY + armY).lineTo(-radiusX, centerY + armY)
          .lineTo(-radiusX, centerY - armY).lineTo(-armX, centerY - armY).closePath();
      } else {
        for (let point = 0; point < 10; point += 1) {
          const angle = -Math.PI / 2 + point * Math.PI / 5;
          const radius = point % 2 ? 0.48 : 1;
          const x = Math.cos(angle) * radiusX * radius;
          const y = centerY + Math.sin(angle) * radiusY * radius;
          if (point === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
      }
      g.fill({ color: p.glowShape === 'circle' ? p.color : rim,
        alpha: alpha * (0.55 + p.glow) * (p.glowShape === 'circle' ? 1 : 2.8) });
      if (p.glowShape !== 'circle') {
        g.stroke({ color: rim, alpha: alpha * (2.2 + p.glow), width: 1.15 });
      }
    }

    // Two strokes give the fine filaments a translucent edge and bright core.
    this.chains.forEach((chain, index) => {
      if (p.tentacleForm === 'ribbon') this.drawRibbon(g, chain, index, glow, rim);
      else {
        g.moveTo(chain[0].x, chain[0].y);
        for (let node = 1; node < chain.length; node += 1) {
          g.lineTo(chain[node].x + this.tentacleWaveX(index, node), chain[node].y);
        }
        g.stroke({ color: deep, alpha: 0.47, width: p.filamentWidth + 1.5 });
        g.moveTo(chain[0].x, chain[0].y);
        for (let node = 1; node < chain.length; node += 1) {
          g.lineTo(chain[node].x + this.tentacleWaveX(index, node), chain[node].y);
        }
        g.stroke({ color: index % 3 === 0 ? rim : glow, alpha: 0.49 + p.glow * 0.22,
          width: Math.max(0.65, p.filamentWidth * 0.57) });
      }
      if (p.tentacleForm === 'starlit') this.drawStarlit(g, chain, index, rim);
      if (p.toxicity > 35 && index % 2 === 0) {
        const tip = chain[chain.length - 1];
        const venom = (p.toxicity - 35) / 65;
        g.circle(tip.x + this.tentacleWaveX(index, chain.length - 1), tip.y, 2.1 + venom * 2.4)
          .fill({ color: 0xd9ff8a, alpha: 0.24 + venom * 0.55 });
        if (p.toxicity > 70) g.circle(chain[4].x + this.tentacleWaveX(index, 4), chain[4].y, 1.7)
          .fill({ color: 0xd9ff8a, alpha: venom * 0.42 });
      }
    });

    // Several inherited regions jointly choose the actual canopy contour.
    this.drawBellPath(g, w, h);
    g.fill({ fill: this.bellGradient, alpha: 0.6 + p.glow * 0.16 })
      .stroke({ color: deep, alpha: 0.42, width: 3.2 });
    this.drawBellPath(g, w, h);
    g.stroke({ color: rim, alpha: 0.55 + p.glow * 0.18, width: 1.25 });

    const ribCount = Math.min(11, Math.max(5, p.scallops));
    for (let rib = 1; rib < ribCount; rib += 1) {
      const x = (rib / ribCount - 0.5) * w * 0.91;
      g.moveTo(0, -h * (p.bellShape === 'lantern' || p.bellShape === 'crystal' ? 1.08 : 0.78))
        .quadraticCurveTo(x * 0.72, -h * 0.45, x, -h * 0.06)
        .stroke({ color: rim, alpha: 0.11 + p.glow * 0.11, width: 0.8 });
    }
    g.ellipse(0, -h * 0.12, w * 0.39, h * 0.15)
      .fill({ color: deep, alpha: 0.14 })
      .stroke({ color: rim, alpha: 0.18, width: 0.9 });
    if (p.bellPattern === 1) {
      for (let line = -2; line <= 2; line += 1) {
        g.moveTo(0, -h * p.bellCurve * 0.84)
          .quadraticCurveTo(line * w * 0.06, -h * 0.53, line * w * 0.18, -h * 0.12)
          .stroke({ color: 0xdaf9ff, alpha: 0.2 + p.sparkle * 0.35, width: 1.2 });
      }
    } else if (p.bellPattern === 2) {
      for (let dot = 0; dot < 7; dot += 1) {
        const x = (dot / 6 - 0.5) * w * 0.68;
        const y = -h * (0.43 + 0.12 * Math.cos((dot / 6 - 0.5) * Math.PI));
        g.circle(x, y, 1.6 + p.sparkle * 1.7)
          .fill({ color: 0xf9e7b8, alpha: 0.55 + p.glow * 0.3 });
      }
    } else if (p.bellPattern === 3) {
      g.ellipse(0, -h * 0.52, w * 0.23, h * 0.18)
        .stroke({ color: 0xffe9a6, alpha: 0.55 + p.glow * 0.3, width: 1.5 });
      for (let dot = 0; dot < 9; dot += 1) {
        const angle = dot / 9 * Math.PI * 2;
        g.circle(Math.cos(angle) * w * 0.23, -h * 0.52 + Math.sin(angle) * h * 0.18, 1.8)
          .fill({ color: 0xfff3c9, alpha: 0.6 + p.sparkle * 0.3 });
      }
    } else if (p.bellPattern === 4) {
      for (let streak = -2; streak <= 2; streak += 1) {
        const x = streak * w * 0.14;
        g.moveTo(x - w * 0.08, -h * 0.25)
          .quadraticCurveTo(x - w * 0.16, -h * 0.57, x + w * 0.04, -h * 0.83)
          .stroke({ color: 0xbff9ff, alpha: 0.36 + p.sparkle * 0.42, width: 1.4 });
        g.circle(x + w * 0.04, -h * 0.83, 1.5 + p.sparkle)
          .fill({ color: 0xffffff, alpha: 0.52 + p.glow * 0.35 });
      }
    } else if (p.bellPattern === 5) {
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = ray * Math.PI / 4;
        const cx = Math.cos(angle);
        const cy = Math.sin(angle);
        g.moveTo(0, -h * 0.52)
          .lineTo(cx * w * 0.32, -h * 0.52 + cy * h * 0.35)
          .stroke({ color: 0xffedb5, alpha: 0.45 + p.sparkle * 0.42, width: ray % 2 ? 1 : 1.6 });
        g.circle(cx * w * 0.32, -h * 0.52 + cy * h * 0.35, 1.5)
          .fill({ color: 0xffffff, alpha: 0.65 + p.glow * 0.3 });
      }
      g.circle(0, -h * 0.52, 4).fill({ color: 0xfff2cb, alpha: 0.7 });
    }
    g.ellipse(-w * 0.18, -h * 0.63, w * 0.2, h * 0.095)
      .fill({ color: 0xffffff, alpha: 0.16 + p.glow * 0.1 });
    for (let bubble = 0; bubble < 4; bubble += 1) {
      const ascent = (this.phase * 0.16 + bubble * 0.27) % 1;
      const side = bubble % 2 ? 1 : -1;
      const x = side * w * (0.47 + 0.08 * Math.sin(this.phase * 0.3 + bubble));
      const y = h * 0.15 - ascent * h * 1.45;
      g.circle(x, y, 1.1 + (bubble % 2) * 0.7)
        .stroke({ color: rim, alpha: (1 - ascent) * (0.13 + p.glow * 0.2), width: 0.8 });
    }
    g.moveTo(-w * 0.36, -h * 0.19).quadraticCurveTo(0, h * 0.09, w * 0.36, -h * 0.19)
      .stroke({ color: rim, alpha: 0.28, width: 1 });
    for (const side of [-1, 1]) {
      const eyeX = side * w * 0.13;
      const eyeY = -h * 0.23;
      const eyeSize = Math.max(2.5, Math.min(5, w * 0.052));
      if (p.eyeShape === 'dot') g.circle(eyeX, eyeY, 1.9).fill({ color: 0x142f48, alpha: 0.85 });
      else if (p.eyeShape === 'line') {
        g.moveTo(eyeX - eyeSize, eyeY).lineTo(eyeX + eyeSize, eyeY)
          .stroke({ color: 0x142f48, alpha: 0.9, width: 2.1 });
      } else if (p.eyeShape === 'triangle') {
        g.moveTo(eyeX, eyeY - eyeSize).lineTo(eyeX + eyeSize, eyeY + eyeSize * 0.7)
          .lineTo(eyeX - eyeSize, eyeY + eyeSize * 0.7).closePath()
          .fill({ color: 0x142f48, alpha: 0.88 });
      } else {
        g.moveTo(eyeX - eyeSize, eyeY + eyeSize * 0.2)
          .quadraticCurveTo(eyeX, eyeY + eyeSize * 1.15, eyeX + eyeSize, eyeY + eyeSize * 0.2)
          .stroke({ color: 0x142f48, alpha: 0.9, width: 2.1 });
      }
    }
    if (p.rare) {
      for (let dot = 0; dot < 5; dot += 1) {
        const x = (dot / 4 - 0.5) * w * 0.7;
        g.circle(x, -h * (0.62 + 0.12 * Math.cos(dot)), 2.4)
          .fill({ color: 0xffe9a6, alpha: 0.4 + p.sparkle * 0.55 });
      }
    }
  }

  private drawBellPath(g: Graphics, w: number, h: number): void {
    const p = this.phenotype;
    const half = p.bellShape === 'lantern' ? w * 0.43 : w * 0.5;
    g.moveTo(-half, 0);
    if (p.bellShape === 'crown') {
      g.quadraticCurveTo(-w * 0.46, -h * 0.75, -w * 0.31, -h * 0.75)
        .lineTo(-w * 0.19, -h * 1.04)
        .quadraticCurveTo(-w * 0.08, -h * 0.88, 0, -h * 1.2)
        .quadraticCurveTo(w * 0.08, -h * 0.88, w * 0.19, -h * 1.04)
        .lineTo(w * 0.31, -h * 0.75)
        .quadraticCurveTo(w * 0.46, -h * 0.75, half, 0);
    } else if (p.bellShape === 'lantern') {
      g.quadraticCurveTo(-w * 0.6, -h * 0.85, -w * 0.28, -h * 1.17)
        .quadraticCurveTo(0, -h * 1.45, w * 0.28, -h * 1.17)
        .quadraticCurveTo(w * 0.6, -h * 0.85, half, 0);
    } else if (p.bellShape === 'lotus') {
      g.quadraticCurveTo(-w * 0.49, -h * 0.7, -w * 0.31, -h * 0.76)
        .quadraticCurveTo(-w * 0.17, -h * 1.18, 0, -h * 0.83)
        .quadraticCurveTo(w * 0.17, -h * 1.18, w * 0.31, -h * 0.76)
        .quadraticCurveTo(w * 0.49, -h * 0.7, half, 0);
    } else if (p.bellShape === 'crystal') {
      g.lineTo(-w * 0.4, -h * 0.75)
        .lineTo(-w * 0.29, -h * 1.12)
        .lineTo(-w * 0.17, -h * 0.86)
        .lineTo(0, -h * 1.4)
        .lineTo(w * 0.17, -h * 0.86)
        .lineTo(w * 0.29, -h * 1.12)
        .lineTo(w * 0.4, -h * 0.75)
        .lineTo(half, 0);
    } else if (p.bellShape === 'wing') {
      g.quadraticCurveTo(-w * 0.62, -h * 0.62, -w * 0.31, -h * 0.88)
        .quadraticCurveTo(-w * 0.13, -h * 0.93, 0, -h * 0.55)
        .quadraticCurveTo(w * 0.13, -h * 0.93, w * 0.31, -h * 0.88)
        .quadraticCurveTo(w * 0.62, -h * 0.62, half, 0);
    } else {
      g.quadraticCurveTo(-w * 0.47, -h * p.bellCurve * 0.92, 0, -h * p.bellCurve)
        .quadraticCurveTo(w * 0.47, -h * p.bellCurve * 0.92, half, 0);
    }
    for (let step = p.scallops - 1; step >= 0; step -= 1) {
      const right = -half + 2 * half * (step + 1) / p.scallops;
      const left = -half + 2 * half * step / p.scallops;
      const middle = (left + right) / 2;
      if (p.bellShape === 'crown' || p.bellShape === 'crystal') g.lineTo(middle, h * 0.16).lineTo(left, 0);
      else g.quadraticCurveTo(middle,
        h * (p.bellShape === 'lotus' ? 0.33 : p.bellShape === 'lantern' ? 0.09 :
          p.bellShape === 'wing' ? 0.27 : 0.19), left, 0);
    }
    g.closePath();
  }

  private drawForage(): void {
    const g = this.forageInk;
    g.clear();
    if (this.forageSeconds <= 0) return;
    const progress = 1 - this.forageSeconds / 0.95;
    const chain = this.chains[this.forageChain];
    const tip = chain[chain.length - 1];
    const startX = tip.x + this.tentacleWaveX(this.forageChain, chain.length - 1) + this.forageSide * 22;
    const startY = tip.y + 15;
    const targetX = this.forageSuccess ? 0 : startX + this.forageSide * 28;
    const targetY = this.forageSuccess ? -this.phenotype.bellHeight * 0.12 : startY + 24;
    const x = startX + (targetX - startX) * progress;
    const y = startY + (targetY - startY) * progress;
    const alpha = Math.min(1, this.forageSeconds * 2.5);
    g.circle(x, y, this.forageSuccess ? 3.5 : 2.5)
      .fill({ color: this.forageSuccess ? 0xcaffab : 0xb6e8f8, alpha });
    if (this.forageSuccess) {
      g.circle(x, y, 7 + progress * 4)
        .stroke({ color: 0xcaffab, alpha: alpha * 0.25, width: 1.2 });
    }
  }

  private drawFeeding(): void {
    const g = this.effects;
    g.clear();
    if (this.feedingSeconds <= 0) return;
    const elapsed = 1.25 - this.feedingSeconds;
    for (const dot of this.foodDots) {
      const progress = Math.max(0, Math.min(1, (elapsed - dot.delay) / 0.62));
      if (elapsed < dot.delay || progress >= 1) continue;
      const x = dot.x * (1 - progress);
      const y = dot.y * (1 - progress) - this.phenotype.bellHeight * 0.12 * progress;
      g.circle(x, y, 2.3 * (1 - progress * 0.45))
        .fill({ color: 0xc7fce4, alpha: 0.85 * (1 - progress) });
    }
    const shimmer = Math.max(0, 1 - elapsed / 0.8);
    if (shimmer) g.ellipse(0, -this.phenotype.bellHeight * 0.3,
      this.phenotype.bellWidth * (0.33 + elapsed * 0.08), this.phenotype.bellHeight * 0.3)
      .stroke({ color: 0xa8ffe4, alpha: shimmer * 0.55, width: 1.8 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.bellGradient.destroy();
  }
}
