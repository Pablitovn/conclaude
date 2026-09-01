from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "frontend" / "js"


def test_pitch_correction_uses_current_library_contract():
    src = (JS / "14-pitch-correction.js").read_text(encoding="utf-8")
    assert "/library/list" not in src
    assert "apiFetch(`${api}/library`)" in src
    assert "Array.isArray(data.files)" in src


def test_projects_download_is_authenticated_and_blob_based():
    src = (JS / "21-projects-ui.js").read_text(encoding="utf-8")
    assert "await downloadAuthenticated(url" in src
    assert "a.href = url" not in src


def test_auth_transport_has_single_canonical_api_fetch_layer():
    api = (JS / "00-api.js").read_text(encoding="utf-8")
    auth = (JS / "00-auth.js").read_text(encoding="utf-8")
    assert "global.apiFetch = apiFetch;" in api
    assert "window.fetch = function" not in auth
    assert "apiFetch('/auth/me')" in auth


def test_websocket_uses_short_lived_ticket_and_not_session_jwt_in_url():
    api = (JS / "00-api.js").read_text(encoding="utf-8")
    auth = (JS / "00-auth.js").read_text(encoding="utf-8")
    for name in ("09-visualizers.js", "10-meters-dashboard.js", "13-mixer-engine.js", "08-reference-mastering.js"):
        src = (JS / name).read_text(encoding="utf-8")
        assert "wsAuthUrlFor" in src
    mixer_ui = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "mixerEngine" in mixer_ui
    for name in ("09-visualizers.js", "10-meters-dashboard.js", "13-mixer-engine.js", "13-mixer-ui.js", "08-reference-mastering.js"):
        src = (JS / name).read_text(encoding="utf-8")
        assert "localStorage.getItem(\"master_auth_token\")" not in src
    assert "global.wsAuthUrlFor = wsAuthUrl;" in api
    assert "sessionStorage.setItem(TOKEN_KEY, token)" in auth
    assert "/auth/ws-ticket" in api


def test_ws_ticket_backend_is_short_lived_and_scoped():
    auth = (ROOT / "backend" / "auth.py").read_text(encoding="utf-8")
    router = (ROOT / "backend" / "routers" / "auth.py").read_text(encoding="utf-8")
    app = (ROOT / "backend" / "app.py").read_text(encoding="utf-8")
    assert 'WS_TICKET_EXPIRY_SEC = int(os.getenv("WS_TICKET_EXPIRY_SEC", "60"))' in auth
    assert '"aud": "websocket"' in auth
    assert '"typ": "ws-ticket"' in auth
    assert '/auth/ws-ticket' in router
    assert 'payload.get("aud") not in (None, "websocket")' in app


def test_mixer_polling_cannot_leave_an_interval_behind():
    src = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "clearInterval(mixerState.polling)" not in src
    assert "clearTimeout(mixerState.polling)" in src
    assert "mixerState.polling = setTimeout(pollOnce, 1500);" in src


def test_mixer_uses_canonical_api_paths():
    src = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "apiFetch(`${getAPI()}" not in src
    assert "apiFetch('/mix/upload-stem'" in src
    assert "apiFetch('/mix/submit'" in src
    assert "apiFetch(`/job/${jobId}`)" in src


def test_master_console_markup():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    js = (root / "frontend" / "js" / "15-master-console.js").read_text(encoding="utf-8")
    assert 'id="lgMasterConsole"' in html
    assert 'id="lgmdmWaveformCanvas"' in html
    assert 'id="lgmdmConsoleSpectrum"' in html
    assert '15-master-console.js' in html
    assert 'consoleMasterBtn' in js


def test_master_console_controls_and_backend_chain_contract():
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    console = (JS / "15-master-console.js").read_text(encoding="utf-8")
    routes = (ROOT / "backend" / "routers" / "mastering.py").read_text(encoding="utf-8")
    dsp = (ROOT / "backend" / "mastering.py").read_text(encoding="utf-8")
    stream = (ROOT / "backend" / "streaming_engine.py").read_text(encoding="utf-8")
    for element_id in ("consoleInputFader", "consoleCompThreshold", "consoleCompRatio", "consoleStereoFader", "consoleLimiterFader", "consoleABMaster", "consoleABOriginal"):
        assert f'id="{element_id}"' in html
    assert "getChainOverrides" in console
    assert "comp_bypass" in console and "stereo_bypass" in console and "limiter_bypass" in console
    assert routes.count("comp_bypass: bool") >= 3
    assert routes.count("limiter_bypass: bool") >= 3
    assert "comp_bypass=comp_bypass" in routes
    assert "stereo_bypass=stereo_bypass" in routes
    assert "limiter_bypass=limiter_bypass" in routes
    assert '"limiter": limiter_meters' in dsp
    assert '"chain_meters":   chain_meters' in stream
    assert '"limiter_meters": chain_meters.get("limiter", {})' in stream


def test_master_console_ab_mode_is_exposed_to_ui():
    src = (JS / "09-visualizers.js").read_text(encoding="utf-8")
    console = (JS / "15-master-console.js").read_text(encoding="utf-8")
    assert "function _abSetMode(mode)" in src
    assert "window.LGMDM.ab.setMode = _abSetMode" in src
    assert "LGMDM?.ab?.setMode" in console


def test_master_console_dsp_bypass_path_has_real_meter_state():
    src = (ROOT / "backend" / "mastering.py").read_text(encoding="utf-8")
    assert 'if comp_bypass:' in src
    assert 'if limiter_bypass:' in src
    assert 'limiter_meters["gr_db"]' in src
