"""Low-res live preview of the whole desktop for the tablet.

Captures only while someone has asked for a frame in the last few seconds, at
about 1 fps, downscaled and JPEG-compressed once and shared by every client.
"""

import io
import threading
import time

from PIL import Image

TARGET_WIDTH = 880
_lock = threading.Lock()
_frame: bytes | None = None
_last_request = 0.0
_wake = threading.Event()


def _loop() -> None:
    global _frame
    import mss

    with mss.mss() as grabber:
        while True:
            if time.time() - _last_request > 5:
                _wake.clear()
                _wake.wait()
                continue
            try:
                shot = grabber.grab(grabber.monitors[0])
                img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                h = round(img.height * TARGET_WIDTH / img.width)
                img = img.resize((TARGET_WIDTH, h), Image.Resampling.BILINEAR)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=55, optimize=False)
                with _lock:
                    _frame = buf.getvalue()
            except Exception:
                time.sleep(2)
            time.sleep(1.9)


threading.Thread(target=_loop, name="screen-capture", daemon=True).start()


def latest_frame() -> bytes | None:
    global _last_request
    _last_request = time.time()
    _wake.set()
    with _lock:
        return _frame
