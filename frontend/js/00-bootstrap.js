// ============================================================
// 00-bootstrap.js — helpers globales mínimos que antes vivían
// como <script> inline en index.html.
//
// BUGFIX (CSP): el servidor sirve con
// "Content-Security-Policy: script-src 'self' https://cdnjs.cloudflare.com",
// que bloquea cualquier <script> inline sin nonce/hash. Los dos bloques
// inline que tenía index.html (el helper API() y el fix de zoom táctil en
// mobile) se movieron acá — 'self' sí permite archivos .js servidos por el
// mismo origen.
// ============================================================

// API URL — delega siempre en el cliente API canónico.
const API = () => {
  if (typeof window.LGMDM?.api?.apiBase === 'function') {
    return window.LGMDM.api.apiBase();
  }
  return 'https://masteringstudio-api.duckdns.org';
};

// Touch helpers.
// S14 (audit): el handler anterior hacía `e.preventDefault()` en CUALQUIER
// `touchend` que ocurriera a menos de 300ms del anterior. Eso bloqueaba
// el pinch-zoom (WCAG 1.4.4 Resize text) para usuarios con baja visión.
// Ahora la lógica es inversa: el doble-tap para zoom sigue funcionando
// siempre; solo se ignora el segundo click sintético que algunos
// navegadores disparan en `<button>` (lo que producía doble-activación).
//
// Q23 (audit): la primera versión de este fix usaba `e.stopPropagation()`
// en captura global sobre `document`, lo que mataba TODOS los listeners
// de click de los 25 módulos que hacen event delegation (109 addEventListener
// de click en el proyecto). Ahora:
//   1) El listener se registra SOLO en capture (no bubble), así
//      tenemos la primera oportunidad de ver el click.
//   2) Usamos `e.stopImmediatePropagation()` (no `stopPropagation`)
//      que solo cancela el resto de listeners del MISMO target, no
//      los listeners de captura/bubble de nodos ancestros.
//   3) Solo aplicamos dedup si el target es un <button> o tiene
//      role=button/tab/menuitem — no afecta clics en links, sliders,
//      inputs de texto, ni en divs arbitrarios.
(function () {
  let lastClickAt = 0;
  const DEDUP_MS = 350;
  const isInteractive = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
    if (el.getAttribute && el.getAttribute('role')) {
      const role = el.getAttribute('role');
      if (['button', 'tab', 'menuitem', 'switch', 'checkbox'].includes(role)) return true;
    }
    return false;
  };
  document.addEventListener(
    'click',
    (e) => {
      const now = Date.now();
      if (now - lastClickAt < DEDUP_MS && isInteractive(e.target)) {
        // Cancela el resto de listeners del mismo target (no de
        // ancestros) — así el handler de este botón no se dispara
        // dos veces, pero los listeners de document/window en otros
        // módulos siguen viendo el evento.
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      lastClickAt = now;
    },
    true, // capture: filtramos antes que los listeners de los módulos.
  );

  // Reajustar el viewport al rotar el dispositivo.
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { window.scrollTo(0, 0); }, 100);
  });
})();
