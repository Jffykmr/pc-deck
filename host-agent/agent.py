"""PC Deck: single native process.

Serves the tablet UI (frontend/dist), the REST API under /api and the live
state WebSocket under /ws. Replaces the old Docker frontend + backend proxy.
"""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

import psutil
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config_store
from pairing import Pairing
from apps_control import close_window, foreground_app, force_set_foreground, launch, list_windows
from audio_control import get_volume, set_mute, set_volume
from icon_control import icon_for_exe
from keys_control import send_keys
import media_control
import screen_control
from power_control import cancel_pending, lock_workstation, restart, shutdown, sleep_display
from system_control import get_system_stats

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
LOG_PATH = Path(__file__).resolve().parent / "deck.log"


def _read_dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip()
    return values


_env = {**_read_dotenv(), **os.environ}
DECK_TOKEN = _env.get("DECK_TOKEN", "")  # optional legacy shared token
DECK_HOST = _env.get("DECK_HOST", "0.0.0.0")
DECK_PORT = int(_env.get("DECK_PORT", "80"))
# spacedesk runs as the Windows service "spacedeskService" (automatic start). The
# console is what the deck opens when the service is not running.
SPACEDESK_EXE = _env.get("SPACEDESK_EXE", r"C:\Program Files\datronicsoft\spacedesk\spacedeskConsole.exe")
pairing = Pairing(config_store.DATA_DIR, DECK_TOKEN)
SPACEDESK_PROCESS_NAMES = {"spacedeskservice.exe", "spacedesk.exe"}
TICK_SECONDS = 1.0

log = logging.getLogger("deck")


# ---------------------------------------------------------------- live state

class Live:
    """One poller for every connected tablet, instead of one loop per socket."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.snapshot: dict = {"host_agent": True}
        self.wake = asyncio.Event()

    async def collect(self) -> dict:
        async def safe(fn):
            try:
                return await asyncio.to_thread(fn)
            except Exception as e:  # one failing source must not blank the others
                log.debug("live source %s failed: %s", fn.__name__, e)
                return None

        fg, vol, wins, sysstats = await asyncio.gather(
            safe(foreground_app), safe(get_volume), safe(list_windows), safe(get_system_stats)
        )
        state = {"host_agent": True, "system": sysstats, "windows": wins or [], "media": media_control.snapshot(), "build": _build_id()}
        if fg is not None:
            state["foreground"] = fg
        if vol is not None:
            state["volume"] = vol
        return state

    async def run(self) -> None:
        while True:
            try:
                if self.clients:
                    self.snapshot = await self.collect()
                    # Send to every client concurrently with a deadline. Awaiting each
                    # send in turn let one tablet on a slow Wi-Fi link stall the loop,
                    # so nobody got updates and every client showed "PC non raggiungibile".
                    clients = list(self.clients)
                    results = await asyncio.gather(
                        *(asyncio.wait_for(ws.send_json(self.snapshot), timeout=3) for ws in clients),
                        return_exceptions=True,
                    )
                    for ws, res in zip(clients, results):
                        if isinstance(res, Exception):
                            self.clients.discard(ws)
                            log.info("live client dropped: %s", type(res).__name__)
                            try:
                                await asyncio.wait_for(ws.close(), timeout=1)
                            except Exception:
                                pass
            except Exception:
                log.exception("live loop error")
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=TICK_SECONDS)
            except asyncio.TimeoutError:
                pass
            self.wake.clear()

    def poke(self) -> None:
        """Push fresh state right after an action so the UI doesn't lag a tick."""
        self.wake.set()


live = Live()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(live.run())
    log.info("PC Deck listening on http://%s:%s", DECK_HOST, DECK_PORT)
    log.info("Pairing code page: http://127.0.0.1:%s/pair", DECK_PORT)
    yield
    task.cancel()


app = FastAPI(title="pc-deck", lifespan=lifespan, docs_url=None, redoc_url=None)


# ---------------------------------------------------------------- auth

async def require_token(x_deck_token: str = Header(default="")):
    # Always on, also for requests from the PC itself: the custom header is what
    # stops any web page open on the PC from firing these endpoints.
    if not pairing.check(x_deck_token):
        raise HTTPException(status_code=401, detail="Dispositivo non abbinato")


