import ctypes
import subprocess

_HWND_BROADCAST = 0xFFFF
_WM_SYSCOMMAND = 0x0112
_SC_MONITORPOWER = 0xF170
_MONITOR_OFF = 2


def _run(args: list[str]) -> None:
    subprocess.Popen(args, creationflags=subprocess.CREATE_NO_WINDOW)


def lock_workstation() -> None:
    ctypes.windll.user32.LockWorkStation()


def sleep_display() -> None:
    # PostMessage, not SendMessage: a broadcast SendMessage blocks until every
    # top-level window answers, so one hung app froze the request forever.
    ctypes.windll.user32.PostMessageW(_HWND_BROADCAST, _WM_SYSCOMMAND, _SC_MONITORPOWER, _MONITOR_OFF)


def shutdown(delay_seconds: int = 10) -> None:
    _run(["shutdown", "/s", "/t", str(delay_seconds)])


def restart(delay_seconds: int = 10) -> None:
    _run(["shutdown", "/r", "/t", str(delay_seconds)])


def cancel_pending() -> None:
    _run(["shutdown", "/a"])
