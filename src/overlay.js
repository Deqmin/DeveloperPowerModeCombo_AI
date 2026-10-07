// Isolated, click-through canvas overlay with a single ~30 FPS animation loop.
(function (root) {
  'use strict';
  const NS = (root.DPMC = root.DPMC || {});

  const MIN_FRAME_MS = 1000 / NS.LIMITS.fps - 4;
  const BAND = NS.LIMITS.bandHeight;
  const SHAKE_SECONDS = 0.35;

  const GLYPHS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
    4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010',
    8: '111101111101111', 9: '111101111001111',
    C: '111100100100111', O: '111101101101111', M: '101111111101101', B: '110101110101110',
  };

  function textWidth(str, unit) {
    return (str.length * 4 - 1) * unit;
  }

  function drawText(ctx, str, x, y, unit, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]];
      for (let k = 0; k < 15; k++) {
        if (g[k] === '1') ctx.fillRect(x + (i * 4 + (k % 3)) * unit, y + Math.floor(k / 3) * unit, unit, unit);
      }
    }
  }

  function tierColor(n) {
    if (n >= 30) return '#ff6a00';
    if (n >= 20) return '#ff2bd6';
    if (n >= 10) return '#faff00';
    return '#00f5ff';
  }

  class Overlay {
    constructor(rng = Math.random) {
      this.host = document.createElement('div');
      this.host.style.cssText =
        'all:initial!important;position:fixed!important;top:0!important;left:0!important;' +
        'width:100%!important;height:100%!important;pointer-events:none!important;' +
        'z-index:2147483647!important;contain:strict!important;';
      this.scratchRoot = this.host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = 'canvas{display:block;width:100%;height:100%;pointer-events:none}';
      this.canvas = document.createElement('canvas');
      this.scratchRoot.append(style, this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.sim = new NS.PetSim({ rng });
      this.particles = new NS.ParticlePool(rng);
      this.rng = rng;
      this.counter = { value: 0, alpha: 0, target: 0, pulse: 0 };
      this.shake = 0;
      this.t = 0;
      this.power = true;
      this.mode = 'off';
      this.reduced = false;
      this.raf = 0;
      this.lastRender = 0;
      this.pageVisible = !document.hidden;

      this._frame = this._frame.bind(this);
      this._onResize = () => this._resize();
      this._onVisibility = () => {
        this.pageVisible = !document.hidden;
        if (!this.pageVisible) this._stop();
        else this._wake();
      };
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVisibility);
      this._attach();
      this._resize();
    }

    configure({ power, mode, reducedMotion }) {
      this.power = power;
      this.reduced = reducedMotion;
      this.mode = mode;
      this.sim.setMode(reducedMotion ? 'off' : mode);
      if (!power) {
        this.counter.value = 0;
        this.counter.target = 0;
        this.counter.alpha = 0;
        this.particles.clear();
      }
      this._wake();
    }

    hit({ combo, spark, celebrate, caret }) {
      if (!this.power) return;
      this._attach();
      const c = this.counter;
      c.value = combo;
      c.target = combo >= NS.COUNTER_MIN ? 1 : 0;
      if (this.reduced) {
        c.alpha = c.target;
        this._renderStatic();
        return;
      }
      c.pulse = 1;
      if (caret && spark) this.particles.spawn(caret.x, caret.y, 6);
      if (celebrate) {
        this.shake = SHAKE_SECONDS;
        if (caret) this.particles.spawn(caret.x, caret.y, 18);
      }
      this._wake();
    }

    clearCombo() {
      this.counter.target = 0;
      if (this.reduced) {
        this.counter.alpha = 0;
        this._renderStatic();
      } else {
        this._wake();
      }
    }

    destroy() {
      this._stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      this.host.remove();
    }

    _attach() {
      if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    }

    _resize() {
      const w = document.documentElement.clientWidth || window.innerWidth;
      const h = document.documentElement.clientHeight || window.innerHeight;
      this.canvas.width = w;
      this.canvas.height = h;
      this.sim.setWidth(w);
      if (this.reduced) this._renderStatic();
      else if (!this.raf) this._wake();
    }

    _needsAnimation() {
      const c = this.counter;
      return (
        this.sim.pets.length > 0 || this.sim.pending.length > 0 || this.sim.ink.blots.length > 0 ||
        this.particles.list.length > 0 || c.alpha > 0 || c.target > 0 || c.pulse > 0 || this.shake > 0
      );
    }

    _wake() {
      if (this.reduced) {
        this._stop();
        this._renderStatic();
        return;
      }
      if (this.raf || !this.pageVisible) return;
      if (this._needsAnimation()) {
        this.lastRender = 0;
        this.raf = requestAnimationFrame(this._frame);
      } else {
        this._clear();
      }
    }

    _stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    _frame(ts) {
      this.raf = 0;
      if (!this.pageVisible) return;
      const elapsed = ts - this.lastRender;
      if (!this.lastRender || elapsed >= MIN_FRAME_MS) {
        const dt = this.lastRender ? Math.min(0.1, elapsed / 1000) : 1 / 30;
        this.lastRender = ts;
        this._update(dt);
        this._render();
      }
      if (this._needsAnimation()) this.raf = requestAnimationFrame(this._frame);
      else {
        this.lastRender = 0;
        this._clear();
      }
    }

    _update(dt) {
      this.t += dt;
      this.sim.update(dt);
      this.particles.update(dt);
      const c = this.counter;
      c.alpha = c.alpha < c.target ? Math.min(c.target, c.alpha + dt * 8) : Math.max(c.target, c.alpha - dt * 3);
      c.pulse = Math.max(0, c.pulse - dt * 5);
      this.shake = Math.max(0, this.shake - dt);
    }

    _clear() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _render() {
      const ctx = this.ctx;
      this._clear();
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (this.shake > 0) {
        const amp = 5 * (this.shake / SHAKE_SECONDS);
        ctx.translate(Math.round((this.rng() - 0.5) * 2 * amp), Math.round((this.rng() - 0.5) * 2 * amp));
      }
      if (this.sim.mode !== 'off') this._renderAmbient();
      if (this.power) {
        this._renderParticles();
        this._renderCounter(1 + 0.25 * this.counter.pulse);
      }
      ctx.restore();
    }

    _renderAmbient() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const t = this.t;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, BAND);
      ctx.clip();

      if (NS.hasWater(this.sim.mode)) {
        const grad = ctx.createLinearGradient(0, 0, 0, BAND);
        grad.addColorStop(0, 'rgba(90,190,255,0.14)');
        grad.addColorStop(1, 'rgba(20,90,180,0.32)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, BAND);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = 0; x < w; x += 6) ctx.fillRect(x, 2 + Math.round(Math.sin(x * 0.05 + t * 2) * 1.5), 6, 2);
        for (const s of this.sim.seaweed) {
          const n = Math.ceil(s.h / 4);
          for (let k = 0; k < n; k++) {
            const sway = Math.sin(t * 1.2 + s.phase + k * 0.5) * k * 0.7;
            ctx.fillStyle = k % 2 ? 'rgba(47,158,95,0.85)' : 'rgba(60,190,115,0.85)';
            ctx.fillRect(Math.round(s.x + sway), BAND - (k + 1) * 4, 3, 4);
          }
        }
      }

      for (const b of this.sim.ink.blots) {
        ctx.globalAlpha = 0.6 * (1 - b.age / b.life);
        ctx.fillStyle = '#231946';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const pet of this.sim.pets) NS.drawPet(ctx, pet);
      ctx.restore();
    }

    _renderParticles() {
      const ctx = this.ctx;
      for (const p of this.particles.list) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    _renderCounter(scale) {
      const c = this.counter;
      if (c.alpha <= 0) return;
      const ctx = this.ctx;
      const label = 'COMBO';
      const num = String(c.value);
      const color = tierColor(c.value);
      const right = this.canvas.width - 24;
      const top = BAND + 12;
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.translate(right, top);
      ctx.scale(scale, scale);
      const lw = textWidth(label, 3);
      drawText(ctx, label, -lw + 3, 3, 3, '#0b0620');
      drawText(ctx, label, -lw, 0, 3, color);
      const nw = textWidth(num, 6);
      drawText(ctx, num, -nw + 4, 24 + 4, 6, '#0b0620');
      drawText(ctx, num, -nw, 24, 6, color);
      ctx.restore();
    }

    _renderStatic() {
      this._clear();
      if (this.power && this.counter.alpha > 0) this._renderCounter(1);
    }
  }

  NS.Overlay = Overlay;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
