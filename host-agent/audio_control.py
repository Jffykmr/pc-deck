import gc
import queue
import threading
import time
from concurrent.futures import Future
from ctypes import POINTER, cast

import comtypes
import pythoncom
from comtypes import CLSCTX_ALL
from pycaw.api.endpointvolume import IAudioEndpointVolume
from pycaw.api.mmdeviceapi import IMMDeviceEnumerator
from pycaw.constants import CLSID_MMDeviceEnumerator, EDataFlow, ERole

# All COM audio calls run on ONE long-lived thread that initializes COM once.
# The previous design did CoInitialize/CoUninitialize per request on uvicorn's
# recycled threadpool; comtypes keeps interface pointers alive past teardown and
# the resulting access violation killed pythonw silently (the crash loop in agent.log).
_jobs: "queue.Queue[tuple[callable, Future]]" = queue.Queue()


def _endpoint():
    enumerator = comtypes.CoCreateInstance(
        CLSID_MMDeviceEnumerator, IMMDeviceEnumerator, comtypes.CLSCTX_INPROC_SERVER
    )
    speaker = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender.value, ERole.eMultimedia.value)
    interface = speaker.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return cast(interface, POINTER(IAudioEndpointVolume))


def _worker():
    pythoncom.CoInitialize()
    cached, cached_at = None, 0.0
    while True:
        fn, fut = _jobs.get()
        result = error = None
        try:
            now = time.monotonic()
            if cached is None or now - cached_at > 15:
                # Refresh periodically: the default output changes when headphones
                # or another device are selected in Windows.
                cached = None
                gc.collect()
                cached, cached_at = _endpoint(), now
            result = fn(cached)
        except Exception as e:
            cached = None
            # Never hand the original exception to another thread: its traceback
            # keeps COM pointers alive, and releasing them elsewhere crashes.
            error = RuntimeError(f"audio: {e}")
            del e
        # Any COM garbage from this job must be collected on THIS thread. If the
        # cyclic GC runs it on another thread, Release() there is an access violation.
        gc.collect()
        if error is None:
            fut.set_result(result)
        else:
            fut.set_exception(error)


threading.Thread(target=_worker, name="audio-com", daemon=True).start()


def _call(fn, timeout: float = 3.0):
    fut: Future = Future()
    _jobs.put((fn, fut))
    return fut.result(timeout=timeout)


def _read(vol) -> dict:
    return {"level": round(vol.GetMasterVolumeLevelScalar() * 100), "muted": bool(vol.GetMute())}


def get_volume() -> dict:
    return _call(_read)


def set_volume(level: int) -> dict:
    level = max(0, min(100, level))

    def op(vol):
        vol.SetMasterVolumeLevelScalar(level / 100, None)
        if level > 0 and vol.GetMute():
            vol.SetMute(0, None)
        return _read(vol)

    return _call(op)


def set_mute(muted: bool | None) -> dict:
    def op(vol):
        target = (not vol.GetMute()) if muted is None else muted
        vol.SetMute(1 if target else 0, None)
        return _read(vol)

    return _call(op)
