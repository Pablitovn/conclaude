/**
 * 22-tabs-handler.js — owner único de la navegación del sidebar.
 *
 * Contrato DOM real:
 *   #sidebarTabs > .sidebar-tab[data-pane]
 *   #sidebarPaneContainer.sidebar-showing-*
 *   #pasoCadena / #pasoSalida
 *   #projects-section
 *
 * NOTA: "pane-archivo" (subir archivo / metadata / presets) se movió a
 * #cnsPanelLeft (junto a "Plugins disponibles"), fuera de este sidebar.
 * Por eso ya no es un tab acá; el tab por defecto ahora es "pane-cadena".
 */
(function () {
  'use strict';

  const LG = window.LGMDM = window.LGMDM || {};
  LG.tabs = LG.tabs || {};
  const TAB_STATE = LG.tabs.state = LG.tabs.state || { activeTab: 'pane-cadena' };
  const bindOnce = LG.ui?.bindOnce || ((el, ev, fn, key, opts) => {
    if (el) el.addEventListener(ev, fn, opts);
  });

  const PANE_TO_CLASS = {
    'pane-cadena': 'cadena',
    'pane-salida': 'salida',
  };

  const PANE_TO_DETAILS = {
    'pane-cadena': 'pasoCadena',
    'pane-salida': 'pasoSalida',
  };

  const VALID_TABS = new Set([
    'pane-cadena',
    'pane-salida',
    'pane-proyectos',
  ]);

  function persist(tabName) {
    try { LG.storage?.set('active-tab', tabName); } catch (_) {}
  }

  function setProjectsVisible(visible) {
    const projects = document.getElementById('projects-section');
    if (!projects) return;
    projects.classList.toggle('projects-section-hidden', !visible);
  }

  function closeSidebarDetails() {
    Object.values(PANE_TO_DETAILS)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((details) => details.removeAttribute('open'));
  }

  function selectTabInternal(tabName) {
    const normalized = VALID_TABS.has(tabName) ? tabName : 'pane-cadena';
    const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab[data-pane]');
    const paneContainer = document.getElementById('sidebarPaneContainer');

    TAB_STATE.activeTab = normalized;
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.pane === normalized));

    if (normalized === 'pane-proyectos') {
      closeSidebarDetails();
      setProjectsVisible(true);
      LG.projects?.loadAndRenderProjects?.();
      return;
    }

    setProjectsVisible(false);

    if (paneContainer) {
      paneContainer.classList.remove(
        'sidebar-showing-archivo',
        'sidebar-showing-cadena',
        'sidebar-showing-salida',
      );
      paneContainer.classList.add(`sidebar-showing-${PANE_TO_CLASS[normalized]}`);
    }

    closeSidebarDetails();
    const activeDetails = document.getElementById(PANE_TO_DETAILS[normalized]);
    if (activeDetails) activeDetails.setAttribute('open', '');
  }

  function selectTab(tabName) {
    selectTabInternal(tabName);
    persist(TAB_STATE.activeTab);
  }

  LG.tabs.select = selectTab;
  LG.tabs.getActive = () => TAB_STATE.activeTab;

  function initTabs() {
    const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab[data-pane]');
    if (!tabs.length) return;

    tabs.forEach((tab) => bindOnce(
      tab,
      'click',
      () => selectTab(tab.dataset.pane),
      'tabs-handler-click',
    ));

    let saved = null;
    try { saved = LG.storage?.get('active-tab'); } catch (_) {}
    selectTabInternal(VALID_TABS.has(saved) ? saved : 'pane-cadena');
  }

  bindOnce(document, 'DOMContentLoaded', initTabs, 'tabs-handler-dom-ready', { once: true });
  if (document.readyState !== 'loading') initTabs();
})();
