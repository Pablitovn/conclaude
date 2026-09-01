(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const bindOnce = window.LGMDM.ui.bindOnce;
  const storageKey = 'lgmdm.drawer-width';
  function readSavedWidth(){
    try {
      const current = LGMDM.storage.get(storageKey);
      if (current) return Number(current);
    } catch (_) {}
    return NaN;
  }
  const drawer = document.createElement('aside');
  drawer.className = 'lg-compact-drawer';
  drawer.id = 'lgCompactDrawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="lg-compact-drawer-resize-handle" id="lgCompactDrawerResizeHandle" aria-hidden="true"></div>
    <div class="lg-compact-drawer-head">
      <div><span class="lg-compact-drawer-kicker">MODULE DETAIL</span><span class="lg-compact-drawer-title" id="lgCompactDrawerTitle">INPUT</span></div>
      <button class="lg-compact-drawer-close" id="lgCompactDrawerClose" type="button" aria-label="Cerrar">×</button>
    </div>
    <div class="lg-compact-drawer-body">
      <div class="lg-compact-summary">
        <div class="lg-compact-summary-card"><small>STATUS</small><strong id="lgCompactDrawerStatus">ACTIVE</strong></div>
        <div class="lg-compact-summary-card"><small>POSITION</small><strong id="lgCompactDrawerPosition">01 / 06</strong></div>
      </div>
      <div id="lgCompactDrawerParams"></div>
      <div class="lg-compact-drawer-note" id="lgCompactDrawerNote">Los controles rápidos están enlazados con los parámetros reales de la consola.</div>
      <div class="lg-compact-drawer-actions">
        <button class="lg-mini-btn" id="lgCompactOpenSource" type="button">ABRIR CONTROLES</button>
        <button class="lg-primary-btn" id="lgCompactDrawerBypass" type="button">BYPASS</button>
      </div>
    </div>`;
  const backdrop = document.createElement('div');
  backdrop.className = 'lg-compact-backdrop';
  backdrop.id = 'lgCompactBackdrop';
  document.body.append(backdrop, drawer);

  const modules = {
    input: { title:'INPUT', pos:'01 / 06', ids:[['Gain','s-ingain','consoleInputReadout']], note:'Ganancia de entrada antes de la cadena de procesamiento.' },
    eq: { title:'EQ', pos:'02 / 06', source:'pane-cadena', note:'El módulo EQ completo permanece en el panel de cadena. Abrí los controles detallados cuando los necesites.' },
    comp: { title:'COMPRESSOR', pos:'03 / 06', ids:[['Threshold','s-thresh','consoleCompReadout'],['Ratio','s-ratio','consoleCompReadout']], note:'Controles macro del compresor. Expert Mode conserva el acceso a los parámetros avanzados.' },
    stereo: { title:'STEREO', pos:'04 / 06', ids:[['Width','s-width','consoleStereoReadout']], note:'Control de ancho estéreo / M-S.' },
    limiter: { title:'LIMITER', pos:'05 / 06', ids:[['Ceiling','s-ceiling','consoleLimiterControlReadout']], note:'Ceiling del limitador. El motor mantiene el true-peak path existente.' },
    output: { title:'OUTPUT', pos:'06 / 06', source:'pane-salida', note:'Salida, loudness y entrega. El LIVE SERVER STREAM alimenta métricas; el audio A/B se renderiza en HQ 24-bit por /preview.' }
  };
  let current = 'input';
  const chainButtons = [...document.querySelectorAll('.lg-chain-node')];

  function sourceValue(id) { const el=LGMDM.dom.byId(id); return el ? el.value : ''; }
  function renderParam([label, id, readout]) {
    const el=LGMDM.dom.byId(id); if(!el) return '';
    const value=sourceValue(id);
    return `<div class="lg-compact-param"><div class="lg-compact-param-head"><span>${label}</span><b data-compact-readout="${readout}">${value}</b></div><input type="range" data-compact-proxy="${id}" min="${el.min||''}" max="${el.max||''}" step="${el.step||''}" value="${value}"></div>`;
  }
  function requireDrawerChild(selector) {
    const node = LGMDM.dom.query(selector, drawer);
    if (!node) {
      throw new Error(`[LGMDM DOM CONTRACT] 24-compact-console-drawer: template missing ${selector}`);
    }
    return node;
  }
  function openModule(key) {
    const m=modules[key]||modules.input; current=key;
    requireDrawerChild('#lgCompactDrawerTitle').textContent=m.title;
    requireDrawerChild('#lgCompactDrawerPosition').textContent=m.pos;
    requireDrawerChild('#lgCompactDrawerStatus').textContent='ACTIVE';
    requireDrawerChild('#lgCompactDrawerNote').textContent=m.note;
    drawer.querySelector('#lgCompactDrawerParams').innerHTML=(m.ids||[]).map(renderParam).join('') || '<div class="lg-compact-drawer-note">Este módulo tiene controles detallados en la consola lateral.</div>';
    drawer.querySelectorAll('[data-compact-proxy]').forEach(proxy=>bindOnce(proxy,'input',()=>{
      const target=LGMDM.dom.byId(proxy.dataset.compactProxy); if(!target)return; target.value=proxy.value; target.dispatchEvent(new Event('input',{bubbles:true}));
      const r=proxy.closest('.lg-compact-param')?.querySelector('[data-compact-readout]'); if(r){const source=LGMDM.dom.byId(r.dataset.compactReadout); if(source)r.textContent=source.textContent;}
    }));
    drawer.classList.add('open'); backdrop.classList.add('open'); document.body.classList.add('lg-compact-drawer-open'); drawer.setAttribute('aria-hidden','false');
  }
  function close(){drawer.classList.remove('open');backdrop.classList.remove('open');document.body.classList.remove('lg-compact-drawer-open');drawer.setAttribute('aria-hidden','true');}
  chainButtons.forEach((btn)=>bindOnce(btn,'click',(e)=>{
    e.preventDefault(); e.stopImmediatePropagation();
    const txt=btn.querySelector('span')?.textContent?.trim().toLowerCase();
    openModule(txt==='compressor'?'comp':txt==='output'?'output':txt==='input'?'input':txt==='eq'?'eq':txt==='stereo'?'stereo':txt==='limiter'?'limiter':'input');
  }, 'drawer-chain-click', { capture: true }));
  bindOnce(document.querySelector('#consoleShowChain'),'click',(e)=>{e.preventDefault();openModule('comp');},'drawer-show-chain');
  bindOnce(drawer.querySelector('#lgCompactDrawerClose'),'click',close,'drawer-close');
  bindOnce(backdrop,'click',close,'drawer-backdrop-close');
  bindOnce(document,'keydown',(e)=>{if(e.key==='Escape')close();},'drawer-escape');

  // Resizable drawer: restores the previous desktop behavior without affecting mobile.
  const resizeHandle = drawer.querySelector('#lgCompactDrawerResizeHandle');
  const rootStyle = document.documentElement;
  const minDrawer = 320;
  const getBounds = () => {
    const viewport = window.innerWidth;
    const max = Math.min(760, Math.round(viewport * 0.72));
    return { min: Math.min(minDrawer, Math.max(260, viewport - 120)), max: Math.max(minDrawer, max) };
  };
  let resizeState = null;
  function setDrawerWidth(px) {
    const {min, max} = getBounds();
    const w = Math.round(Math.max(min, Math.min(max, px)));
    drawer.style.setProperty('--lgmdm-drawer-width', `${w}px`);
    try { LGMDM.storage.set(storageKey, String(w)); } catch(_) {}
  }
  function startResize(clientX) {
    const rect = drawer.getBoundingClientRect();
    resizeState = { startX: clientX, startWidth: rect.width };
    drawer.classList.add('resizing');
    document.body.classList.add('lg-compact-drawer-resizing');
  }
  function moveResize(clientX) {
    if(!resizeState) return;
    setDrawerWidth(resizeState.startWidth + (resizeState.startX - clientX));
  }
  function stopResize() {
    resizeState = null;
    drawer.classList.remove('resizing');
    document.body.classList.remove('lg-compact-drawer-resizing');
  }
  bindOnce(resizeHandle,'pointerdown', (e) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    resizeHandle.setPointerCapture?.(e.pointerId);
    startResize(e.clientX);
  });
  bindOnce(resizeHandle,'pointermove', (e) => moveResize(e.clientX),'drawer-resize-move');
  bindOnce(resizeHandle,'pointerup', stopResize,'drawer-resize-up');
  bindOnce(resizeHandle,'pointercancel', stopResize,'drawer-resize-cancel');
  bindOnce(window,'resize', () => {
    const current = drawer.getBoundingClientRect().width;
    setDrawerWidth(current);
  });
  try {
    const savedWidth = readSavedWidth();
    if(Number.isFinite(savedWidth) && savedWidth > 0) setDrawerWidth(savedWidth);
  } catch(_) {}
  bindOnce(drawer.querySelector('#lgCompactOpenSource'),'click',()=>{
    const pane=modules[current]?.source || 'pane-cadena';
    document.querySelector(`.sidebar-tab[data-pane="${pane}"]`)?.click(); close();
  });
  bindOnce(drawer.querySelector('#lgCompactDrawerBypass'),'click',()=>{
    document.querySelector(`.lg-stage-card[data-stage="${current}"]`)?.click();
    const bypass=document.querySelector(`.lg-stage-card[data-stage="${current}"] em`); if(bypass) requireDrawerChild('#lgCompactDrawerStatus').textContent=bypass.textContent;
  });
})();
