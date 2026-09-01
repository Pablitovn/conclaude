/**
 * CLEANUP MODULE
 * Helpers para liberar recursos Web Audio y object URLs.
 *
 * Q18 (audit): antes este archivo exponía `on()` / `timeout()` /
 * `purgeAll()` y se auto-registraba en `beforeunload`/`unload` para
 * purgar todo al cerrar la página. CERO módulos del proyecto
 * usaban esas APIs, así que el "cleanup automático" era teatro:
 * registraba listeners sobre `window` para limpiar un registry
 * que nadie poblaba.
 *
 * QUEDA:
 *   - Helpers para que un módulo que registre audio resources
 *     pueda liberarlos explícitamente. La idea es: en vez de
 *     auto-cleanup global, cada componente llama
 *     `LGMDM.cleanup.disconnectAudioNode(node)` cuando destruye
 *     un stem, o `LGMDM.cleanup.revokeObjectURLs(urls)` al
 *     terminar un preview.
 *   - Sin auto-registro de listeners en window.
 *   - Sin registry global (los registries globales son el
 *     antipatrón que originó Q18).
 */
(function (global) {
  'use strict';

  const LGMDM = global.LGMDM = global.LGMDM || {};
  const cleanup = LGMDM.cleanup = LGMDM.cleanup || {};

  /**
   * Disconnect a Web Audio node safely. Returns true if it
   * disconnected, false if there was nothing to do.
   */
  function disconnectAudioNode(node) {
    if (!node || typeof node.disconnect !== 'function') return false;
    try { node.disconnect(); return true; } catch (err) {
      console.warn('[Cleanup] Error disconnecting audio node:', err);
      return false;
    }
  }

  /**
   * Close a Web Audio context safely. Returns true if it closed.
   */
  function closeAudioContext(ctx) {
    if (!ctx || typeof ctx.close !== 'function') return false;
    if (ctx.state === 'closed') return true;
    try { return Promise.resolve(ctx.close()).then(() => true, () => false); } catch (err) {
      console.warn('[Cleanup] Error closing audio context:', err);
      return false;
    }
  }

  /**
   * Revoke one or more object URLs created by URL.createObjectURL.
   * Idempotent — re-revocar una URL no rompe.
   */
  function revokeObjectURLs(urls) {
    if (!urls) return 0;
    const list = Array.isArray(urls) ? urls : [urls];
    let n = 0;
    for (const url of list) {
      if (typeof url !== 'string' || !url) continue;
      try { URL.revokeObjectURL(url); n += 1; } catch (_) { /* noop */ }
    }
    return n;
  }

  Object.assign(cleanup, {
    disconnectAudioNode,
    closeAudioContext,
    revokeObjectURLs,
  });
})(window);