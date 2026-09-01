from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FRONT = ROOT / "frontend"


def js(name):
    return (FRONT / "js" / name).read_text(encoding="utf-8")


def test_api_exposes_namespaced_runtime_and_dom_cache():
    text = js("00-api.js")
    assert "global.LGMDM" in text
    assert "LGMDM.api" in text
    assert "LGMDM.dom.cachedEl" in text


def test_dom_cache_is_not_redefined_in_visualizer_modules():
    assert "window.cachedEl = function" not in js("09-visualizers.js")
    assert "window.cachedEl = function" not in js("10-meters-dashboard.js")


def test_mixer_runtime_is_split_from_ui():
    runtime = js("13-mixer-engine.js")
    ui = js("13-mixer-ui.js")
    assert "LGMDM.mixerEngine" in runtime
    assert "const runtime = window.LGMDM?.mixerEngine" in ui
    assert len(runtime) < 30000
    assert len(ui) < 100000


def test_error_surface_and_safe_exception_rendering():
    errors = js("16-error-handling.js")
    pro = js("20-pro-upgrades.js")
    assert "LGMDM.errors.handle" in errors
    assert "LGMDM.html.escape" in errors
    assert "Error: ${e.message}</div>" not in pro
