"""Device pairing.

The PC shows a short one-time code on a page only reachable from the PC itself
(http://127.0.0.1:<port>/pair). The tablet sends that code once and gets back a
long random device token, which it keeps and sends with every request.

Only SHA-256 hashes of device tokens are stored, in devices.json next to the
config (never inside config.json, which clients can read).
"""

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

CODE_TTL = 300  # seconds a pairing code stays valid
MAX_ATTEMPTS = 5  # wrong guesses before the current code is burned


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Pairing:
    def __init__(self, data_dir: Path, legacy_token: str = "") -> None:
        self.path = data_dir / "devices.json"
        self.legacy_token = legacy_token  # DECK_TOKEN from .env keeps working
        self._lock = threading.Lock()
        self._code: str | None = None
        self._code_expires = 0.0
        self._attempts = 0

    # ---------------------------------------------------------- storage

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []

    def _save(self, devices: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(devices, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)

    # ---------------------------------------------------------- code

    def current_code(self) -> tuple[str, int]:
        """Code to show on the PC and seconds left. A new one once it expires."""
        with self._lock:
            now = time.time()
            if not self._code or now >= self._code_expires:
                self._code = f"{secrets.randbelow(1_000_000):06d}"
                self._code_expires = now + CODE_TTL
                self._attempts = 0
            return self._code, int(self._code_expires - now)

    def pair(self, code: str, name: str) -> str | None:
        """Returns a new device token if the code is right, else None."""
        with self._lock:
            now = time.time()
            if not self._code or now >= self._code_expires:
                return None
            if not hmac.compare_digest(code.strip(), self._code):
                self._attempts += 1
                if self._attempts >= MAX_ATTEMPTS:
                    self._code = None  # brute force: force a fresh code on the PC
                return None
            self._code = None  # one-time
            token = secrets.token_urlsafe(32)
            devices = self._load()
            devices.append({
                "id": secrets.token_hex(4),
                "name": (name.strip() or "Dispositivo")[:60],
                "hash": _hash(token),
                "paired_at": int(now),
                "last_seen": int(now),
            })
            self._save(devices)
            return token

    # ---------------------------------------------------------- tokens

    def check(self, token: str) -> dict | None:
        """Device record for a valid token, else None."""
        if not token:
            return None
        if self.legacy_token and hmac.compare_digest(token, self.legacy_token):
            return {"id": "legacy", "name": "Token da .env"}
        h = _hash(token)
        with self._lock:
            devices = self._load()
            for d in devices:
                if hmac.compare_digest(d.get("hash", ""), h):
                    now = int(time.time())
                    if now - d.get("last_seen", 0) > 3600:  # avoid a disk write per request
                        d["last_seen"] = now
                        self._save(devices)
                    return d
        return None

    def list(self) -> list[dict]:
        with self._lock:
            return [{k: d[k] for k in ("id", "name", "paired_at", "last_seen") if k in d} for d in self._load()]

    def revoke(self, device_id: str) -> bool:
        with self._lock:
            devices = self._load()
            kept = [d for d in devices if d.get("id") != device_id]
            if len(kept) == len(devices):
                return False
            self._save(kept)
            return True
