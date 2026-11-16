# PC Deck

Touch control deck that turns a tablet (Android or iPad) into a controller for a Windows PC:
launch or switch to apps, per-app command keys (AutoCAD, Blender...), window switcher,
volume and media, live system stats, lock/sleep/restart/shutdown, and a shortcut to start
spacedesk.

## Architecture

```
tablet browser  ->  http://<pc-address>[:port]  ->  host-agent/agent.py (native, on the PC)
```

One native Python process (FastAPI) serves the built UI from `frontend/dist`, the REST API
under `/api` and a live-state WebSocket under `/ws`. It runs natively because controlling the
desktop (windows, keystrokes, audio) is not possible from a container.

Windows only for now. The OS-specific code lives in `host-agent/*_control.py`; a macOS port
means new versions of those modules.

## Install (Windows)

Requirements: Python 3.11+, Node 18+.

```powershell
cd host-agent
.\install-host-agent.ps1              # port 80
.\install-host-agent.ps1 -Port 8080   # or any free port
```

The script creates the venv, builds the UI, adds a hidden Startup entry and the firewall rule
`PC Deck (LAN)` (local subnet only), starts the deck and opens the pairing page.

## Pair a tablet

1. On the PC open `http://localhost[:port]/pair`. It shows a 6-digit code that changes every
   5 minutes. The page only opens from the PC itself.
2. On the tablet open `http://<pc-address>[:port]` and type the code.

Each device gets its own token. Paired devices are listed under **Imposta** and can be
removed there. Five wrong codes burn the current one.

**iPad:** open the address in Safari, then Share > Add to Home Screen, open the deck from that
icon and pair there. A Home Screen app keeps its own storage, so pairing done in a Safari tab
does not carry over.

**Android:** Chrome menu > Add to Home screen.

The PC address must not change: give it a static IP or a DHCP reservation on the router.

## Configure

`data/config.json` (edited from the tablet under **Imposta**, or by hand):

- `apps`: app keys in the bottom bar (`exe` path, label, colour).
- `profiles`: command keys shown while a given process is in front, keyed by exe name.
- `shortcuts`: quick actions when no profile is active. Each has `keys` (e.g. `win+d`) or
  `exe` (a program to launch, e.g. a search tool).

Server settings live in `.env` (see `.env.example`): port, interface, data folder.

## Develop

- UI: `cd frontend; npm run dev` (proxies to `http://127.0.0.1:80`, override with
  `DECK_DEV_AGENT`). `npm run build` writes `frontend/dist`; connected tablets reload by
  themselves on a new build.
- Agent: after a Python change end the `pythonw.exe agent.py` process; the launcher restarts it
  within 3 seconds.
- Tests: `cd host-agent; .venv\Scripts\python -m pytest test_auth.py -q`. They check that every
  API route rejects unpaired devices; they never send keys or power commands.

## Logs

- `host-agent/deck.log` rotating app log
- `host-agent/launcher.log` starts and exits of the process

## Security

Every API call and the live socket need a paired device token, including calls from the PC
itself (so a web page open on the PC cannot drive the deck). The firewall rule only admits the
local subnet. Traffic is plain HTTP: use it on a network you trust.

## License

MIT
