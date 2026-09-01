from backend.app import app


def _route(path, method):
    for route in app.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route
    raise AssertionError(f"route not found: {method} {path}")


def test_sensitive_http_routes_have_auth_dependency():
    protected = {
        ("POST", "/master/preset/{preset_name}"),
        ("POST", "/preview"),
        ("POST", "/master"),
        ("POST", "/master/sync"),
        ("POST", "/master/reference/sync"),
        ("POST", "/master/normalize/sync"),
        ("GET", "/stems/download/{job_id}/{stem_name}"),
        ("GET", "/mix/stem-library"),
        ("POST", "/mix/stem-library/upload"),
        ("GET", "/mix/stem-library/{file_id}/download"),
        ("DELETE", "/mix/stem-library/{file_id}"),
    }
    for method, path in protected:
        route = _route(path, method)
        assert route.dependant.dependencies, f"{method} {path} should require auth"


def test_preview_websockets_require_token_parameter():
    ws_paths = {getattr(route, "path", None) for route in app.routes if getattr(route, "path", None)}
    assert "/ws/master-stream" in ws_paths
    assert "/ws/ref-stream" in ws_paths
    assert "/ws/mix-stream" in ws_paths
