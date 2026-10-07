const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../src/core.js');

const key = (over = {}) => ({ time: 0, shortcut: false, composing: false, ...over });
const input = (over = {}) => ({
  isTrusted: true, isComposing: false, inputType: 'insertText', now: 100, lastKey: key(), ...over,
});

test('normalizeSettings applies defaults and rejects bad values', () => {
  assert.deepEqual(D.normalizeSettings(undefined), { enabled: true, mode: 'all' });
  assert.deepEqual(D.normalizeSettings({ enabled: false, mode: 'octopus' }), { enabled: false, mode: 'octopus' });
  assert.deepEqual(D.normalizeSettings({ enabled: 'yes', mode: 'dragon' }), { enabled: true, mode: 'all' });
});

test('pet pools and water per mode', () => {
  assert.deepEqual(D.petPool('all'), ['corgi', 'kitty', 'octopus', 'bunny']);
  assert.deepEqual(D.petPool('corgi-kitty'), ['corgi', 'kitty']);
  assert.deepEqual(D.petPool('off'), []);
  assert.deepEqual(D.petPool('bunny'), ['bunny']);
  assert.equal(D.hasWater('all'), true);
  assert.equal(D.hasWater('octopus'), true);
  assert.equal(D.hasWater('corgi-kitty'), false);
  assert.equal(D.hasWater('off'), false);
  assert.equal(D.hasKittyGarden('kitty'), true);
  assert.equal(D.hasKittyGarden('all'), false);
  assert.equal(D.hasKittyGarden('corgi'), false);
  assert.equal(D.hasBunnyGarden('bunny'), true);
  assert.equal(D.hasBunnyGarden('all'), false);
});

test('isEligibleEditable accepts text fields and contenteditable only', () => {
  const el = (o) => ({ nodeType: 1, ...o });
  assert.equal(D.isEligibleEditable(el({ tagName: 'INPUT', type: 'text' })), true);
  assert.equal(D.isEligibleEditable(el({ tagName: 'INPUT', type: 'search' })), true);
  assert.equal(D.isEligibleEditable(el({ tagName: 'TEXTAREA' })), true);
  assert.equal(D.isEligibleEditable(el({ tagName: 'DIV', isContentEditable: true })), true);
  assert.equal(D.isEligibleEditable(el({ tagName: 'INPUT', type: 'password' })), false);
  assert.equal(D.isEligibleEditable(el({ tagName: 'INPUT', type: 'checkbox' })), false);
  assert.equal(D.isEligibleEditable(el({ tagName: 'INPUT', type: 'text', readOnly: true })), false);
  assert.equal(D.isEligibleEditable(el({ tagName: 'TEXTAREA', disabled: true })), false);
  assert.equal(D.isEligibleEditable(el({ tagName: 'DIV' })), false);
  assert.equal(D.isEligibleEditable(null), false);
});

test('describeKey flags ctrl/meta shortcuts but not AltGr or Shift', () => {
  assert.equal(D.describeKey({ ctrlKey: true }, 0).shortcut, true);
  assert.equal(D.describeKey({ metaKey: true }, 0).shortcut, true);
  assert.equal(D.describeKey({ shiftKey: true }, 0).shortcut, false);
  const altGr = { ctrlKey: true, altKey: true, getModifierState: (k) => k === 'AltGraph' };
  assert.equal(D.describeKey(altGr, 0).shortcut, false);
  assert.equal(D.describeKey({ key: 'Process' }, 0).composing, true);
  assert.equal(D.describeKey({ isComposing: true }, 0).composing, true);
});

test('classifyInput counts trusted typing and deletion', () => {
  assert.equal(D.classifyInput(input()), 'count');
  assert.equal(D.classifyInput(input({ inputType: 'deleteContentBackward' })), 'count');
  assert.equal(D.classifyInput(input({ inputType: 'insertParagraph' })), 'count');
});

test('classifyInput ignores paste, drop, undo, cut and spellcheck', () => {
  for (const inputType of ['insertFromPaste', 'insertFromDrop', 'historyUndo', 'deleteByCut', 'insertReplacementText']) {
    assert.equal(D.classifyInput(input({ inputType })), 'input-type', inputType);
  }
});

test('classifyInput ignores untrusted, shortcut and keyless edits', () => {
  assert.equal(D.classifyInput(input({ isTrusted: false })), 'untrusted');
  assert.equal(D.classifyInput(input({ lastKey: key({ shortcut: true }) })), 'shortcut');
  assert.equal(D.classifyInput(input({ lastKey: null })), 'no-key');
  assert.equal(D.classifyInput(input({ lastKey: key({ time: 0 }), now: 5000 })), 'stale-key');
});

test('classifyInput ignores IME composition events and their echo', () => {
  assert.equal(D.classifyInput(input({ isComposing: true })), 'composition');
  assert.equal(D.classifyInput(input({ inputType: 'insertCompositionText' })), 'composition');
  assert.equal(D.classifyInput(input({ lastKey: key({ composing: true }) })), 'no-key');
  assert.equal(D.classifyInput(input({ now: 110, compositionEndedAt: 100 })), 'ime-echo');
  assert.equal(D.classifyInput(input({ now: 200, compositionEndedAt: 100 })), 'count');
});

test('ComboTracker flags spark at 3 and celebration every 10', () => {
  const t = new D.ComboTracker();
  const ed = {};
  const results = [];
  for (let i = 0; i < 20; i++) results.push(t.hit(ed, i * 100));
  assert.equal(results[1].spark, false);
  assert.equal(results[2].spark, true);
  assert.deepEqual(results.filter((r) => r.celebrate).map((r) => r.combo), [10, 20]);
});

test('ComboTracker resets after 1.5s of inactivity', () => {
  const t = new D.ComboTracker();
  const ed = {};
  t.hit(ed, 0);
  t.hit(ed, 1000);
  assert.equal(t.hit(ed, 2500).combo, 3);
  assert.equal(t.hit(ed, 4001).combo, 1);
  assert.equal(t.tick(5000), false);
  assert.equal(t.tick(5502), true);
  assert.equal(t.combo, 0);
});

test('ComboTracker resets when the editor changes', () => {
  const t = new D.ComboTracker();
  const a = {};
  const b = {};
  t.hit(a, 0);
  t.hit(a, 100);
  assert.equal(t.hit(b, 200).combo, 1);
});
