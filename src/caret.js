// Estimates the caret position in viewport coordinates. Text is never stored; the
// mirror node used for inputs/textareas is removed immediately after measuring.
(function (root) {
  'use strict';
  const NS = (root.DPMC = root.DPMC || {});

  const MIRROR_PROPS = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
    'lineHeight', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
  ];

  function fallbackPoint(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(24, r.width / 2), y: r.top + r.height / 2 };
  }

  function formCaret(el, scratch) {
    const cs = getComputedStyle(el);
    const mirror = document.createElement('div');
    for (const prop of MIRROR_PROPS) mirror.style[prop] = cs[prop];
    const multiline = el.tagName === 'TEXTAREA';
    mirror.style.cssText += ';position:absolute;top:0;left:0;visibility:hidden;overflow:hidden;' +
      `white-space:${multiline ? 'pre-wrap' : 'pre'};word-wrap:break-word;`;
    const pos = el.selectionStart ?? el.value.length;
    mirror.textContent = el.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    scratch.appendChild(mirror);
    try {
      const r = el.getBoundingClientRect();
      const x = r.left + el.clientLeft + marker.offsetLeft - el.scrollLeft;
      const y = r.top + el.clientTop + marker.offsetTop - el.scrollTop + marker.offsetHeight / 2;
      return {
        x: Math.min(Math.max(x, r.left), r.right),
        y: Math.min(Math.max(y, r.top), r.bottom),
      };
    } finally {
      mirror.remove();
    }
  }

  function editableCaret(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height && !rect.left && !rect.top)) return null;
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }

  function getCaretPoint(el, scratch) {
    try {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return formCaret(el, scratch);
      return editableCaret(el) || fallbackPoint(el);
    } catch (_) {
      return fallbackPoint(el);
    }
  }

  NS.getCaretPoint = getCaretPoint;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
