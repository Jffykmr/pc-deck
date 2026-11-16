import json
import os
import threading
from pathlib import Path

DATA_DIR = Path(os.environ.get("DECK_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
CONFIG_PATH = DATA_DIR / "config.json"

# Quick actions on the Deck page when no app profile is active. Each one either
# sends a key combo ("keys") or launches a program ("exe"). Edited in config.json.
DEFAULT_SHORTCUTS = [
    {"id": "desktop", "label": "Desktop", "hint": "Mostra il desktop", "icon": "desktop", "keys": "win+d"},
    {"id": "tasks", "label": "Vista attività", "hint": "Tutte le finestre", "icon": "layout", "keys": "win+tab"},
    {"id": "explorer", "label": "Esplora file", "hint": "Apri una cartella", "icon": "folder", "keys": "win+e"},
    {"id": "search", "label": "Cerca", "hint": "Ricerca di Windows", "icon": "search", "keys": "win+s"},
    {"id": "snip", "label": "Cattura", "hint": "Ritaglia lo schermo", "icon": "scissors", "keys": "win+shift+s"},
    {"id": "undo", "label": "Annulla", "hint": "Ctrl + Z", "icon": "undo", "keys": "ctrl+z"},
]

DEFAULT_CONFIG = {"apps": [], "profiles": {}, "shortcuts": DEFAULT_SHORTCUTS, "notes": ""}

_lock = threading.Lock()


def load_config() -> dict:
    with _lock:
        if not CONFIG_PATH.exists():
            return json.loads(json.dumps(DEFAULT_CONFIG))
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        config.setdefault("shortcuts", json.loads(json.dumps(DEFAULT_SHORTCUTS)))
        return config


def save_config(config: dict) -> None:
    with _lock:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        # Write-then-rename so a crash mid-save never leaves a truncated config.
        tmp = CONFIG_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, CONFIG_PATH)


def get_app(config: dict, app_id: str) -> dict | None:
    return next((a for a in config.get("apps", []) if a.get("id") == app_id), None)


def get_profile(config: dict, process_name: str) -> dict | None:
    profiles = config.get("profiles", {})
    if process_name in profiles:
        return profiles[process_name]
    lowered = process_name.lower()
    return next((p for k, p in profiles.items() if k.lower() == lowered), None)
