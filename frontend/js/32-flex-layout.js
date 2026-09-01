/*
 * LGMDM Layout Controller — owner único del shell/sidebar/resizer.
 *
 * Contrato DOM real:
 *   .lg-app-body > .lg-sidebar | #sidebarResizeHandle | .lg-main-stack
 *
 * Desktop: sidebar redimensionable.
 * < 960px: una sola columna; el resize queda deshabilitado.
 */
(function () {
  'use strict';

  const LGMDM = window.LGMDM = window.LGMDM || {};
  const root = document.documentElement;
  const layoutRoot = document.getElementById('appBody') || document.querySelector('.lg-app-body');
  const sidebar = layoutRoot?.querySelector(':scope > .lg-sidebar');
  const content = layoutRoot?.querySelector(':scope > .lg-main-stack');
  const handle = document.getElementById('sidebarResizeHandle');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');

  if (!layoutRoot || !sidebar || !content || !handle) return;

  const bindOnce = LGMDM.ui?.bindOnce || ((el, ev, fn, key, opts) => {
    if (el) el.addEventListener(ev, fn, opts);
  });

  const KEY_W = 'lgmdm:flex-sidebar-w';
  const KEY_C = 'lgmdm:flex-sidebar-collapsed';
  const MIN = 250;
  const isDesktop = () => window.innerWidth >= 960;
  const maxWidth = () => Math.max(420, Math.min(560, Math.round(window.innerWidth * 0.42)));
  const clamp = (value) => Math.max(MIN, Math.min(maxWidth(), Number(value) || 320));

  function apply(width) {
    if (!isDesktop()) return null;
    const px = Math.round(clamp(width));
    root.style.setProperty('--lg-sidebar-w', `${px}px`);
    layoutRoot.style.setProperty(
      'grid-template-columns',
      `${px}px 10px minmax(0, 1fr)`,
      'important',
    );
    return px;
  }

  function save(width) {
    try { LGMDM.storage?.set(KEY_W, String(Math.round(width))); } catch (_) {}
  }

  function setCollapsed(collapsed, persist = true) {
    sidebar.classList.toggle('collapsed', collapsed);
    layoutRoot.classList.toggle('sidebar-collapsed', collapsed);

    if (isDesktop()) {
      if (collapsed) {
        layoutRoot.style.setProperty(
          'grid-template-columns',
          '0 0 minmax(0, 1fr)',
          'important',
        );
      } else {
        let saved = NaN;
        try { saved = parseFloat(LGMDM.storage?.get(KEY_W) || ''); } catch (_) {}
        apply(Number.isFinite(saved) ? saved : Math.round(window.innerWidth * 0.22));
      }
    } else {
      layoutRoot.style.removeProperty('grid-template-columns');
    }

    if (collapseBtn) {
      collapseBtn.textContent = collapsed ? '▶' : '‹';
      collapseBtn.title = collapsed ? 'Expandir sidebar' : 'Contraer sidebar';
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    }

    if (persist) {
      try { LGMDM.storage?.set(KEY_C, String(collapsed)); } catch (_) {}
    }
  }

  let dragging = false;
  let startX = 0;
  let startW = 0;

  bindOnce(handle, 'pointerdown', (event) => {
    if (!isDesktop() || sidebar.classList.contains('collapsed')) return;
    dragging = true;
    startX = event.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('lgmdm-layout-dragging');
    event.preventDefault();
  }, 'flex-pointerdown');

  bindOnce(handle, 'pointermove', (event) => {
    if (dragging) apply(startW + event.clientX - startX);
  }, 'flex-pointermove');

  const end = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('lgmdm-layout-dragging');
    save(sidebar.getBoundingClientRect().width);
  };

  bindOnce(handle, 'pointerup', end, 'flex-pointerup');
  bindOnce(handle, 'pointercancel', end, 'flex-pointercancel');
  bindOnce(handle, 'dblclick', () => {
    const width = Math.round(window.innerWidth * 0.22);
    apply(width);
    save(width);
  }, 'flex-dblclick');

  bindOnce(handle, 'keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      apply(sidebar.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? -16 : 16));
      save(sidebar.getBoundingClientRect().width);
    } else if (event.key === 'Home') {
      event.preventDefault();
      apply(MIN);
      save(MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      const width = maxWidth();
      apply(width);
      save(width);
    }
  }, 'flex-keyboard');

  bindOnce(collapseBtn, 'click', () => {
    setCollapsed(!sidebar.classList.contains('collapsed'));
  }, 'flex-collapse');

  function fit() {
    if (!isDesktop()) {
      layoutRoot.style.removeProperty('grid-template-columns');
      return;
    }
    if (sidebar.classList.contains('collapsed')) return;

    let saved = NaN;
    try { saved = parseFloat(LGMDM.storage?.get(KEY_W) || ''); } catch (_) {}
    const fallback = window.innerWidth < 1100
      ? window.innerWidth * 0.28
      : window.innerWidth * 0.22;
    apply(Number.isFinite(saved) ? saved : fallback);
  }

  bindOnce(window, 'resize', fit, 'flex-window-resize', { passive: true });

  let collapsed = false;
  try { collapsed = LGMDM.storage?.get(KEY_C) === 'true'; } catch (_) {}
  setCollapsed(collapsed, false);
  fit();
})();
