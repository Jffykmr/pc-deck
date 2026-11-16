"""Auth self-check. Never calls an endpoint with a valid token, so nothing on the
desktop is touched (no keys, launches or power actions).

    .venv\\Scripts\\python -m pytest test_auth.py -q
"""

import os
import tempfile

os.environ["DECK_DATA_DIR"] = tempfile.mkdtemp(prefix="deck-test-")
os.environ["DECK_TOKEN"] = ""

import pytest  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

import agent  # noqa: E402

OPEN = {"/api/health", "/api/pair", "/api/pair/code"}
client = TestClient(agent.app)  # client host is "testclient", i.e. not loopback


def _api_routes():
    for r in agent.app.routes:
        if isinstance(r, APIRoute) and r.path.startswith("/api") and r.path not in OPEN:
            for m in r.methods - {"HEAD"}:
                yield m, r.path


@pytest.mark.parametrize("method,path", sorted(_api_routes()))
def test_unpaired_is_rejected(method, path):
    url = path.replace("{app_id}", "x").replace("{hwnd}", "1").replace("{device_id}", "x")
    url = url.replace("{process_name}", "x").replace("{command_id}", "x").replace("{action}", "next")
    for headers in ({}, {"X-Deck-Token": "wrong"}):
        res = client.request(method, url, headers=headers, params={"pid": 1, "token": "wrong"}, json={})
        assert res.status_code == 401, (method, url, res.status_code)


def test_ws_rejected():
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?token=wrong") as ws:
            ws.receive_text()


def test_code_page_only_from_pc():
    assert client.get("/pair").status_code == 403
    assert client.get("/api/pair/code").status_code == 403


def test_pair_flow_and_revoke():
    p = agent.pairing
    code, _ = p.current_code()
    assert client.post("/api/pair", json={"code": "000000" if code != "000000" else "111111"}).status_code == 403
    code, _ = p.current_code()
    res = client.post("/api/pair", json={"code": code, "name": "Prova"})
    assert res.status_code == 200
    token = res.json()["token"]
    # code is one-time
    assert client.post("/api/pair", json={"code": code}).status_code == 403
    h = {"X-Deck-Token": token}
    me = client.get("/api/whoami", headers=h).json()
    assert me["name"] == "Prova"
    assert client.get("/api/config", headers=h).status_code == 200
    assert "hash" not in str(client.get("/api/devices", headers=h).json())
    assert client.delete(f"/api/devices/{me['id']}", headers=h).status_code == 200
    assert client.get("/api/whoami", headers=h).status_code == 401


def test_brute_force_burns_code():
    p = agent.pairing
    code, _ = p.current_code()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        client.post("/api/pair", json={"code": wrong})
    assert client.post("/api/pair", json={"code": code}).status_code == 403
