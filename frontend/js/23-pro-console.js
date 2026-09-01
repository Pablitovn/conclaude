
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const STORAGE = 'lgmdm.expert-mode';
  const PRESET_STORAGE = 'lgmdm.custom-presets';

  const sliderMap = {
    's-input-gain':'input_gain_db','s-comp-thresh':'comp_threshold_db','s-comp-ratio':'comp_ratio',
    's-stereo-width':'stereo_width','s-limiter-ceiling':'true_peak_db'
  };

  function allControls() {
    return [...document.querySelectorAll('.param input[type="range"], .param select, .param input[type="checkbox"], input[id^="s-"]')]
      .filter(el => el.id && !el.closest('.lg-pro-presetbar'));
  }
  function collectPreset() {
    const params = {};
    allControls().forEach(el => {
      const key = sliderMap[el.id] || el.id;
      if (el.type === 'checkbox') params[key] = !!el.checked;
      else params[key] = el.value;
    });
    return { name: LGMDM.dom.byId('presetName')?.value?.trim() || 'LGMDM Custom', created_at: new Date().toISOString(), params };
  }
  function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(data.name||'lgmdm-preset').replace(/[^a-z0-9_-]+/gi,'_')}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function applyPreset(data) {
    const p = data?.params || data?.settings || data || {};
    Object.entries(p).forEach(([key,val]) => {
      let id = key;
      const found = Object.entries(sliderMap).find(([,mapped]) => mapped === key); if (found) id = found[0];
      const el = LGMDM.dom.byId(id); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else { el.value = val; el.dispatchEvent(new Event('input',{bubbles:true})); }
      el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input',{bubbles:true}));
    });
    window.LGMDM?.previewController?.request?.();
    if (typeof window.LGMDM?.meters?.updateReadouts === 'function') window.LGMDM.meters.updateReadouts();
    document.querySelectorAll('.preset-btn.active').forEach(b=>b.classList.remove('active'));
    if (LGMDM.dom.byId('presetStatus')) LGMDM.dom.byId('presetStatus').textContent = `Aplicado: ${data?.name || 'preset'}`;
  }
  function loadCustomPresets() { try { return LGMDM.storage.getJSON(PRESET_STORAGE, []); } catch { return []; } }
  function saveCustomPresets(list) { LGMDM.storage.setJSON(PRESET_STORAGE, list.slice(-20)); }
  function refreshCustomSelect() {
    const sel = LGMDM.dom.byId('customPreset'); if (!sel) return;
    sel.innerHTML = '<option value="">Mis presets…</option>';
    loadCustomPresets().forEach((p,i)=>{ const o=document.createElement('option');o.value=String(i);o.textContent=p.name||`Preset ${i+1}`;sel.appendChild(o); });
  }

  function setExpert(enabled) {
    document.body.classList.toggle('lg-pro-expert', enabled);
    const cb = LGMDM.dom.byId('expertModeToggle'); if (cb) cb.checked = enabled;
    try { LGMDM.storage.set(STORAGE, enabled?'1':'0'); } catch {}
    if (LGMDM.dom.byId('expertState')) LGMDM.dom.byId('expertState').textContent = enabled ? 'STUDIO' : 'STANDARD';
  }

  function setChainActive(stage) {
    document.querySelectorAll('.lg-pro-node').forEach(n=>n.classList.toggle('active', n.dataset.stage===stage));
    document.querySelectorAll('.lg-stage-card').forEach(n=>n.classList.toggle('active', n.dataset.stage===stage));
  }
  function syncChainBypass() {
    const rootConsole = window.LGMDM?.console;
    const bypass = rootConsole?.getChainOverrides ? rootConsole.getChainOverrides() : {};
    document.querySelectorAll('.lg-pro-node[data-stage]').forEach(n=>n.classList.toggle('bypassed', !!bypass[`${n.dataset.stage}_bypass`]));
  }

  function install() {
    const consoleEl = LGMDM.dom.byId('lgMasterConsole'); if (!consoleEl) return;
    // NOTA: acá antes se inyectaba una barra "MASTER ENGINE" (INPUT/LUFS/TRUE
    // PEAK/MODE) y una barra "PRESET STUDIO" arriba de la consola real. Se
    // sacaron: duplicaban LUFS/TRUE PEAK/MODE que ya muestra el health-strip
    // nativo (#healthLufs/#healthPeak/#healthMode) y quedaban flotando sin
    // estilo propio, empujando la consola hacia abajo. El resto de este
    // archivo (expert toggle, banner, panel de parámetros finos, chain
    // shell) sigue intacto y funciona igual — los listeners de abajo usan
    // `?.` así que no rompen nada si el elemento no existe.

    const title = consoleEl.querySelector('.lg-console-topbar .lg-console-actions');
    if (title) { const label=document.createElement('label');label.className='lg-pro-expert-toggle';label.innerHTML='<input type="checkbox" id="expertModeToggle"> STUDIO';title.prepend(label); }

    const chain = consoleEl.querySelector('.lg-chain-panel');
    if (chain) {
      const shell=document.createElement('div'); shell.className='lg-pro-chain-shell'; shell.innerHTML=`<div class="lg-pro-chain-head"><div><strong>PROCESSING CHAIN</strong><small> · señal de entrada a salida</small></div><span class="lg-pro-online"><i></i><span>ROUTED</span></span></div><div class="lg-pro-chain-flow">
      <button class="lg-pro-node active" data-stage="input"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">01</span><span class="lg-pro-node-title">INPUT</span><span class="lg-pro-node-value">Gain / Trim</span></button>
      <button class="lg-pro-node" data-stage="eq"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">02</span><span class="lg-pro-node-title">EQ</span><span class="lg-pro-node-value">Tonal shaping</span></button>
      <button class="lg-pro-node" data-stage="comp"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">03</span><span class="lg-pro-node-title">COMP</span><span class="lg-pro-node-value">Glue / Dynamics</span></button>
      <button class="lg-pro-node" data-stage="stereo"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">04</span><span class="lg-pro-node-title">STEREO</span><span class="lg-pro-node-value">M/S width</span></button>
      <button class="lg-pro-node" data-stage="limiter"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">05</span><span class="lg-pro-node-title">LIMITER</span><span class="lg-pro-node-value">True peak</span></button>
      <button class="lg-pro-node" data-stage="output"><i class="lg-pro-node-state"></i><span class="lg-pro-node-index">06</span><span class="lg-pro-node-title">OUTPUT</span><span class="lg-pro-node-value">Loudness / delivery</span></button></div>`;
      chain.replaceWith(shell);
      shell.querySelectorAll('.lg-pro-node').forEach(n=>n.addEventListener('click',()=>{setChainActive(n.dataset.stage); const pane=n.dataset.stage==='output'?'pane-salida':'pane-cadena';document.querySelector(`.sidebar-tab[data-pane="${pane}"]`)?.click();}));
    }

    const expert=document.createElement('div'); expert.className='lg-pro-expert-banner'; expert.innerHTML='<span>STUDIO · estudio modular activo</span><span>La cadena activa controla el motor de procesamiento.</span>'; consoleEl.insertBefore(expert, consoleEl.querySelector('.lg-console-controlbar'));
    const expertPanel=document.createElement('div'); expertPanel.className='lg-pro-expert-panel lg-pro-expert-only'; expertPanel.innerHTML=`<div class="lg-pro-chain-head"><div><strong>STUDIO ENGINE</strong><small> parámetros finos de operación</small></div></div><div class="lg-pro-expert-grid"><div class="lg-pro-mini-param"><label><span>OVERSAMPLING</span><span>ENGINE</span></label><select id="oversample"><option value="1x">1×</option><option value="2x">2×</option><option value="4x">4×</option><option value="8x">8×</option></select></div><div class="lg-pro-mini-param"><label><span>TRUE PEAK</span><span>CEILING</span></label><input id="truePeak" type="range" min="-3" max="-0.1" step="0.1" value="-1"><output>-1.0 dBTP</output></div><div class="lg-pro-mini-param"><label><span>STEREO</span><span>LINK</span></label><select id="stereoLink"><option>100%</option><option>75%</option><option>50%</option></select></div><div class="lg-pro-mini-param"><label><span>PREVIEW</span><span>FALLBACK</span></label><select id="previewMode"><option value="fallback">Fallback</option><option value="hq">HQ fallback</option></select></div></div>`;
    consoleEl.appendChild(expertPanel);

    LGMDM.dom.byId('expertModeToggle')?.addEventListener('change',e=>setExpert(e.target.checked));
    LGMDM.dom.byId('savePreset')?.addEventListener('click',()=>{const data=collectPreset();const list=loadCustomPresets();list.push(data);saveCustomPresets(list);refreshCustomSelect();if(LGMDM.dom.byId('presetStatus'))LGMDM.dom.byId('presetStatus').textContent=`Guardado: ${data.name}`;});
    LGMDM.dom.byId('exportPreset')?.addEventListener('click',()=>downloadJSON(collectPreset()));
    LGMDM.dom.byId('customPreset')?.addEventListener('change',e=>{const i=Number(e.target.value);if(!Number.isInteger(i))return;const p=loadCustomPresets()[i];if(p)applyPreset(p);});
    LGMDM.dom.byId('presetCategory')?.addEventListener('change',e=>{if(e.target.value==='custom')LGMDM.dom.byId('customPreset')?.focus();});

    try { setExpert(LGMDM.storage.get(STORAGE)==='1'); } catch { setExpert(false); }
    refreshCustomSelect();
    const setIfChanged=(el,val)=>{ if(el && el.textContent!==val) el.textContent=val; };
    const observer=new MutationObserver(()=>{
      setIfChanged(LGMDM.dom.byId('inputReadout'), LGMDM.dom.byId('consoleInputReadout')?.textContent||'0.0 dB');
      setIfChanged(LGMDM.dom.byId('lufsReadout'), LGMDM.dom.byId('consoleLufs')?.textContent||'-∞');
      setIfChanged(LGMDM.dom.byId('peakReadout'), LGMDM.dom.byId('consoleTruePeak')?.textContent||'-∞ dBTP');
      syncChainBypass();
    });
    observer.observe(consoleEl,{subtree:true,childList:true,characterData:true});
    setInterval(syncChainBypass,800);
  }

  // ── API Health Check ─────────────────────────────────────────
  // Verifica si el backend responde y actualiza el badge ONLINE/OFFLINE
  function updateOnlineStatus(isOnline) {
    const badge = document.querySelector('.lg-pro-online');
    const text = document.getElementById('onlineText');
    if (!badge || !text) return;
    if (isOnline) {
      badge.style.color = '';
      badge.style.opacity = '';
      text.textContent = 'ONLINE';
      badge.title = 'Backend conectado';
    } else {
      badge.style.color = 'var(--danger, #ff6e87)';
      badge.style.opacity = '0.85';
      text.textContent = 'OFFLINE';
      badge.title = 'Sin conexión con el servidor';
    }
  }

  async function checkApiHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const base = (typeof window.LGMDM?.api?.apiBase === 'function')
        ? window.LGMDM.api.apiBase()
        : 'https://masteringstudio-api.duckdns.org';
      const res = await fetch(`${base}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      updateOnlineStatus(res.ok || res.status === 404); // 404 = servidor responde pero no tiene /health
    } catch (_) {
      updateOnlineStatus(false);
    }
  }

  function startHealthCheck() {
    // Check inmediato al cargar
    setTimeout(checkApiHealth, 1200);
    // Luego cada 30 segundos
    setInterval(checkApiHealth, 30000);
    // También verificar cuando la ventana vuelve a tener foco
    window.addEventListener('focus', checkApiHealth);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install(); startHealthCheck();
})();
