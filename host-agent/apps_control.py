import os
import subprocess

import psutil
import win32api
import win32con
import win32gui
import win32process


def launch(exe: str, args: list[str] | None = None) -> int:
    # Start in the app's own folder and fully detached. Inheriting the agent's cwd
    # made apps like AutoCAD drop crash reports and temp files into host-agent/.
    proc = subprocess.Popen(
        [exe, *(args or [])],
        cwd=os.path.dirname(exe) or None,
        shell=False,
        close_fds=True,
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return proc.pid


def close_window(hwnd: int) -> None:
    if not win32gui.IsWindow(hwnd):
        raise ValueError(f"Invalid window handle: {hwnd}")
    win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)


def _is_alt_tab_window(hwnd: int) -> bool:
    """Standard heuristic for 'real' top-level app windows (matches Alt+Tab),
    correctly including owned windows that opt in via WS_EX_APPWINDOW
    (e.g. modern packaged apps like the Windows 11 Notepad)."""
    if not win32gui.IsWindowVisible(hwnd):
        return False
    if not win32gui.GetWindowText(hwnd).strip():
        return False
    ex_style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
    if ex_style & win32con.WS_EX_TOOLWINDOW:
        return False
    owner = win32gui.GetWindow(hwnd, win32con.GW_OWNER)
    if owner != 0 and not (ex_style & win32con.WS_EX_APPWINDOW):
        return False
    return True


def _enum_windows() -> list[dict]:
    results = []

    def callback(hwnd, _):
        if not _is_alt_tab_window(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            pname = psutil.Process(pid).name()
        except psutil.Error:
            pname = "unknown"
        results.append({"hwnd": hwnd, "title": title, "process_name": pname, "pid": pid})

    win32gui.EnumWindows(callback, None)
    return results


def list_windows() -> list[dict]:
    return _enum_windows()


def force_set_foreground(hwnd: int) -> None:
    if not win32gui.IsWindow(hwnd):
        raise ValueError(f"Invalid window handle: {hwnd}")

    fg_hwnd = win32gui.GetForegroundWindow()
    fg_thread, _ = win32process.GetWindowThreadProcessId(fg_hwnd) if fg_hwnd else (0, 0)
    target_thread, _ = win32process.GetWindowThreadProcessId(hwnd)
    current_thread = win32api.GetCurrentThreadId()

    attached = []
    try:
        for thread_id in {fg_thread, target_thread}:
            if thread_id and thread_id != current_thread:
                try:
                    win32process.AttachThreadInput(current_thread, thread_id, True)
                    attached.append(thread_id)
                except Exception:
                    # Some threads (e.g. sandboxed/packaged-app windows) refuse
                    # input attachment; SetForegroundWindow below can still work.
                    pass

        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)
    finally:
        for thread_id in attached:
            try:
                win32process.AttachThreadInput(current_thread, thread_id, False)
            except Exception:
                pass


def foreground_app() -> dict | None:
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd:
        return None
    title = win32gui.GetWindowText(hwnd)
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    try:
        pname = psutil.Process(pid).name()
    except psutil.Error:
        pname = "unknown"
    return {"hwnd": hwnd, "title": title, "process_name": pname, "pid": pid}
