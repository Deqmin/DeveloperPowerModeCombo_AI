// DOM-free simulation: pets, ink clouds, seaweed and typing particles with hard caps.
(function (root) {
  'use strict';
  const NS = (root.DPMC = root.DPMC || {});
  if (!NS.petPool && typeof require === 'function') require('./core.js');
  if (!NS.PET_SIZE && typeof require === 'function') require('./sprites.js');

  const LIMITS = Object.freeze({ pets: 3, ink: 24, particles: 150, bandHeight: 60, fps: 30 });
  const NEON = ['#ff2bd6', '#00f5ff', '#faff00', '#39ff14', '#ff6a00'];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  class InkPool {
    constructor(rng, cap = LIMITS.ink) {
      this.rng = rng;
      this.cap = cap;
      this.blots = [];
    }
    spawn(b) {
      if (this.blots.length >= this.cap) return false;
      this.blots.push({ age: 0, ...b });
      return true;
    }
    update(dt) {
      const drag = Math.pow(0.5, dt);
      for (let i = this.blots.length - 1; i >= 0; i--) {
        const b = this.blots[i];
        b.age += dt;
        if (b.age >= b.life) {
          this.blots.splice(i, 1);
          continue;
        }
        b.x += b.vx * dt;
        b.y = clamp(b.y + b.vy * dt, 2, LIMITS.bandHeight - 2);
        b.vx *= drag;
        b.vy *= drag;
        b.r += b.grow * dt;
      }
    }
    clear() {
      this.blots.length = 0;
    }
  }

  class ParticlePool {
    constructor(rng, cap = LIMITS.particles) {
      this.rng = rng;
      this.cap = cap;
      this.list = [];
    }
    spawn(x, y, count) {
      for (let i = 0; i < count; i++) {
        if (this.list.length >= this.cap) this.list.shift();
        const life = 0.35 + this.rng() * 0.4;
        this.list.push({
          x, y,
          vx: (this.rng() - 0.5) * 240,
          vy: -60 - this.rng() * 180,
          life, max: life,
          size: 2 + Math.floor(this.rng() * 3),
          color: NEON[Math.floor(this.rng() * NEON.length)],
        });
      }
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.list.splice(i, 1);
          continue;
        }
        p.vy += 420 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    clear() {
      this.list.length = 0;
    }
  }

  class PetSim {
    constructor(opts = {}) {
      this.rng = opts.rng || Math.random;
      this.width = opts.width || 1024;
      this.mode = 'off';
      this.pets = [];
      this.pending = [];
      this.ink = new InkPool(this.rng);
      this.seaweed = [];
      this.nextId = 1;
      this._buildSeaweed();
    }

    setWidth(w) {
      this.width = Math.max(1, w);
      this._buildSeaweed();
    }

    setMode(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      this.pets = [];
      this.pending = [];
      this.ink.clear();
      const pool = NS.petPool(mode);
      for (let i = 0; i < LIMITS.pets && pool.length; i++) {
        this.pets.push(this._spawn(pool[i % pool.length], i));
      }
    }

    update(dt) {
      for (let i = this.pets.length - 1; i >= 0; i--) {
        const p = this.pets[i];
        p.phase += dt;
        p.x += p.dir * p.speed * dt;
        if (p.species === 'octopus') {
          p.y = p.baseY + Math.sin(p.phase * 1.6) * 6;
          p.inkTimer -= dt;
          if (p.inkTimer <= 0) {
            this._releaseInk(p);
            p.inkTimer = 4 + this.rng() * 6;
          }
        }
        const gone = p.dir > 0 ? p.x > this.width : p.x < -p.w;
        if (gone) {
          this.pets.splice(i, 1);
          this.pending.push(0.4 + this.rng() * 1.6);
        }
      }
      const pool = NS.petPool(this.mode);
      for (let i = this.pending.length - 1; i >= 0; i--) {
        this.pending[i] -= dt;
        if (this.pending[i] <= 0) {
          this.pending.splice(i, 1);
          if (pool.length && this.pets.length < LIMITS.pets) {
            this.pets.push(this._spawn(pool[Math.floor(this.rng() * pool.length)], -1));
          }
        }
      }
      this.ink.update(dt);
    }

    _spawn(species, index) {
      const size = NS.PET_SIZE[species];
      const dir = this.rng() < 0.5 ? -1 : 1;
      let x;
      if (index >= 0) x = ((index + 0.2 + this.rng() * 0.6) / LIMITS.pets) * this.width - size.w / 2;
      else x = dir > 0 ? -size.w : this.width;
      const octo = species === 'octopus';
      return {
        id: this.nextId++,
        species, dir, x,
        w: size.w, h: size.h,
        y: octo ? 12 : LIMITS.bandHeight - 2 - size.h,
        baseY: 10 + this.rng() * 6,
        speed: octo ? 28 + this.rng() * 28 : 40 + this.rng() * 40,
        phase: this.rng() * 10,
        inkTimer: 2 + this.rng() * 5,
      };
    }

    _releaseInk(p) {
      const n = 4 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        this.ink.spawn({
          x: p.x + p.w / 2 - p.dir * p.w * 0.4 + (this.rng() - 0.5) * 8,
          y: p.y + 14 + (this.rng() - 0.5) * 10,
          vx: -p.dir * (10 + this.rng() * 30) + (this.rng() - 0.5) * 30,
          vy: (this.rng() - 0.5) * 24,
          r: 2 + this.rng() * 2.5,
          grow: 2.5 + this.rng() * 2.5,
          life: 1.8 + this.rng() * 1.2,
        });
      }
    }

    _buildSeaweed() {
      const out = [];
      for (let x = 20; x < this.width && out.length < 30; x += 60 + this.rng() * 60) {
        out.push({ x, h: 14 + this.rng() * 14, phase: this.rng() * 6.28 });
      }
      this.seaweed = out;
    }
  }

  Object.assign(NS, { LIMITS, NEON, PetSim, InkPool, ParticlePool });

  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