def _check_query_token(token: str) -> None:
    # <img src> and <canvas> fetches cannot send headers; they use ?token=.
    if not pairing.check(token):
        raise HTTPException(status_code=401, detail="Dispositivo non abbinato")


def _is_loopback(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "::1", "localhost"}


auth = [Depends(require_token)]


async def _run(fn, *args):
    try:
        return await asyncio.to_thread(fn, *args)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------- models

class LaunchExe(BaseModel):
    exe: str
    args: list[str] = []


class VolumeSet(BaseModel):
    level: int


class MuteSet(BaseModel):
    muted: bool | None = None


class KeysRun(BaseModel):
    keys: str


class PowerDelay(BaseModel):
    delay_seconds: int = 10


class PairRequest(BaseModel):
    code: str
    name: str = ""


# ---------------------------------------------------------------- routes

@app.get("/api/health")
async def health():
    return {"status": "ok", "host_agent": True}


@app.post("/api/pair")
async def pair_device(body: PairRequest):
    token = await asyncio.to_thread(pairing.pair, body.code, body.name)
    if not token:
        raise HTTPException(status_code=403, detail="Codice errato o scaduto")
    return {"token": token}


@app.get("/api/pair/code")
async def pair_code(request: Request):
    if not _is_loopback(request):
        raise HTTPException(status_code=403, detail="Solo dal PC")
    code, left = pairing.current_code()
    return {"code": code, "expires_in": left}


@app.get("/pair", include_in_schema=False)
async def pair_page(request: Request):
    if not _is_loopback(request):
        raise HTTPException(status_code=403, detail="Apri questa pagina dal PC")
    return HTMLResponse(PAIR_PAGE)


@app.get("/api/whoami")
async def whoami(x_deck_token: str = Header(default="")):
    device = await asyncio.to_thread(pairing.check, x_deck_token)
    if not device:
        raise HTTPException(status_code=401, detail="Dispositivo non abbinato")
    return {"id": device.get("id"), "name": device.get("name")}


@app.get("/api/devices", dependencies=auth)
async def devices_list():
    return await asyncio.to_thread(pairing.list)


@app.delete("/api/devices/{device_id}", dependencies=auth)
async def devices_revoke(device_id: str):
    if not await asyncio.to_thread(pairing.revoke, device_id):
        raise HTTPException(status_code=404, detail="Dispositivo non trovato")
    return {"ok": True}


@app.get("/api/apps", dependencies=auth)
async def list_apps():
    return config_store.load_config().get("apps", [])


def _launch_checked(exe: str, args: list[str]) -> dict:
    if not os.path.exists(exe):
        raise HTTPException(status_code=404, detail=f"Eseguibile non trovato: {exe}")
    return {"ok": True, "pid": launch(exe, args)}


@app.post("/api/launch", dependencies=auth)
async def launch_exe(body: LaunchExe):
    result = await _run(_launch_checked, body.exe, body.args)
    live.poke()
    return result


@app.post("/api/apps/{app_id}/launch", dependencies=auth)
async def launch_app(app_id: str):
    app_def = config_store.get_app(config_store.load_config(), app_id)
    if not app_def:
        raise HTTPException(status_code=404, detail=f"App sconosciuta: {app_id}")
    result = await _run(_launch_checked, app_def["exe"], app_def.get("args", []))
    live.poke()
    return result


@app.get("/api/windows", dependencies=auth)
async def get_windows():
    return {"windows": await _run(list_windows)}


@app.post("/api/windows/{hwnd}/focus", dependencies=auth)
async def focus_window(hwnd: int):
    await _run(force_set_foreground, hwnd)
    live.poke()
    return {"ok": True}


@app.post("/api/windows/{hwnd}/close", dependencies=auth)
async def close_window_route(hwnd: int):
    await _run(close_window, hwnd)
    live.poke()
    return {"ok": True}


def _png(data: bytes | None) -> Response:
    if data is None:
        raise HTTPException(status_code=404, detail="Nessuna icona")
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/icon")
async def icon_by_pid(pid: int, size: int = 64, token: str = ""):
    _check_query_token(token)
    try:
        exe_path = psutil.Process(pid).exe()
    except psutil.Error:
        raise HTTPException(status_code=404, detail="Processo non trovato")
    return _png(await asyncio.to_thread(icon_for_exe, exe_path, size))


