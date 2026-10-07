// Pure logic: settings, edit classification and combo tracking. No DOM access, no text storage.
(function (root) {
  'use strict';
  const NS = (root.DPMC = root.DPMC || {});

  const STORAGE_KEY = 'dpmcSettings';
  const MODES = ['all', 'corgi-kitty', 'corgi', 'kitty', 'octopus', 'off'];
  const DEFAULT_SETTINGS = Object.freeze({ enabled: true, mode: 'all' });

  const COMBO_TIMEOUT_MS = 1500;
  const SPARK_AT = 3;
  const CELEBRATE_EVERY = 10;
  const COUNTER_MIN = 2;
  const KEY_WINDOW_MS = 1000;
  const IME_ECHO_MS = 20;

  const PET_POOLS = {
    all: ['corgi', 'kitty', 'octopus'],
    'corgi-kitty': ['corgi', 'kitty'],
    corgi: ['corgi'],
    kitty: ['kitty'],
    octopus: ['octopus'],
    off: [],
  };

  const COUNTED_INPUT_TYPES = new Set([
    'insertText',
    'insertLineBreak',
    'insertParagraph',
    'deleteContentBackward',
    'deleteContentForward',
  ]);

  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel']);

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
      mode: MODES.includes(s.mode) ? s.mode : DEFAULT_SETTINGS.mode,
    };
  }

  function petPool(mode) {
    return (PET_POOLS[mode] || []).slice();
  }

  function hasWater(mode) {
    return mode === 'all' || mode === 'octopus';
  }

  // Duck-typed so it can be unit-tested with plain objects.
  function isEligibleEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.readOnly) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(String(el.type || 'text').toLowerCase());
    return el.isContentEditable === true;
  }

  // Keeps only modifier flags and timing from a keydown, never the key itself.
  function describeKey(e, now) {
    const altGraph = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
    return {
      time: now,
      shortcut: Boolean((e.ctrlKey || e.metaKey) && !altGraph),
      composing: Boolean(e.isComposing) || e.key === 'Process',
    };
  }

  // Returns 'count' for a confirmed keyboard edit, otherwise the reason it was ignored.
  function classifyInput(info) {
    if (!info.isTrusted) return 'untrusted';
    if (info.isComposing || info.inputType === 'insertCompositionText') return 'composition';
    if (!COUNTED_INPUT_TYPES.has(info.inputType)) return 'input-type';
    if (info.now - (info.compositionEndedAt ?? -Infinity) < IME_ECHO_MS) return 'ime-echo';
    const key = info.lastKey;
    if (!key || key.composing) return 'no-key';
    if (info.now - key.time > KEY_WINDOW_MS) return 'stale-key';
    if (key.shortcut) return 'shortcut';
    return 'count';
  }

  class ComboTracker {
    constructor(opts = {}) {
      this.timeoutMs = opts.timeoutMs ?? COMBO_TIMEOUT_MS;
      this.sparkAt = opts.sparkAt ?? SPARK_AT;
      this.celebrateEvery = opts.celebrateEvery ?? CELEBRATE_EVERY;
      this.combo = 0;
      this.editor = null;
      this.lastHit = -Infinity;
    }

    hit(editor, now) {
      if (editor !== this.editor || now - this.lastHit > this.timeoutMs) this.combo = 0;
      this.editor = editor;
      this.lastHit = now;
      this.combo += 1;
      return {
        combo: this.combo,
        spark: this.combo >= this.sparkAt,
        celebrate: this.combo % this.celebrateEvery === 0,
      };
    }

    // Returns true when the combo was reset by inactivity.
    tick(now) {
      if (this.combo > 0 && now - this.lastHit > this.timeoutMs) {
        this.reset();
        return true;
      }
      return false;
    }

    reset() {
      this.combo = 0;
      this.editor = null;
      this.lastHit = -Infinity;
    }
  }

  Object.assign(NS, {
    STORAGE_KEY,
    MODES,
    DEFAULT_SETTINGS,
    COMBO_TIMEOUT_MS,
    SPARK_AT,
    CELEBRATE_EVERY,
    COUNTER_MIN,
    normalizeSettings,
    petPool,
    hasWater,
    isEligibleEditable,
    describeKey,
    classifyInput,
    ComboTracker,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
