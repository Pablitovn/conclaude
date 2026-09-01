(function(global){
  "use strict";
  const LGMDM = global.LGMDM = global.LGMDM || {};
// ============================================================
// ============================================================

aiRequired("metersToggle", "11-ai-assistant-ux:meters").addEventListener("click", () => {
  const body = aiRequired("metersBody", "11-ai-assistant-ux:meters");
  const toggle = aiRequired("metersToggle", "11-ai-assistant-ux:meters");
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "block" : "none";
  toggle.textContent = hidden ? "ocultar" : "mostrar";
});

window.addEventListener("beforeunload", () => {
  LGMDM.meters?.stopDashboard?.();
  LGMDM.meters?.teardownLiveMeters?.();
  try { window.LGMDM?.spectrum?.clear?.(); } catch (e) {}
});

// ═══════════════════════════════════════════════════════════════
// ── Asistente de IA (estilo LANDR AI) ────────────────────────
// ═══════════════════════════════════════════════════════════════

const AI_SUGGESTIONS = [
  "🤖 Masterizá esto por mí",
  "¿Cómo está el loudness de mi track?",
  "¿Qué preset me conviene?",
  "¿Tengo problemas de clipping?",
];

function aiEl(id) {
  return document.getElementById(id);
}

function aiRequired(id, owner = "11-ai-assistant-ux") {
  return LGMDM.dom.requireById(id, owner);
}

let lastAnalysisData = null;

function setContext(analysisData) {
  lastAnalysisData = analysisData || null;
  const state = window.LGMDM?.state;
  if (state) state.lastAnalysisData = lastAnalysisData;
  window.dispatchEvent(new CustomEvent("analysis-updated", { detail: lastAnalysisData }));

  const fab = aiEl("aiFab");
  if (!fab) return;
  fab.classList.toggle("has-context", Boolean(lastAnalysisData));
}

function aiCurrentPreset() {
  const active = document.querySelector(".preset-btn.active");
  return active ? active.dataset.preset : null;
}

function aiCurrentPlatform() {
  const sel = aiEl("s-platform");
  return sel && sel.value ? sel.value : null;
}

function aiAppendMessage(role, content) {
  const wrap = aiRequired("aiMessages");
  const div = document.createElement("div");
  div.className = `ai-msg ${role}`;
  div.textContent = content;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function aiAppendSuggestionCard(suggestedParams, summary, explanation) {
  const wrap = aiRequired("aiMessages");
  const card = document.createElement("div");
  card.className = "ai-suggestion-card";

  if (summary) {
    const title = document.createElement("div");
    title.className = "ai-suggestion-card-title";
    title.textContent = summary;
    card.appendChild(title);
  }

  if (explanation) {
    const explain = document.createElement("div");
    explain.className = "ai-suggestion-explanation";
    explain.textContent = explanation;
    card.appendChild(explain);
  }

  const list = document.createElement("ul");
  list.className = "ai-suggestion-card-list";
  Object.entries(suggestedParams).forEach(([key, value]) => {
    const li = document.createElement("li");
    const label = PARAM_LABELS[key] || key;
    let valueText;
    if (typeof value === "boolean") {
      valueText = value ? "activado" : "desactivado";
    } else if (typeof value === "string") {
      valueText = value;
    } else {
      valueText = formatParamValue(value, key);
    }
    const labelEl = document.createElement("span");
    labelEl.className = "ai-suggestion-param";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "ai-suggestion-value";
    valueEl.textContent = valueText;
    li.append(labelEl, valueEl);
    list.appendChild(li);
  });
  card.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "ai-suggestion-card-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "ai-suggestion-cancel-btn";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", () => {
    card.remove();
  });
  actions.appendChild(cancelBtn);

  const applyBtn = document.createElement("button");
  applyBtn.className = "ai-suggestion-apply-btn";
  applyBtn.textContent = "Confirmar cambios";
  applyBtn.addEventListener("click", () => {
    applyPresetToUI(suggestedParams);
    activePreset = null;
    document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
    applyBtn.textContent = "✓ Aplicado";
    applyBtn.disabled = true;
    cancelBtn.disabled = true;
    card?.classList.add("applied");
  });
  actions.appendChild(applyBtn);
  card.appendChild(actions);

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}

function aiAppendNote(content) {
  const wrap = aiRequired("aiMessages");
  const div = document.createElement("div");
  div.className = "ai-msg system-note";
  div.textContent = content;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function aiShowTyping() {
  const wrap = aiRequired("aiMessages");
  const div = document.createElement("div");
  div.className = "ai-msg assistant typing";
  div.id = "aiTypingIndicator";
  div.innerHTML = "<span></span><span></span><span></span>";
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function aiHideTyping() {
  const el = aiEl("aiTypingIndicator");
  if (el) el.remove();
}

function aiRenderSuggestions() {
  const box = aiRequired("aiSuggestions");
  box.innerHTML = "";
  AI_SUGGESTIONS.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "ai-suggestion-btn";
    btn.textContent = s;
    btn.addEventListener("click", () => {
      if (s.includes("Masterizá esto por mí")) {
        if (!selectedFile) {
          aiAppendNote("Primero subí un archivo de audio para poder masterizarlo.");
          return;
        }
        document.getElementById("btnAutoMaster").click();
        return;
      }
      aiEl("aiInput").value = s;
      aiSendMessage();
    });
    box.appendChild(btn);
  });
}

async function aiCheckStatus() {
  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/ai/status`);
    const data = await res.json();
    aiAvailable = !!data.available;
    aiRequired("aiStatusLine", "11-ai-assistant-ux:status").textContent = aiAvailable
      ? lastAnalysisData
        ? "Analizando tu track"
        : "Listo para ayudarte"
      : "No configurado";
    aiRequired("aiSend", "11-ai-assistant-ux:status").disabled = !aiAvailable;
    if (!aiAvailable) {
      aiAppendNote(data.reason || "El asistente de IA no está configurado en el backend (falta GEMINI_API_KEY).");
    }
  } catch (e) {
    aiAvailable = false;
    aiRequired("aiStatusLine", "11-ai-assistant-ux:status").textContent = "Sin conexión al backend";
    aiRequired("aiSend", "11-ai-assistant-ux:status").disabled = true;
    aiAppendNote("No se pudo conectar con el backend (" + LGMDM.api.apiBase() + ") para consultar el asistente.");
  }
}

async function aiSendMessage() {
  const input = aiRequired("aiInput", "11-ai-assistant-ux:send");
  const send = aiRequired("aiSend", "11-ai-assistant-ux:send");
  const suggestions = aiRequired("aiSuggestions", "11-ai-assistant-ux:send");
  const msg = input.value.trim();
  if (!msg || send.disabled) return;
  input.value = "";
  input.style.height = "auto";
  aiAppendMessage("user", msg);
  suggestions.replaceChildren();
  aiShowTyping();
  send.disabled = true;

  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        history: aiChatHistory,
        analysis: lastAnalysisData,
        preset: aiCurrentPreset(),
        platform: aiCurrentPlatform(),
      }),
    });
    aiHideTyping();
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    aiAppendMessage("assistant", data.reply);
    if (data.suggested_params && Object.keys(data.suggested_params).length) {
      aiAppendSuggestionCard(data.suggested_params, data.suggestion_summary, data.suggestion_explanation);
    }
    aiChatHistory.push({ role: "user", content: msg });
    aiChatHistory.push({ role: "assistant", content: data.reply });
  } catch (e) {
    aiHideTyping();
    console.error("Error en /ai/chat:", e);
    aiAppendNote("Error consultando al asistente: " + e.message);
  } finally {
    send.disabled = false;
  }
}

aiEl("aiFab")?.addEventListener("click", () => {
  const panel = aiRequired("aiPanel", "11-ai-assistant-ux:toggle");
  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (opening) {
    if (aiAvailable === null) {
      aiAppendMessage(
        "assistant",
        "¡Hola! Soy tu asistente de mastering. Puedo analizar tu track y darte consejos, o directamente masterizarlo por vos: elijo preset, plataforma target y ajustes de nivel según el análisis técnico. ¿En qué te ayudo?",
      );
      aiRenderSuggestions();
      aiCheckStatus();
    }
    aiRequired("aiInput", "11-ai-assistant-ux:toggle").focus();
  }
});

aiEl("aiClose")?.addEventListener("click", () => aiRequired("aiPanel", "11-ai-assistant-ux:close").classList.add("hidden"));
aiEl("aiSend")?.addEventListener("click", aiSendMessage);
aiEl("aiInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    aiSendMessage();
  }
});
aiEl("aiInput")?.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 96) + "px";
});

// ── Sidebar tabs ──────────────────────────────────────────────
(function () {
  const tabs = document.querySelectorAll("#sidebarTabs .sidebar-tab");
  const container = document.getElementById("sidebarPaneContainer");
  const paneMap = { "pane-archivo": "archivo", "pane-cadena": "cadena", "pane-salida": "salida" };
  const detailsMap = { "pane-archivo": "pasoArchivo", "pane-cadena": "pasoCadena", "pane-salida": "pasoSalida" };

  function switchTab(tab) {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const pane = tab.dataset.pane;
    const cls = paneMap[pane];
    container.className = container.className.replace(/sidebar-showing-\w+/g, "").trim();
    container.classList.add("sidebar-showing-" + cls);
    const det = document.getElementById(detailsMap[pane]);
    if (det && !det.open) det.setAttribute("open", "");
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab)));
  const paso1 = document.getElementById("pasoArchivo");
  const paso2 = document.getElementById("pasoCadena");
  const paso3 = document.getElementById("pasoSalida");
  if (paso1) paso1.setAttribute("open", "");
  if (paso2) paso2.removeAttribute("open");
  if (paso3) paso3.removeAttribute("open");
})();

(function () {
  const aside = document.querySelector("aside");
  const hint = document.getElementById("asideScrollHint");
  if (!aside || !hint) return;
  function updateScrollHint() {
    const atBottom = aside.scrollHeight - aside.scrollTop - aside.clientHeight < 20;
    hint.classList.toggle("hidden", atBottom);
  }
  aside.addEventListener("scroll", updateScrollHint, { passive: true });
  updateScrollHint();
  new ResizeObserver(updateScrollHint).observe(aside);
})();

(function () {
  const secondaryBtns = ["btnAutoMaster", "btnAiSuggest", "btnAnalyze", "btnAdvice", "btnAnalyzeGrid", "btnAdviceGrid", "btnSpectrum", "btnStems", "btnAB"];
  const observer = new MutationObserver(() => {
    if (selectedFile) {
      secondaryBtns.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "";
      });
    }
  });
  const masterBtn = document.getElementById("btnMaster");
  if (masterBtn) {
    observer.observe(masterBtn, { attributes: true, attributeFilter: ["disabled"] });
  }
})();

// Se eliminó la línea que hacía referencia a window._origSetFile
(function(){ const LG = window.LGMDM = window.LGMDM || {}; LG.ai = Object.assign(LG.ai || {}, { setContext }); })();

// 07-mastering-actions.js corre fuera de este IIFE y llama a estas
// funciones directamente (sin prefijo LGMDM.ai.), asi que quedan
// expuestas tambien como globales.
Object.assign(global, {
  aiEl,
  aiAppendMessage,
  aiAppendNote,
  aiShowTyping,
  aiHideTyping,
  aiCurrentPreset,
  aiCurrentPlatform,
  aiRenderSuggestions,
  aiAppendSuggestionCard,
});

})(window);

// ── Resize del panel de Laia (usa el helper compartido de 00-resize-utility.js) ──
(function () {
  const panel = document.getElementById('aiPanel');
  const handle = document.getElementById('aiPanelResizeHandle');
  if (!panel || !handle || !window.LGMDM || !LGMDM.ui || !LGMDM.ui.makeResizable) return;

  // Ancho: arrastrar el handle hacia la izquierda agranda el panel
  // (el panel está anclado por "right", no por "left" → invert:true).
  LGMDM.ui.makeResizable(handle, {
    axis: 'x',
    invert: true,
    min: 300,
    max: () => window.innerWidth - 40,
    getSize: () => panel.getBoundingClientRect().width,
    setSize: (w) => panel.style.setProperty('--ai-panel-w', w + 'px')
  });

  // Alto: arrastrar el handle hacia arriba agranda el panel
  // (el panel está anclado por "bottom" → invert:true).
  LGMDM.ui.makeResizable(handle, {
    axis: 'y',
    invert: true,
    min: 260,
    max: () => window.innerHeight - 120,
    getSize: () => panel.getBoundingClientRect().height,
    setSize: (h) => panel.style.setProperty('--ai-panel-h', h + 'px')
  });
})();