@app.get("/api/apps/{app_id}/icon")
async def icon_by_app(app_id: str, size: int = 128, token: str = ""):
    _check_query_token(token)
    app_def = config_store.get_app(config_store.load_config(), app_id)
    if not app_def or not os.path.exists(app_def.get("exe", "")):
        raise HTTPException(status_code=404, detail="Nessuna icona")
    return _png(await asyncio.to_thread(icon_for_exe, app_def["exe"], size))


@app.get("/api/media/art")
async def media_art(token: str = "", v: str = ""):
    _check_query_token(token)
    data = media_control.art()
    if data is None:
        raise HTTPException(status_code=404, detail="Nessuna copertina")
    kind = "image/png" if data[:4] == bytes([0x89]) + b"PNG" else "image/jpeg"
    return Response(content=data, media_type=kind, headers={"Cache-Control": "public, max-age=3600"})


@app.post("/api/media/{action}", dependencies=auth)
async def media_action(action: str):
    if action not in {"playpause", "next", "prev"}:
        raise HTTPException(status_code=404, detail="Azione sconosciuta")
    try:
        handled = await asyncio.to_thread(media_control.command, action)
    except Exception:
        handled = False
    if not handled:  # no media session: fall back to the global media keys
        keys = {"playpause": "mediaplaypause", "next": "medianext", "prev": "mediaprev"}[action]
        await _run(send_keys, keys)
    live.poke()
    return {"ok": True}


