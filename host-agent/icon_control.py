import ctypes
import io
import threading
from ctypes import wintypes

import win32con
import win32gui
import win32ui
from PIL import Image

_cache: dict[str, bytes | None] = {}
_lock = threading.Lock()

_user32 = ctypes.windll.user32
_user32.PrivateExtractIconsW.argtypes = [
    wintypes.LPCWSTR, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    ctypes.POINTER(wintypes.HICON), ctypes.POINTER(wintypes.UINT), wintypes.UINT, wintypes.UINT,
]
_user32.PrivateExtractIconsW.restype = wintypes.UINT


def _hicon_to_png(hicon, size: int) -> bytes:
    # Every GDI object is released explicitly: the old version leaked a screen DC,
    # a memory DC and a bitmap per icon, which slowly exhausts the GDI handle quota.
    screen_dc = win32gui.GetDC(0)
    hdc_screen = win32ui.CreateDCFromHandle(screen_dc)
    hdc_mem = hdc_screen.CreateCompatibleDC()
    hbmp = win32ui.CreateBitmap()
    try:
        hbmp.CreateCompatibleBitmap(hdc_screen, size, size)
        old = hdc_mem.SelectObject(hbmp)
        win32gui.DrawIconEx(hdc_mem.GetSafeHdc(), 0, 0, hicon, size, size, 0, None, win32con.DI_NORMAL)
        hdc_mem.SelectObject(old)
        info = hbmp.GetInfo()
        bits = hbmp.GetBitmapBits(True)
        img = Image.frombuffer("RGBA", (info["bmWidth"], info["bmHeight"]), bits, "raw", "BGRA", 0, 1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    finally:
        win32gui.DeleteObject(hbmp.GetHandle())
        hdc_mem.DeleteDC()
        win32gui.ReleaseDC(0, screen_dc)


def _extract(exe_path: str, size: int) -> bytes | None:
    # PrivateExtractIcons picks the closest native size (up to 256px), so tiles get
    # a crisp icon instead of a 32px one stretched.
    hicon = wintypes.HICON()
    icon_id = wintypes.UINT()
    count = _user32.PrivateExtractIconsW(exe_path, 0, size, size, ctypes.byref(hicon), ctypes.byref(icon_id), 1, 0)
    if count == 0 or not hicon.value:
        return None
    try:
        return _hicon_to_png(hicon.value, size)
    finally:
        win32gui.DestroyIcon(hicon.value)


def icon_for_exe(exe_path: str, size: int = 96) -> bytes | None:
    size = max(16, min(256, size))
    key = f"{exe_path.lower()}:{size}"
    with _lock:
        if key in _cache:
            return _cache[key]
        try:
            png = _extract(exe_path, size)
        except Exception:
            png = None
        _cache[key] = png
        return png
