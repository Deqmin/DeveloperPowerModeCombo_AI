// Content script: detects confirmed keyboard edits and drives the overlay.
// Typed text is never read into variables, stored, logged or transmitted.
(function () {
  'use strict';
  const D = globalThis.DPMC;
  if (!D || window.top !== window) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tracker = new D.ComboTracker();

  let settings = D.normalizeSettings(null);
  let overlay = null;
  let resetTimer = 0;
  let lastKey = null;
  let compositionEndedAt = -Infinity;

  function editorFrom(e) {
    let el = e.composedPath ? e.composedPath()[0] : e.target;
    if (el && el.nodeType !== 1) el = el.parentElement;
    if (!el) return null;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
    }
    return D.isEligibleEditable(el) ? el : null;
  }

  function resetCombo() {
    clearTimeout(resetTimer);
    tracker.reset();
    if (overlay) overlay.clearCombo();
  }

  function registerHit(editor) {
    if (!settings.enabled || !overlay) return;
    const r = tracker.hit(editor, performance.now());
    const caret = r.spark || r.celebrate ? D.getCaretPoint(editor, overlay.scratchRoot) : null;
    overlay.hit({ combo: r.combo, spark: r.spark, celebrate: r.celebrate, caret });
    clearTimeout(resetTimer);
    resetTimer = setTimeout(resetCombo, D.COMBO_TIMEOUT_MS);
  }

  function apply() {
    const active = settings.enabled || settings.mode !== 'off';
    if (!active) {
      resetCombo();
      if (overlay) overlay.destroy();
      overlay = null;
      return;
    }
    if (!overlay) overlay = new D.Overlay();
    overlay.configure({ power: settings.enabled, mode: settings.mode, reducedMotion: reducedMotion.matches });
    if (!settings.enabled) resetCombo();
  }

  const opts = { capture: true, passive: true };

  document.addEventListener('keydown', (e) => {
    if (e.isTrusted) lastKey = D.describeKey(e, performance.now());
  }, opts);

  document.addEventListener('input', (e) => {
    if (!settings.enabled) return;
    const editor = editorFrom(e);
    if (!editor) return;
    const verdict = D.classifyInput({
      isTrusted: e.isTrusted,
      isComposing: e.isComposing,
      inputType: e.inputType,
      now: performance.now(),
      lastKey,
      compositionEndedAt,
    });
    if (verdict === 'count') registerHit(editor);
  }, opts);

  // One hit per committed composition; interim insertCompositionText events are ignored.
  document.addEventListener('compositionend', (e) => {
    if (!settings.enabled || !e.isTrusted) return;
    const editor = editorFrom(e);
    if (!editor || !e.data) return;
    compositionEndedAt = performance.now();
    registerHit(editor);
  }, opts);

  document.addEventListener('focusin', (e) => {
    if (tracker.editor && editorFrom(e) !== tracker.editor) resetCombo();
  }, opts);

  reducedMotion.addEventListener('change', apply);

  chrome.storage.local.get(D.STORAGE_KEY, (res) => {
    settings = D.normalizeSettings(res && res[D.STORAGE_KEY]);
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[D.STORAGE_KEY]) return;
    settings = D.normalizeSettings(changes[D.STORAGE_KEY].newValue);
    apply();
  });
})();
