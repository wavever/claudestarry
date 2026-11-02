import { seededRandom } from './model.js';

export class ParticleCounter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.count = -1;
    this.locale = 'zh-CN';
    this.particles = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 140;
    this.height = 54;
    this.running = false;
    this.raf = null;
    this.onResize = this.onResize.bind(this);
    this.animate = this.animate.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    this.setupCanvas();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.start();
  }

  setupCanvas() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.height = window.innerWidth < 600 ? 28 : 36;
    this.width = window.innerWidth < 600 ? 24 : 32;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  onResize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.count >= 0) {
      this.sampleNumber(this.count, true);
    }
  }

  onVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.animate);
  }

  stop() {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  setCount(nextCount, locale = this.locale) {
    const val = Math.max(0, Number(nextCount) || 0);
    if (val === this.count && locale === this.locale && this.particles.length > 0) return;
    const instant = this.count === -1;
    this.count = val;
    this.locale = locale;
    this.sampleNumber(val, instant);
  }

  sampleNumber(num, instant = false) {
    const text = num.toLocaleString(this.locale === 'zh-CN' ? 'zh-CN' : 'en-US');
    const scale = 2;
    const fontSize = window.innerWidth < 600 ? 20 : 26;

    // 动态度量宽度，让数字与前后文案自然紧凑衔接
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = `700 ${fontSize * scale}px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const measuredW = Math.ceil(mctx.measureText(text).width / scale);

    this.width = Math.max(22, measuredW + 8);
    this.height = window.innerWidth < 600 ? 28 : 36;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(this.width * scale);
    offscreen.height = Math.round(this.height * scale);
    const octx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!octx) return;

    octx.font = `700 ${fontSize * scale}px "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    octx.fillText(text, offscreen.width / 2, offscreen.height / 2 + 1 * scale);

    const imgData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const pixels = imgData.data;
    const targetPoints = [];
    const step = 2.0 * scale;

    const rand = seededRandom(num * 1009 + 31);
    for (let y = 0; y < offscreen.height; y += step) {
      for (let x = 0; x < offscreen.width; x += step) {
        const idx = (Math.floor(y) * offscreen.width + Math.floor(x)) * 4;
        if (pixels[idx + 3] >= 85) {
          const jx = (rand() - 0.5) * (step / scale * 0.2);
          const jy = (rand() - 0.5) * (step / scale * 0.2);
          targetPoints.push({
            x: x / scale + jx,
            y: y / scale + jy,
          });
        }
      }
    }

    if (targetPoints.length === 0) {
      targetPoints.push({ x: this.width / 2, y: this.height / 2 });
    }

    // Shuffle targets to prevent directional sweep during morphing
    for (let i = targetPoints.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [targetPoints[i], targetPoints[j]] = [targetPoints[j], targetPoints[i]];
    }

    const newParticles = [];
    const maxLen = Math.max(this.particles.length, targetPoints.length);

    for (let i = 0; i < maxLen; i++) {
      const target = targetPoints[i];
      const existing = this.particles[i];

      if (target && existing) {
        // Morph existing particle to new target
        existing.tx = target.x;
        existing.ty = target.y;
        existing.targetAlpha = 1;
        if (instant) {
          existing.x = target.x;
          existing.y = target.y;
          existing.alpha = 1;
        }
        newParticles.push(existing);
      } else if (target) {
        // Spawn new particle
        // Bright white and ice-white particles carry the numeral themselves.
        const color = rand() < 0.35 ? '255, 255, 255' : '235, 247, 255';

        const startX = instant ? target.x : target.x + (rand() - 0.5) * 16;
        const startY = instant ? target.y : target.y + (rand() - 0.5) * 16;

        newParticles.push({
          x: startX,
          y: startY,
          tx: target.x,
          ty: target.y,
          alpha: instant ? 1 : 0,
          targetAlpha: 1,
          color,
          speed: 1.0 + rand() * 2.2,
          phase: rand() * Math.PI * 2,
          radius: 0.75 + rand() * 0.15,
        });
      } else if (existing) {
        // Disperse extra particle
        existing.targetAlpha = 0;
        existing.tx += (rand() - 0.5) * 14;
        existing.ty += (rand() - 0.5) * 14;
        newParticles.push(existing);
      }
    }

    this.particles = newParticles;
  }

  animate(now) {
    if (!this.running) return;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';

    const alive = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += (p.tx - p.x) * 0.16;
      p.y += (p.ty - p.y) * 0.16;
      p.alpha += (p.targetAlpha - p.alpha) * 0.14;

      if (p.targetAlpha === 0 && p.alpha < 0.02) {
        continue;
      }
      alive.push(p);

      // 恒定静谧星光，不添加闪烁抖动
      const a = Math.max(0, Math.min(1, p.alpha));
      if (a < 0.01) continue;

      this.ctx.fillStyle = `rgba(${p.color}, ${a.toFixed(3)})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.particles = alive;

    this.ctx.restore();
    this.raf = requestAnimationFrame(this.animate);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.particles = [];
  }
}
