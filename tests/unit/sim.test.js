const test = require('node:test');
const assert = require('node:assert/strict');
require('../../src/core.js');
require('../../src/sprites.js');
const D = require('../../src/sim.js');

function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('sprite grids are rectangular and use known palette keys', () => {
  const grids = [...D.SPRITES.corgi, ...D.SPRITES.kitty, D.OCTOPUS_HEAD];
  for (const rows of grids) {
    const w = rows[0].length;
    for (const row of rows) {
      assert.equal(row.length, w, `row "${row}"`);
      for (const ch of row) assert.ok(ch === '.' || D.PALETTE[ch], `unknown palette key ${ch}`);
    }
  }
  assert.equal(D.SPRITES.corgi[0].length, D.SPRITES.corgi[1].length);
  assert.equal(D.SPRITES.corgi[0][0].length * D.PET_SCALE, D.PET_SIZE.corgi.w);
  assert.equal(D.SPRITES.kitty[0][0].length * D.PET_SCALE, D.PET_SIZE.kitty.w);
  assert.equal(D.SPRITES.kitty[0].length * D.PET_SCALE, D.PET_SIZE.kitty.h);
  assert.equal(D.OCTOPUS_HEAD[0].length * D.PET_SCALE, D.PET_SIZE.octopus.w);
});

test('pets never exceed three, including while respawning', () => {
  const sim = new D.PetSim({ rng: seeded(7), width: 400 });
  sim.setMode('all');
  assert.equal(sim.pets.length, 3);
  for (let i = 0; i < 3000; i++) {
    sim.update(1 / 30);
    assert.ok(sim.pets.length + sim.pending.length <= D.LIMITS.pets);
  }
  assert.equal(sim.pets.length + sim.pending.length, 3);
});

test('pets respawn automatically after leaving the screen', () => {
  const sim = new D.PetSim({ rng: seeded(3), width: 200 });
  sim.setMode('corgi');
  const firstIds = sim.pets.map((p) => p.id);
  for (let i = 0; i < 30 * 60; i++) sim.update(1 / 30);
  assert.equal(sim.pets.length, 3);
  assert.ok(sim.pets.every((p) => !firstIds.includes(p.id)), 'original pets were replaced');
});

test('each mode only spawns species from its pool; off spawns none', () => {
  for (const mode of D.MODES) {
    const sim = new D.PetSim({ rng: seeded(5), width: 500 });
    sim.setMode(mode);
    for (let i = 0; i < 2000; i++) sim.update(1 / 30);
    const allowed = D.petPool(mode);
    assert.ok(sim.pets.every((p) => allowed.includes(p.species)), mode);
    assert.equal(sim.pets.length + sim.pending.length, allowed.length ? 3 : 0, mode);
  }
});

test('octopuses stay inside the 60px band and release ink within the cap', () => {
  const sim = new D.PetSim({ rng: seeded(11), width: 800 });
  sim.setMode('octopus');
  let sawInk = false;
  for (let i = 0; i < 30 * 120; i++) {
    sim.update(1 / 30);
    for (const p of sim.pets) assert.ok(p.y >= 0 && p.y + p.h <= D.LIMITS.bandHeight, `y=${p.y}`);
    assert.ok(sim.ink.blots.length <= D.LIMITS.ink);
    for (const b of sim.ink.blots) assert.ok(b.y >= 0 && b.y <= D.LIMITS.bandHeight);
    sawInk ||= sim.ink.blots.length > 0;
  }
  assert.ok(sawInk);
});

test('corgis and kitties stand inside the band', () => {
  const sim = new D.PetSim({ rng: seeded(2), width: 600 });
  sim.setMode('corgi-kitty');
  for (const p of sim.pets) assert.ok(p.y >= 0 && p.y + p.h <= D.LIMITS.bandHeight);
});

test('only octopuses release ink', () => {
  const sim = new D.PetSim({ rng: seeded(9), width: 600 });
  sim.setMode('corgi-kitty');
  for (let i = 0; i < 30 * 60; i++) sim.update(1 / 30);
  assert.equal(sim.ink.blots.length, 0);
});

test('ink pool refuses blots beyond 24 and blots fade out', () => {
  const ink = new D.InkPool(seeded(), 24);
  let accepted = 0;
  for (let i = 0; i < 100; i++) accepted += ink.spawn({ x: 0, y: 30, vx: 0, vy: 0, r: 3, grow: 5, life: 1 }) ? 1 : 0;
  assert.equal(accepted, 24);
  ink.update(1.1);
  assert.equal(ink.blots.length, 0);
});

test('particle pool never holds more than 150 particles', () => {
  const pool = new D.ParticlePool(seeded());
  for (let i = 0; i < 100; i++) pool.spawn(10, 10, 20);
  assert.equal(pool.list.length, D.LIMITS.particles);
  pool.update(1);
  assert.equal(pool.list.length, 0);
});

test('movement is delta-time based', () => {
  const run = (steps, dt) => {
    const sim = new D.PetSim({ rng: seeded(4), width: 100000 });
    sim.setMode('corgi');
    const before = sim.pets.map((p) => p.x);
    for (let i = 0; i < steps; i++) sim.update(dt);
    return sim.pets.map((p, i) => Math.abs(p.x - before[i]));
  };
  const a = run(30, 1 / 30);
  const b = run(60, 1 / 60);
  a.forEach((d, i) => assert.ok(Math.abs(d - b[i]) < 1e-6));
});

test('frame cap constant is 30 FPS', () => {
  assert.equal(D.LIMITS.fps, 30);
  assert.equal(D.LIMITS.bandHeight, 60);
});

test('seaweed is generated within the viewport width', () => {
  const sim = new D.PetSim({ rng: seeded(6), width: 1200 });
  assert.ok(sim.seaweed.length > 0 && sim.seaweed.length <= 30);
  assert.ok(sim.seaweed.every((s) => s.x < 1200 && s.h <= 28));
});
