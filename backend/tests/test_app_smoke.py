from backend.app import app


def test_app_version_is_consistent():
    assert app.version == "7.0.1"


def test_core_routes_are_registered():
    routes = {getattr(route, "path", None) for route in app.routes}
    expected = {
        "/health",
        "/auth/login",
        "/projects",
        "/master",
        "/master/reference",
        "/master/normalize",
        "/pitch-correct",
        "/mix",
        "/ws/master-stream",
        "/ws/mix-stream",
    }
    assert expected.issubset(routes)
