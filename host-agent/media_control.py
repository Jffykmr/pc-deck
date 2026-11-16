"""Now-playing info from Windows' global media session (Spotify, browsers, etc.).

WinRT is COM underneath, so everything runs on one dedicated thread with its own
event loop; the rest of the agent only reads snapshots or submits commands.
"""

import asyncio
import threading
import time
from datetime import timedelta

_lock = threading.Lock()
_state: dict | None = None
_art: bytes | None = None
_art_key: str | None = None
_loop: asyncio.AbstractEventLoop | None = None
_manager = None


def _seconds(value) -> float:
    if isinstance(value, timedelta):
        return value.total_seconds()
    try:
        return float(value) / 10_000_000  # 100 ns ticks
    except Exception:
        return 0.0


async def _read_thumbnail(ref) -> bytes | None:
    from winrt.windows.storage.streams import Buffer, DataReader, InputStreamOptions

    stream = await ref.open_read_async()
    size = int(stream.size)
    if size <= 0 or size > 8_000_000:
        return None
    buf = Buffer(size)
    await stream.read_async(buf, size, InputStreamOptions.READ_AHEAD)
    reader = DataReader.from_buffer(buf)
    data = bytearray(buf.length)
    reader.read_bytes(data)
    return bytes(data)


async def _poll_once() -> None:
    global _state, _art, _art_key
    session = _manager.get_current_session()
    if session is None:
        with _lock:
            _state = None
        return

    props = await session.try_get_media_properties_async()
    info = session.get_playback_info()
    timeline = session.get_timeline_properties()
    title = props.title or ""
    artist = props.artist or ""
    key = f"{session.source_app_user_model_id}|{title}|{artist}"

    if key != _art_key:
        art = None
        if props.thumbnail is not None:
            try:
                art = await _read_thumbnail(props.thumbnail)
            except Exception:
                art = None
        with _lock:
            _art, _art_key = art, key

    status = int(info.playback_status) if info is not None else 0
    duration = _seconds(timeline.end_time) - _seconds(timeline.start_time)
    position = _seconds(timeline.position)
    # Timeline is only refreshed by apps on state changes; extrapolate while playing.
    updated = getattr(timeline, "last_updated_time", None)
    if status == 4 and updated is not None:
        try:
            position += max(0.0, time.time() - updated.timestamp())
        except Exception:
            pass

    source = session.source_app_user_model_id or ""
    with _lock:
        _state = {
            "title": title,
            "artist": artist,
            "album": props.album_title or "",
            "source": source.split("!")[0].split("\\")[-1].replace(".exe", ""),
            "playing": status == 4,
            "position": round(min(position, duration) if duration > 0 else position, 1),
            "duration": round(max(duration, 0.0), 1),
            "art": key if _art else None,
        }


async def _main() -> None:
    global _manager
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager

    while _manager is None:
        try:
            _manager = await Manager.request_async()
        except Exception:
            await asyncio.sleep(5)
    while True:
        try:
            await _poll_once()
        except Exception:
            pass
        await asyncio.sleep(1.0)


def _thread() -> None:
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_until_complete(_main())


threading.Thread(target=_thread, name="media-winrt", daemon=True).start()


def snapshot() -> dict | None:
    with _lock:
        return dict(_state) if _state else None


def art() -> bytes | None:
    with _lock:
        return _art


async def _command(action: str) -> bool:
    session = _manager.get_current_session() if _manager else None
    if session is None:
        return False
    fn = {
        "playpause": session.try_toggle_play_pause_async,
        "next": session.try_skip_next_async,
        "prev": session.try_skip_previous_async,
    }[action]
    ok = bool(await fn())
    await asyncio.sleep(0.25)
    await _poll_once()
    return ok


def command(action: str) -> bool:
    """Returns False when no media session exists (caller can fall back to media keys)."""
    if _loop is None or _manager is None:
        return False
    return asyncio.run_coroutine_threadsafe(_command(action), _loop).result(timeout=4)
