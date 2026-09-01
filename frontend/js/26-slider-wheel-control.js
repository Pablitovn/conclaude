// ============================================================
// 26-slider-wheel-control.js — Mouse wheel control for range inputs
// ============================================================
(() => {
  'use strict';

  const SELECTOR = 'input[type="range"], .lg-console-slider';
  const FINE_FACTOR = 0.25;
  const FAST_FACTOR = 4;

  function decimalsForStep(step) {
    const text = String(step ?? '1');
    if (!text.includes('.')) return 0;
    return text.split('.')[1].replace(/0+$/, '').length;
  }

  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function nudge(el, direction, event) {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const step = Number(el.step || 1);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return false;

    let multiplier = 1;
    if (event.ctrlKey || event.metaKey) multiplier = FAST_FACTOR;
    else if (event.shiftKey || event.altKey) multiplier = FINE_FACTOR;

    let delta = step * multiplier * direction;
    // Preserve meaningful small adjustments without creating values below step precision.
    if (multiplier < 1) delta = Math.max(step * FINE_FACTOR, Number.EPSILON);

    const current = Number(el.value);
    if (!Number.isFinite(current)) return false;

    let next = Math.min(max, Math.max(min, current + delta));
    const precision = decimalsForStep(el.step || step);
    const base = Math.abs(min / step) % 1 === 0 ? min : 0;
    next = Math.round((next - base) / step) * step + base;
    next = Math.min(max, Math.max(min, next));
    if (precision > 0) next = Number(next.toFixed(Math.min(8, precision + 2)));

    if (next === current) return false;
    el.value = String(next);
    dispatchInput(el);
    el.classList.add('lg-wheel-adjusted');
    window.clearTimeout(el._lgWheelTimer);
    el._lgWheelTimer = window.setTimeout(() => el.classList.remove('lg-wheel-adjusted'), 180);
    return true;
  }

  function bind(el) {
    if (el.dataset.lgWheelBound === '1') return;
    el.dataset.lgWheelBound = '1';
    el.addEventListener('wheel', (event) => {
      if (el.disabled || el.readOnly) return;
      const direction = event.deltaY < 0 ? 1 : -1;
      if (nudge(el, direction, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, { passive: false });

    el.addEventListener('mouseenter', () => el.classList.add('lg-wheel-ready'));
    el.addEventListener('mouseleave', () => el.classList.remove('lg-wheel-ready'));
  }

  function bindAll(root = document) {
    root.querySelectorAll(SELECTOR).forEach(bind);
  }

  bindAll();
  // Q4 (audit): antes observaba `document.body` con `subtree: true`,
  // lo que disparaba el callback ante CUALQUIER mutación del DOM
  // (no solo inserciones top-level). Ahora usamos `childList` sin
  // `subtree`, observando `documentElement`. Los inputs nuevos
  // viven en containers que se insertan, así que la mutación
  // top-level los cubre; `bindAll(node)` ya recorre el subárbol
  // del nuevo contenedor, así que no se pierde nada.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (typeof node.matches === 'function' && node.matches(SELECTOR)) bind(node);
        bindAll(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true });
})();
