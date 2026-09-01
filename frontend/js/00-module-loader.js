// filepath: js/00-module-loader.js
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  const loaded = new Map();
  const lazyModules = [
    'js/17-keyboard-shortcuts.js',
    'js/18-undo-redo.js',
    'js/20-pro-upgrades.js',
    'js/23-pro-console.js',
    'js/27-health-tooltips.js'
  ];

  function loadScript(src) {
    if (loaded.has(src)) return loaded.get(src);
    const promise = new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-lgmdm-loader="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.lgmdmLoader = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
    loaded.set(src, promise);
    return promise;
  }

  function loadIdle() {
    const run = () => Promise.allSettled(lazyModules.map(loadScript));
    if ('requestIdleCallback' in global) global.requestIdleCallback(run, { timeout: 1800 });
    else setTimeout(run, 900);
  }

  LGMDM.loader = { loadScript, loadIdle };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadIdle, { once: true });
  else loadIdle();
})(window);