@app.get("/api/screen.jpg")
async def screen_frame(token: str = ""):
    _check_query_token(token)
    if os.path.exists(Path(__file__).resolve().parent / "screen.off"):
        return Response(status_code=204, headers={"Cache-Control": "no-store"})
    frame = await asyncio.to_thread(screen_control.latest_frame)
    if frame is None:
        return Response(status_code=204, headers={"Cache-Control": "no-store"})
    return Response(content=frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


DIAG_PATH = Path(__file__).resolve().parent / "diag.log"


@app.post("/api/diag", dependencies=auth)
async def diag(events: list[dict]):
    """Client-side timeline (reconnects, resizes, long frames...) for chasing UI glitches."""
    lines = []
    for e in events[:200]:
        lines.append(f"{e.get('t', '')} {str(e.get('kind', ''))[:40]} {str(e.get('detail', ''))[:300]}")
    if lines:
        with open(DIAG_PATH, "a", encoding="utf-8") as fh:
            fh.write(chr(10).join(lines) + chr(10))
        if DIAG_PATH.stat().st_size > 2_000_000:
            os.replace(DIAG_PATH, DIAG_PATH.with_suffix(".old.log"))
    return {"ok": True}


def _build_id() -> str:
    try:
        return str(int((DIST / "index.html").stat().st_mtime))
    except OSError:
        return ""


@app.get("/api/volume", dependencies=auth)
async def volume_get():
    return await _run(get_volume)


@app.post("/api/volume", dependencies=auth)
async def volume_set(body: VolumeSet):
    result = await _run(set_volume, body.level)
    live.snapshot["volume"] = result
    return result


@app.post("/api/volume/mute", dependencies=auth)
async def volume_mute(body: MuteSet):
    result = await _run(set_mute, body.muted)
    live.poke()
    return result


@app.get("/api/profiles/current", dependencies=auth)
async def profile_current():
    fg = await _run(foreground_app)
    name = (fg or {}).get("process_name")
    profile = config_store.get_profile(config_store.load_config(), name) if name else None
    return {"foreground": fg, "profile_key": name if profile else None, "profile": profile}


@app.post("/api/profiles/{process_name}/commands/{command_id}/run", dependencies=auth)
async def profile_run_command(process_name: str, command_id: str):
    profile = config_store.get_profile(config_store.load_config(), process_name)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Nessun profilo per {process_name}")
    command = next((c for c in profile.get("commands", []) if c.get("id") == command_id), None)
    if not command:
        raise HTTPException(status_code=404, detail=f"Comando {command_id} non trovato")
    await _run(send_keys, command["keys"], command.get("press_enter", False))
    return {"ok": True}


@app.post("/api/keys", dependencies=auth)
async def run_keys(body: KeysRun):
    await _run(send_keys, body.keys)
    live.poke()
    return {"ok": True}


@app.get("/api/system", dependencies=auth)
async def system_stats():
    return await _run(get_system_stats)


@app.post("/api/power/lock", dependencies=auth)
async def power_lock():
    await _run(lock_workstation)
    return {"ok": True}


@app.post("/api/display/sleep", dependencies=auth)
async def display_sleep():
    await _run(sleep_display)
    return {"ok": True}


@app.post("/api/power/shutdown", dependencies=auth)
async def power_shutdown(body: PowerDelay = PowerDelay()):
    await _run(shutdown, body.delay_seconds)
    return {"ok": True, "delay_seconds": body.delay_seconds}


@app.post("/api/power/restart", dependencies=auth)
async def power_restart(body: PowerDelay = PowerDelay()):
    await _run(restart, body.delay_seconds)
    return {"ok": True, "delay_seconds": body.delay_seconds}


@app.post("/api/power/cancel", dependencies=auth)
async def power_cancel():
    await _run(cancel_pending)
    return {"ok": True}


def _spacedesk_running() -> bool:
    return any((p.info["name"] or "").lower() in SPACEDESK_PROCESS_NAMES for p in psutil.process_iter(["name"]))


@app.get("/api/display/status", dependencies=auth)
async def display_status():
    return {"running": await _run(_spacedesk_running), "installed": os.path.exists(SPACEDESK_EXE)}


@app.post("/api/display/start-server", dependencies=auth)
async def display_start_server():
    return await _run(_launch_checked, SPACEDESK_EXE, [])


@app.get("/api/config", dependencies=auth)
async def get_config():
    return config_store.load_config()


@app.put("/api/config", dependencies=auth)
async def put_config(config: dict):
    if "apps" not in config or "profiles" not in config:
        raise HTTPException(status_code=400, detail="La configurazione deve contenere 'apps' e 'profiles'")
    await asyncio.to_thread(config_store.save_config, config)
    return config


@app.websocket("/ws")
async def ws_state(websocket: WebSocket):
    if not pairing.check(websocket.query_params.get("token", "")):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    live.clients.add(websocket)
    live.poke()
    try:
        while True:
            await websocket.receive_text()  # keeps the socket open; client sends pings
    except WebSocketDisconnect:
        pass
    finally:
        live.clients.discard(websocket)


PAIR_PAGE = """<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PC Deck - abbina</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#161615;color:#f2efe8;
font-family:system-ui,sans-serif}main{text-align:center}h1{font-size:18px;font-weight:600;margin:0 0 24px;opacity:.7}
#c{font:700 96px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em}p{opacity:.6;font-size:15px;max-width:30em}
#t{font-variant-numeric:tabular-nums}</style></head><body><main><h1>Codice di abbinamento</h1>
<div id="c">------</div><p>Sul tablet apri il deck e scrivi questo codice. Scade tra <span id="t">-</span> s,
poi ne compare uno nuovo.</p></main><script>
async function tick(){try{const r=await fetch('/api/pair/code',{cache:'no-store'});const j=await r.json();
document.getElementById('c').textContent=j.code;document.getElementById('t').textContent=j.expires_in}catch(e){}}
tick();setInterval(tick,1000)</script></body></html>"""


# ---------------------------------------------------------------- static UI

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (DIST / path).resolve()
        if path and candidate.is_file() and DIST.resolve() in candidate.parents:
            headers = {"Cache-Control": "no-cache"} if candidate.name in {"sw.js", "manifest.webmanifest"} else None
            return FileResponse(candidate, headers=headers)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})


# ---------------------------------------------------------------- entrypoint

def _setup_logging() -> None:
    handler = RotatingFileHandler(LOG_PATH, maxBytes=2_000_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    # pythonw has no console: stdout/stderr are None and any stray print kills the process.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")


if __name__ == "__main__":
    import uvicorn

    _setup_logging()
    uvicorn.run(app, host=DECK_HOST, port=DECK_PORT, access_log=False, log_config=None, ws_ping_interval=20)
