
(function(){
  'use strict';
  const $=(id)=>document.getElementById(id);
  const health=LGMDM.dom.byId('lgHealthPanel');
  const state={};
  const setHealth=(name,status,text)=>{
    const item=health?.querySelector(`[data-health="${name}"]`);
    const label=LGMDM.dom.byId(`health${name.charAt(0).toUpperCase()+name.slice(1)}`);
    if(item) item.classList.remove('ok','warn','error'), item.classList.add(status);
    if(label) label.textContent=text;
    state[name]=status;
  };
  async function checkHealth(){
    if(!health) return;
    const summary=LGMDM.dom.byId('lgHealthSummary');
    setHealth('storage','ok','Disponible');
    const hasAudio=!!(window.AudioContext||window.webkitAudioContext);
    setHealth('browser',hasAudio?'ok':'warn',hasAudio?'Audio API disponible':'Audio API limitada');
    const token=(LGMDM.api.authToken?.()||'').trim();
    setHealth('auth',token?'ok':'warn',token?'Token presente':'Sin sesión');
    const previewAudio=document.querySelector('#previewAudioWrap audio, #mxrServerPreviewAudio');
    setHealth('preview', previewAudio ? 'ok' : 'warn', previewAudio ? 'HQ 24-bit listo' : 'Esperando render HQ 24-bit / stream en vivo');
    setHealth('engine','ok','Frontend listo');
    let apiOk=false;
    try{
      const fetcher=LGMDM.api.apiFetch;
      if(fetcher){
        const res=await fetcher('/health',{method:'GET'});
        apiOk=res.ok;
        if(res.ok){
          let detail='Servidor operativo';
          try{const data=await res.clone().json(); detail=data.status?String(data.status):detail;}catch(_){}
          setHealth('api','ok',detail);
        }else if([401,403].includes(res.status)){
          setHealth('api','warn',`Servidor ${res.status}`);
        }else if(res.status===404){
          setHealth('api','warn','/health no expuesto');
        }else{
          setHealth('api','error',`HTTP ${res.status}`);
        }
      }
    }catch(e){
      setHealth('api','error','No responde');
    }
    const bad=Object.values(state).filter(v=>v==='error').length;
    const warn=Object.values(state).filter(v=>v==='warn').length;
    if(summary) summary.textContent=bad?`${bad} componente${bad>1?'s':''} con error`:warn?`${warn} aviso${warn>1?'s':''}`:'Todos los controles principales OK';
  }
  LGMDM.dom.byId('lgHealthRefresh')?.addEventListener('click', checkHealth);
  window.addEventListener('lgmdm:auth-required', () => {
    setHealth('auth', 'error', 'Autenticación requerida');
    LGMDM.dom.byId('lgHealthSummary').textContent = 'La sesión requiere autenticación';
  });

  // P1 (audit): antes hacía setInterval(checkHealth, 30000) sin
  // condiciones. En 1.000 sesiones concurrentes son ~33 RPS al
  // endpoint /health. Cambios:
  //   - Skip si la pestaña está oculta (Page Visibility API).
  //   - Backoff exponencial en errores: 30s → 60s → 120s → 240s,
  //     reset a 30s cuando vuelve a estar OK.
  //   - Se detiene solo después de 5 min de inactividad de pestaña
  //     (por si el usuario deja la app abierta y vuelve al día
  //     siguiente, evitamos RPS fantasma).
  const BASE_INTERVAL_MS = 30000;
  const MAX_BACKOFF_MS = 240000; // 4 min
  let intervalId = null;
  let intervalMs = BASE_INTERVAL_MS;
  let visibilityHiddenAt = 0;

  function startLoop() {
    if (intervalId) return;
    intervalId = setInterval(tick, intervalMs);
  }
  function stopLoop() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }
  function reschedule() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = setInterval(tick, intervalMs);
  }
  async function tick() {
    if (document.hidden) return; // skip si la pestaña está oculta
    const wasOk = state.api === 'ok' || state.api === undefined;
    await checkHealth();
    // Ajustar backoff según resultado
    if (state.api === 'ok') {
      if (intervalMs !== BASE_INTERVAL_MS) {
        intervalMs = BASE_INTERVAL_MS;
        reschedule();
      }
    } else {
      // Error: doblar el intervalo hasta el techo
      const next = Math.min(intervalMs * 2, MAX_BACKOFF_MS);
      if (next !== intervalMs) {
        intervalMs = next;
        reschedule();
      }
    }
    // Si la pestaña lleva oculta mucho tiempo, parar
    if (visibilityHiddenAt && Date.now() - visibilityHiddenAt > 5 * 60 * 1000) {
      stopLoop();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      visibilityHiddenAt = Date.now();
    } else {
      visibilityHiddenAt = 0;
      // Resetear backoff y volver a chequear inmediatamente
      intervalMs = BASE_INTERVAL_MS;
      reschedule();
      checkHealth();
    }
  });

  setTimeout(checkHealth, 300);
  startLoop();

  const tips={
    consoleInputFader:['INPUT GAIN','Ajusta la ganancia previa al procesamiento. Mantené margen para evitar clipping en etapas posteriores.'],
    consoleCompThreshold:['COMPRESSOR · THRESHOLD','Nivel a partir del cual comienza la reducción de ganancia del compresor. Bajarlo aumenta la cantidad de señal procesada.'],
    consoleCompRatio:['COMPRESSOR · RATIO','Relación entre nivel de entrada por encima del umbral y nivel de salida. 4:1 significa que 4 dB sobre el umbral producen aproximadamente 1 dB a la salida.'],
    consoleStereoFader:['STEREO WIDTH','Escala la amplitud estéreo. 100% conserva el ancho de referencia; valores mayores expanden y menores estrechan.'],
    consoleLimiterFader:['LIMITER · CEILING','Límite superior de nivel. Bajarlo reduce el máximo permitido y deja más margen para true peak.'],
    sNormalizeLufs:['TARGET LOUDNESS','Objetivo integrado de loudness. La normalización actúa sobre ganancia, no sobre EQ ni dinámica.'],
    truePeak:['TRUE PEAK CEILING','Techo de salida para controlar picos inter-sample y reducir riesgo de clipping después de la conversión.'],
    oversample:['OVERSAMPLING','Aumenta la frecuencia interna de procesamiento para reducir aliasing en etapas no lineales. Más calidad implica más carga de CPU.'],
    stereoLink:['STEREO LINK','Define cuánto se comparte la detección/control entre canales L/R. Más link conserva mejor la imagen; menos link permite diferencias entre canales.'],
    sPlatform:['PLATFORM TARGET','Selecciona un objetivo habitual de loudness para la plataforma. Es una referencia de entrega, no una medición garantizada de playback.']
  };
  function tipData(el){
    if(!el) return null;
    if(tips[el.id]) return tips[el.id];
    if(el.matches('input[type="range"]')){
      const label=el.getAttribute('aria-label')||el.previousElementSibling?.textContent?.trim();
      if(label) return [label,'Control deslizante. Rueda del mouse: ajuste por step · Shift: fino · Ctrl/Cmd: rápido.'];
    }
    return null;
  }
  const tip=document.createElement('div'); tip.className='lg-engineer-tip'; tip.innerHTML='<strong></strong><span></span><kbd>Rueda · Shift fino · Ctrl rápido</kbd>'; document.body.appendChild(tip);
  let target=null;
  function show(el){
    const data=tipData(el); if(!data) return; target=el; el.classList.add('lg-engineer-target'); tip.querySelector('strong').textContent=data[0]; tip.querySelector('span').textContent=data[1]; tip.classList.add('show'); position();
  }
  function hide(){target?.classList.remove('lg-engineer-target');target=null;tip.classList.remove('show');}
  function position(){if(!target||!tip.classList.contains('show'))return; const r=target.getBoundingClientRect(), w=320; let x=r.left, y=r.top-tip.offsetHeight-8; if(y<8)y=r.bottom+8; x=Math.max(8,Math.min(window.innerWidth-w-8,x)); tip.style.left=x+'px'; tip.style.top=y+'px';}
  document.addEventListener('mouseover',e=>{const el=e.target.closest('input[type="range"],select,button[data-engineer-tip]'); if(el)show(el);});
  document.addEventListener('mouseout',e=>{const el=e.target.closest('input[type="range"],select,button[data-engineer-tip]'); if(el&&(!e.relatedTarget||!el.contains(e.relatedTarget)))hide();});
  const bindOnce = window.LGMDM.ui.bindOnce;
  bindOnce(window,'scroll',position,'health-tip-scroll',{capture:true});
  bindOnce(window,'resize',position,'health-tip-resize');
  document.addEventListener('focusin',e=>{const el=e.target.closest('input[type="range"],select'); if(el)show(el);});
  document.addEventListener('focusout',e=>{if(e.target.matches('input[type="range"],select'))hide();});
})();
