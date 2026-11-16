import time

import win32api
import win32con

_VK_MAP = {
    "ctrl": win32con.VK_CONTROL,
    "control": win32con.VK_CONTROL,
    "shift": win32con.VK_SHIFT,
    "alt": win32con.VK_MENU,
    "win": win32con.VK_LWIN,
    "esc": win32con.VK_ESCAPE,
    "escape": win32con.VK_ESCAPE,
    "enter": win32con.VK_RETURN,
    "return": win32con.VK_RETURN,
    "tab": win32con.VK_TAB,
    "space": win32con.VK_SPACE,
    "backspace": win32con.VK_BACK,
    "delete": win32con.VK_DELETE,
    "up": win32con.VK_UP,
    "down": win32con.VK_DOWN,
    "left": win32con.VK_LEFT,
    "right": win32con.VK_RIGHT,
    "home": win32con.VK_HOME,
    "end": win32con.VK_END,
    "pageup": win32con.VK_PRIOR,
    "pagedown": win32con.VK_NEXT,
    # standard Windows media/volume virtual-key codes (winuser.h), not all
    # exposed by name in every pywin32 build, so given as literals
    "mediaplaypause": 0xB3,
    "medianext": 0xB0,
    "mediaprev": 0xB1,
    "mediastop": 0xB2,
    "volumemute": 0xAD,
    "volumedown": 0xAE,
    "volumeup": 0xAF,
}
for _i in range(1, 25):
    _VK_MAP[f"f{_i}"] = win32con.VK_F1 + (_i - 1)


def _vk_for_token(token: str) -> int:
    token = token.strip().lower()
    if token in _VK_MAP:
        return _VK_MAP[token]
    if len(token) == 1:
        return ord(token.upper())
    raise ValueError(f"Unknown key token: {token!r}")


def _press(vk: int) -> None:
    win32api.keybd_event(vk, 0, 0, 0)
    time.sleep(0.01)
    win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
    time.sleep(0.01)


def _type_text(text: str) -> None:
    # A literal space is skipped, never sent as a keystroke: many command-line apps
    # (AutoCAD included) treat Space as Enter/confirm, so typing it mid-phrase submits
    # whatever's been typed so far instead of continuing the word — real command-line
    # tokens never contain spaces anyway, so this just makes "ruota 3d" type as "ruota3d".
    for ch in text:
        if ch.isalnum():
            _press(ord(ch.upper()))


def _send_step(step: str) -> None:
    tokens = [t for t in step.split("+") if t.strip()]
    if not tokens:
        return

    # A single token longer than one character that isn't a named key (e.g. "polilinea")
    # is literal text meant for a command line, not a modifier chord — type it character
    # by character instead of trying to resolve it to one virtual key.
    if len(tokens) == 1 and len(tokens[0].strip()) > 1 and tokens[0].strip().lower() not in _VK_MAP:
        _type_text(tokens[0])
    else:
        vks = [_vk_for_token(t) for t in tokens]
        for vk in vks:
            win32api.keybd_event(vk, 0, 0, 0)
            time.sleep(0.01)
        for vk in reversed(vks):
            win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
            time.sleep(0.01)


def send_keys(keys: str, press_enter: bool = False) -> None:
    # ";" chains multiple confirmed steps in one command — e.g. "solidedit;faccia;sposta"
    # types "solidedit", presses Enter, types "faccia", presses Enter, then types "sposta"
    # (only auto-confirmed at the end if press_enter is set), for menu-style AutoCAD
    # commands that need more than one word before they're ready for the user's own input.
    steps = [s.strip() for s in keys.split(";") if s.strip()]
    if not steps:
        raise ValueError("Empty key combination")

    for i, step in enumerate(steps):
        _send_step(step)
        if i < len(steps) - 1:
            _press(win32con.VK_RETURN)

    if press_enter:
        _press(win32con.VK_RETURN)
