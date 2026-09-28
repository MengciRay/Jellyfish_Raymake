import { Container, Graphics } from 'pixi.js';
import { express, type Phenotype } from '../shared/genome';
import type { JellyData } from './world';

interface Point { x: number; y: number; oldX: number; oldY: number }

export class JellyView {
  readonly container = new Container();
  readonly phenotype: Phenotype;
  private readonly ink = new Graphics();
  private readonly chains: Point[][];
  private phase = Math.random() * Math.PI * 2;
  private direction = Math.random() * Math.PI * 2;
  private vx = 0;
  private vy = 0;
  x: number;
  y: number;

  constructor(readonly data: JellyData, width: number, height: number) {
    this.phenotype = express(data.genome);
    this.x = data.x * width;
    this.y = data.y * height;
    this.container.addChild(this.ink);
    this.chains = Array.from({ length: this.phenotype.tentacles }, (_, tentacle) => {
      const anchorX = this.anchorX(tentacle);
      return Array.from({ length: 8 }, (_, node) => {
        const y = node * this.phenotype.tentacleLength / 7;
        return { x: anchorX, y, oldX: anchorX, oldY: y };
      });
    });
  }

  get scale(): number {
    return Math.min(1, 0.58 + this.data.ageSeconds / 210);
  }

  hit(x: number, y: number): boolean {
    const width = this.phenotype.bellWidth * this.scale;
    const height = this.phenotype.bellHeight * this.scale;
    return Math.abs(x - this.x) < width * 0.6 && y > this.y - height * 1.3 && y < this.y + height * 0.6;
  }

  update(deltaSeconds: number, width: number, height: number, dragged: boolean): void {
    const dt = Math.min(deltaSeconds, 0.05);
    this.phase += dt * this.phenotype.pulseHz * Math.PI * 2;
    this.direction += (Math.random() - 0.5) * this.phenotype.wander * dt * 1.8;
    if (!dragged) {
      const margin = Math.max(80, this.phenotype.tentacleLength * this.scale);
      if (this.x < margin) this.direction = 0;
      if (this.x > width - margin) this.direction = Math.PI;
      if (this.y < 90) this.direction = Math.PI / 2;
      if (this.y > height - margin) this.direction = -Math.PI / 2;
      const tiredness = 0.45 + this.data.energy * 0.55;
      const speed = this.phenotype.swimSpeed * tiredness;
      this.vx += (Math.cos(this.direction) * speed - this.vx) * Math.min(1, dt * 1.2);
      this.vy += (Math.sin(this.direction) * speed - this.vy) * Math.min(1, dt * 1.2);
      this.x = Math.max(30, Math.min(width - 30, this.x + this.vx * dt));
      this.y = Math.max(55, Math.min(height - 40, this.y + this.vy * dt + Math.sin(this.phase) * dt * 8));
    } else {
      this.vx = 0;
      this.vy = 0;
    }
    this.data.ageSeconds += dt;
    this.data.energy = Math.max(0, this.data.energy - dt * 0.00028);
    this.data.x = this.x / width;
    this.data.y = this.y / height;
    this.updateTentacles(dt);
    this.draw();
  }

  private anchorX(index: number): number {
    return (index / Math.max(1, this.phenotype.tentacles - 1) - 0.5) * this.phenotype.bellWidth * 0.76;
  }

  private updateTentacles(dt: number): void {
    const rest = this.phenotype.tentacleLength / 7;
    this.chains.forEach((chain, index) => {
      chain[0].x = this.anchorX(index);
      chain[0].y = 2;
      for (let node = 1; node < chain.length; node += 1) {
        const point = chain[node];
        const velocityX = (point.x - point.oldX) * 0.985;
        const velocityY = (point.y - point.oldY) * 0.985;
        point.oldX = point.x;
        point.oldY = point.y;
        point.x += velocityX + Math.sin(this.phase * 0.75 + index + node * 0.52) * dt * 2.4 - this.vx * dt * 0.12;
        point.y += velocityY + 180 * dt * dt - this.vy * dt * 0.06;
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
    const pulse = 1 + Math.sin(this.phase) * 0.065;
    const w = p.bellWidth * pulse;
    const h = p.bellHeight / pulse;
    this.container.position.set(this.x, this.y);
    this.container.scale.set(this.scale);

    // Fine filaments hang from a bounded set of Verlet points.
    this.chains.forEach((chain, index) => {
      g.moveTo(chain[0].x, chain[0].y);
      chain.slice(1).forEach((point) => g.lineTo(point.x, point.y));
      g.stroke({ color: glow, alpha: index % 3 === 0 ? 0.7 : 0.48, width: p.filamentWidth });
      if (p.toxicity > 72 && index % 2 === 0) {
        const tip = chain[chain.length - 1];
        g.circle(tip.x, tip.y, 2.8).fill({ color: 0xd9ff8a, alpha: 0.7 });
      }
    });

    // The bell is generated from genome-controlled width, height and scallop count.
    g.moveTo(-w / 2, 0)
      .quadraticCurveTo(-w * 0.47, -h * 0.92, 0, -h)
      .quadraticCurveTo(w * 0.47, -h * 0.92, w / 2, 0);
    for (let step = p.scallops - 1; step >= 0; step -= 1) {
      const right = -w / 2 + w * (step + 1) / p.scallops;
      const left = -w / 2 + w * step / p.scallops;
      g.quadraticCurveTo((left + right) / 2, h * 0.19, left, 0);
    }
    g.closePath().fill({ color: glow, alpha: 0.57 }).stroke({ color: 0xffffff, alpha: 0.37, width: 1.3 });
    g.ellipse(-w * 0.16, -h * 0.62, w * 0.21, h * 0.12).fill({ color: 0xffffff, alpha: 0.21 });
    g.circle(-w * 0.13, -h * 0.23, 1.9).fill({ color: 0x142f48, alpha: 0.85 });
    g.circle(w * 0.13, -h * 0.23, 1.9).fill({ color: 0x142f48, alpha: 0.85 });
    if (p.rare) {
      for (let dot = 0; dot < 5; dot += 1) {
        const x = (dot / 4 - 0.5) * w * 0.7;
        g.circle(x, -h * (0.62 + 0.12 * Math.cos(dot)), 2.4)
          .fill({ color: 0xffe9a6, alpha: 0.9 });
      }
    }
  }
}
