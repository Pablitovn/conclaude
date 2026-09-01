(function(){
  'use strict';
  function mirror(fromId, toId){
    const from=document.getElementById(fromId), to=document.getElementById(toId);
    if(!from||!to) return;
    const sync=()=>{ to.textContent=(from.textContent||'').trim() || '—'; };
    sync();
    new MutationObserver(sync).observe(from,{childList:true,subtree:true,characterData:true});
  }
  const boot=()=>{
    mirror('consoleTrackTitle','consoleTrackTitleTop');
    mirror('consoleTrackMeta','consoleTrackMetaTop');
    mirror('consoleTrackTitle','stageTrackName');
    mirror('consoleTrackMeta','stageTrackMeta');
    mirror('consoleLufs','healthLufs');
    mirror('consoleTruePeak','healthPeak');
    mirror('consoleMeterMode','healthMode');
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
