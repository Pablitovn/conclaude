/* LGMDM — Chain family navigation
 * Keeps the left sidebar as the parameter workspace and groups the chain
 * into families so the operator never sees the entire chain at once.
 */
(function (global) {
  'use strict';
  const FAMILY_ORDER = ['input','eq','dynamics','stereo','output'];
  const FAMILY_LABELS = {
    input: 'INPUT',
    eq: 'EQ / TONE',
    dynamics: 'DINÁMICA',
    stereo: 'STEREO / COLOR',
    output: 'OUTPUT',
  };
  const FAMILY_HINTS = {
    input: ['ruido', 'input gain'],
    eq: ['ecualización', 'filtros de borde', 'eq correctiva', 'dynamic eq', 'balance tonal', 'eq tonal', 'modo eq', 'mid / side'],
    dynamics: ['compresión', 'dinámica —', 'compresión paralela', 'de-esser', 'compresor multibanda', 'transient shaper'],
    stereo: ['saturación armónica', 'espacio & estéreo', 'multiband stereo width', 'low-end mono maker', 'glue compressor'],
    output: ['clipper', 'normalización y salida', 'normalización & limiter', 'salida & oversampling'],
  };

  function textOf(el) { return (el?.textContent || '').replace(/\s+/g,' ').trim().toLowerCase(); }

  function familyForText(text) {
    for (const f of FAMILY_ORDER) {
      if (FAMILY_HINTS[f].some(h => text.includes(h))) return f;
    }
    return null;
  }

  function build() {
    const chain = document.getElementById('pasoCadena');
    if (!chain || document.getElementById('chainFamilyTabs')) return;
    const body = chain.querySelector('.process-card-body');
    if (!body) return;

    const nav = document.createElement('div');
    nav.id = 'chainFamilyTabs';
    nav.className = 'chain-family-tabs';
    nav.setAttribute('role','tablist');
    nav.setAttribute('aria-label','Familias de procesamiento');
    FAMILY_ORDER.forEach((family, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chain-family-tab' + (i === 0 ? ' active' : '');
      btn.dataset.family = family;
      btn.textContent = FAMILY_LABELS[family];
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected', String(i === 0));
      nav.appendChild(btn);
    });
    chain.querySelector('.process-card-header')?.insertAdjacentElement('afterend', nav);

    const children = Array.from(body.children);
    let currentFamily = 'input';
    let lastH3 = null;
    const grouped = new Map(FAMILY_ORDER.map(f => [f, []]));

    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      const txt = textOf(child);
      const byText = familyForText(txt);
      if (byText) currentFamily = byText;
      if (tag === 'h3') {
        lastH3 = child;
        const hFamily = familyForText(txt);
        if (hFamily) currentFamily = hFamily;
      }
      child.dataset.chainFamily = currentFamily;
      if (grouped.has(currentFamily)) grouped.get(currentFamily).push(child);
    }

    // Move the two preview/ref-less headings into their natural groups.
    const showFamily = (family) => {
      for (const [f, nodes] of grouped) {
        nodes.forEach(node => {
          node.hidden = f !== family;
          node.classList.toggle('chain-family-visible', f === family);
        });
      }
      nav.querySelectorAll('.chain-family-tab').forEach(btn => {
        const active = btn.dataset.family === family;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
      });
      try { LGMDM.storage.set('lgmdm-chain-family', family); } catch (_) {}
    };

    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.chain-family-tab');
      if (!btn) return;
      showFamily(btn.dataset.family);
    });

    let initial = 'input';
    try {
      const saved = LGMDM.storage.get('lgmdm-chain-family');
      if (FAMILY_ORDER.includes(saved)) initial = saved;
    } catch (_) {}
    showFamily(initial);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  else build();
})(window);
