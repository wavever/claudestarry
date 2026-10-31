import { galaxyPosition, accountStarSizeScale, dateToDay } from './model.js';

// A deliberately small renderer for browsers where Three.js cannot create a
// WebGL2 context. It keeps the galaxy legible and interactive instead of
// turning the whole page into an error state.
export function supportsWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2', { powerPreference: 'low-power' }));
  } catch {
    return false;
  }
}

export class FallbackUniverse {
  constructor(container, accounts, options = {}) {
    this.container = container;
    this.accounts = accounts || [];
    this.callbacks = options;
    this.config = options.config || {};
    this.cardSide = 'right';
    this.cardView = false;
    this.selected = -1;
    this.entryClock = { elapsed: 0 };
    this.uniforms = { uTextReveal: { value: 1 }, uTextMorph: { value: 0 }, uFormation: { value: 1 } };
    this.width = 1;
    this.height = 1;
    this.time = 0;
    this.day = dateToDay(new Date().toISOString().slice(0, 10));
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'universe-fallback';
    this.canvas.setAttribute('aria-label', options.ariaLabel || 'Interactive star field');
    this.canvas.tabIndex = 0;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');
    container.append(this.canvas);
    this.onResize = this.onResize.bind(this);
    this.onPointer = this.onPointer.bind(this);
    addEventListener('resize', this.onResize);
    this.canvas.addEventListener('click', this.onPointer);
    this.onResize();
    this.draw();
    options.onNebulaReady?.();
    options.onReady?.();
  }

  setAriaLabel(label) { if (label) this.canvas.setAttribute('aria-label', label); }
  setSlogan() {}
  setDay(day) { if (Number.isFinite(day)) this.day = day; }
  setAccounts(accounts) { this.accounts = accounts || []; this.draw(); }
  setSelection(index) { this.selected = index; this.draw(); }
  isAccountStarVisible(index) { return Boolean(this.accounts[index]); }
  setCardView(active, side = 'right') { this.cardView = active; this.cardSide = side; }
  applyConfig(config) { this.config = { ...this.config, ...config }; this.draw(); }
  replayEntry() {}
  finishEntry() {}
  reset() { this.selected = -1; this.draw(); }
  focus(index) { this.selected = index; this.draw(); return null; }
  ignite(index, onLand = () => {}) { if (!this.accounts[index]) return false; onLand(); return true; }
  zoom() {}
  projectPoint(x = 0, y = 0) { return { x: this.width / 2 + x * 12, y: this.height / 2 - y * 12, visible: true }; }
  project(index) {
    const account = this.accounts[index];
    if (!account) return { x: 0, y: 0, visible: false };
    const p = account.position || galaxyPosition(index * 19 + 521);
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    return { x: this.width / 2 + x * this.width * .018, y: this.height / 2 - y * this.height * .018, visible: true };
  }
  captureFrame() { return this.canvas.toDataURL('image/png'); }
  onResize() {
    this.width = Math.max(1, this.container.clientWidth || innerWidth);
    this.height = Math.max(1, this.container.clientHeight || innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  onPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hit = -1;
    let distance = innerWidth < 700 ? 24 : 16;
    for (let i = 0; i < this.accounts.length; i++) {
      const p = this.project(i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < distance) { hit = i; distance = d; }
    }
    if (hit >= 0) this.callbacks.onSelect?.(hit);
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const glow = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, Math.max(this.width, this.height) * .7);
    glow.addColorStop(0, '#0a1018'); glow.addColorStop(1, '#020202');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.accounts.length; i++) {
      const p = this.project(i);
      const scale = accountStarSizeScale(this.accounts[i], this.day);
      const radius = 2 + scale * 3.5;
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
      halo.addColorStop(0, 'rgba(255,248,238,.9)'); halo.addColorStop(.28, 'rgba(238,172,144,.45)'); halo.addColorStop(1, 'rgba(206,109,77,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i === this.selected ? '#fff8ee' : '#eec7ae';
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.callbacks.onFrame?.();
  }
}
