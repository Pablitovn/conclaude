// ============================================================
// 00-accessibility.js — Accesibilidad (a11y) y navegación
// Debe correr ANTES que otros módulos para inyectar atributos
// ============================================================

(function (global) {
  "use strict";
  const LGMDM = global.LGMDM = global.LGMDM || {};
  LGMDM.a11y = LGMDM.a11y || {};

  // A10 (audit): counter incremental para IDs de aria-labelledby.
  // Antes usaba Math.random() que generaba IDs distintos cada vez que
  // se llamaba enhanceAccessibility() (e.g. hot-reload, re-mount del
  // workspace). El aria-labelledby quedaba apuntando al ID viejo y
  // los screen readers no encontraban el section label.
  let _a11yIdCounter = 0;
  function nextA11yId() {
    return `a11y-section-${++_a11yIdCounter}`;
  }

  // ── Agregar aria-labels a botones y controles sin label ──
  function enhanceAccessibility() {
    // Botones en el sidebar
    document.querySelectorAll('.sidebar-tab').forEach((btn, idx) => {
      const label = btn.textContent.trim();
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
      btn.setAttribute('aria-label', `Tab ${idx + 1}: ${label}`);
    });

    // Botones de acción
    const btnLabels = {
      'btnAnalyze': 'Analizar audio (Ctrl+Shift+A)',
      'btnAdvice': 'Obtener recomendaciones de IA (Ctrl+Shift+R)',
      'btnMasterSync': 'Masterizar sincrónico (Ctrl+Shift+M)',
      'btnMasterAsync': 'Encolar mastering (Ctrl+Shift+Q)',
      'btnPitchCorrection': 'Corregir pitch (Ctrl+Shift+P)',
      'btnNormalizeLufs': 'Normalizar por LUFS',
      'btnLoadPresetJson': 'Cargar preset desde archivo JSON',
      'btnRefreshLibrary': 'Actualizar librería',
      'btnOpenRefLib': 'Abrir biblioteca de referencias',
      'devToggleBtn': 'Alternar panel de desarrollador',
    };

    Object.entries(btnLabels).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el && !el.hasAttribute('aria-label')) {
        el.setAttribute('aria-label', label);
      }
    });

    // File inputs
    const fileInputs = [
      { id: 'fileInput', label: 'Seleccionar archivo de audio' },
      { id: 'refFileInput', label: 'Seleccionar archivo de referencia' },
      { id: 'presetJsonInput', label: 'Seleccionar archivo de preset JSON' },
    ];

    fileInputs.forEach(({ id, label }) => {
      const el = document.getElementById(id);
      if (el) {
        el.setAttribute('aria-label', label);
      }
    });

    // Range sliders con aria-valuetext
    document.querySelectorAll('input[type="range"]').forEach(slider => {
      const label = slider.previousElementSibling?.textContent || slider.id;
      if (!slider.hasAttribute('aria-label') && label) slider.setAttribute('aria-label', String(label).trim());
      updateSliderAriaValue(slider);
    });

    // Checkboxes y selects
    document.querySelectorAll('input[type="checkbox"], select').forEach(el => {
      if (!el.hasAttribute('aria-label') && el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent ||
                     el.parentElement?.querySelector('.field-group')?.textContent ||
                     el.id;
        if (label) {
          el.setAttribute('aria-label', label.trim());
        }
      }
    });

    // Secciones de contenido
    document.querySelectorAll('.section-label').forEach(section => {
      const parent = section.parentElement;
      if (parent && !parent.hasAttribute('role')) {
        parent.setAttribute('role', 'region');
        if (section.id) {
          // A10: si el section ya tiene ID (de una llamada previa), reusar.
          parent.setAttribute('aria-labelledby', section.id);
        } else {
          const generatedId = nextA11yId();
          section.id = generatedId;
          parent.setAttribute('aria-labelledby', generatedId);
        }
      }
    });

    // Native labels: do not override implicit labels. For unlabeled controls, derive a name from their nearest field wrapper.
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((control) => {
      if (control.matches('[aria-label], [aria-labelledby]')) return;
      const explicit = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
      if (explicit) return;
      if (control.closest('label')) return;
      const wrapper = control.closest('.control-row, .field, .field-group, .param, .control-group');
      const candidate = wrapper?.querySelector('label, .label, .param-label, .field-label');
      if (candidate && candidate !== control) {
        const text = candidate.textContent.trim().replace(/\s+/g, ' ');
        if (text) control.setAttribute('aria-label', text);
      } else if (control.id) {
        const fallback = control.dataset.label || control.id.replace(/^s-/, '').replace(/[-_]/g, ' ');
        control.setAttribute('aria-label', fallback);
      }
    });

    // Sidebar tabs: complete the tablist/tabpanel relationship.
    const sidebarTabs = document.getElementById('sidebarTabs');
    if (sidebarTabs) {
      sidebarTabs.setAttribute('role', 'tablist');
      sidebarTabs.setAttribute('aria-label', 'Secciones de la consola');
      sidebarTabs.querySelectorAll('.sidebar-tab').forEach((tab) => {
        const pane = tab.dataset.pane;
        const paneEl = document.querySelector(`.sidebar-${CSS.escape(pane)}`);
        if (!pane) return;
        const tabId = tab.id || `sidebar-tab-${pane}`;
        tab.id = tabId;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', paneEl?.id || pane);
        tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
        if (paneEl) {
          if (!paneEl.id) paneEl.id = pane;
          paneEl.setAttribute('role', 'tabpanel');
          paneEl.setAttribute('aria-labelledby', tabId);
          paneEl.hidden = !tab.classList.contains('active');
        }
      });
    }

    // Workspace tabs: establish complete ARIA relationships.
    document.querySelectorAll('.lg-workspace-workspace-tabs').forEach((tablist) => {
      tablist.querySelectorAll('[role=tab]').forEach((tab) => {
        const workspace = tab.dataset.workspace;
        if (!workspace) return;
        const tabId = tab.id || `workspace-tab-${workspace}`;
        const panel = document.querySelector(`.lg-workspace-workspace[data-workspace="${CSS.escape(workspace)}"]`);
        tab.id = tabId;
        if (panel) {
          if (!panel.id) panel.id = `workspace-panel-${workspace}`;
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', tabId);
        }
      });
    });

    // Panel blocks como landmarks
    document.querySelectorAll('.panel-block').forEach((panel, idx) => {
      if (!panel.hasAttribute('role')) {
        panel.setAttribute('role', 'complementary');
        const title = panel.querySelector('.section-label, .summary-accent');
        if (title) {
          panel.setAttribute('aria-label', title.textContent.trim());
        }
      }
    });
  }

  // ── Actualizar aria-valuetext en sliders ──
  function updateSliderAriaValue(slider) {
    const value = slider.value;
    const unit = slider.id.includes('lufs') ? ' LUFS' : 
                 slider.id.includes('db') ? ' dB' :
                 slider.id.includes('ms') ? ' ms' :
                 slider.id.includes('hz') ? ' Hz' : '';
    
    slider.setAttribute('aria-valuenow', value);
    slider.setAttribute('aria-valuetext', value + unit);
  }

  // ── Escuchar cambios en sliders ──
  function setupSliderAriaUpdates() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
      const bind = window.LGMDM.ui.bindOnce;
      bind(slider, 'input', () => updateSliderAriaValue(slider), 'a11y-slider-input');
      bind(slider, 'change', () => updateSliderAriaValue(slider), 'a11y-slider-change');
    });
  }

  // Tab key navigation is intentionally left to the browser's native focus model.
  // We only implement roving focus inside composite tab widgets.

  // ── Skip to main content ──
  function addSkipLink() {
    if (document.querySelector('.skip-link')) return;
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Ir al contenido principal';
    skipLink.className = 'skip-link';
    skipLink.setAttribute('aria-label', 'Saltar a contenido principal');
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  // Focus indicators and skip-link presentation live in the main stylesheet.

  // ── Announcement screen reader ──
  function announceToScreenReader(message, priority = 'polite') {
    let announcement = document.getElementById('a11y-announcements');
    if (!announcement) {
      announcement = document.createElement('div');
      announcement.id = 'a11y-announcements';
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'a11y-visually-hidden';
      document.body.appendChild(announcement);
    }
    
    announcement.setAttribute('aria-live', priority);
    announcement.textContent = message;
    
    // Clear después de 3s
    setTimeout(() => {
      announcement.textContent = '';
    }, 3000);
  };

  // ── Color contrast checker (desarrollo) ──
  function checkContrastIssues() {
    const issues = [];
    document.querySelectorAll('[style*="color"]').forEach(el => {
      const bg = window.getComputedStyle(el).backgroundColor;
      const fg = window.getComputedStyle(el).color;
      // Esto es simplificado; en producción usar libcontrastchecker
      console.log(`${el.id || el.className}: bg=${bg}, fg=${fg}`);
    });
    return issues;
  };

  // ── Inicializar al cargar ──
  const initA11y = () => {
    addSkipLink();
    enhanceAccessibility();
    setupSliderAriaUpdates();
  };
  const bindOnce = window.LGMDM.ui.bindOnce;
  LGMDM.a11y.announce = announceToScreenReader;
  LGMDM.a11y.checkContrast = checkContrastIssues;
  if (document.readyState === 'loading') bindOnce(document, 'DOMContentLoaded', initA11y, 'a11y-dom-ready', { once: true });
  else initA11y();

})(window);
