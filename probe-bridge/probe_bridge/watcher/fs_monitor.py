"""FSEvents-based watcher + polling fallback for chat.db changes."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Callable, Coroutine

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger("probe_bridge.watcher.fs_monitor")

_POLL_INTERVAL = 3.0


class _ChatDBHandler(FileSystemEventHandler):
    """Debounced handler that signals the main loop when chat.db changes."""

    def __init__(
        self,
        event: asyncio.Event,
        loop: asyncio.AbstractEventLoop,
        debounce_seconds: float = 0.5,
    ) -> None:
        self._event = event
        self._loop = loop
        self._debounce_seconds = debounce_seconds
        self._pending_handle: asyncio.TimerHandle | None = None

    def on_modified(self, event: FileSystemEvent) -> None:
        src = str(event.src_path)
        if not (src.endswith("chat.db") or src.endswith("chat.db-wal")):
            return
        self._loop.call_soon_threadsafe(self._schedule)

    def _schedule(self) -> None:
        if self._pending_handle is not None:
            self._pending_handle.cancel()
        self._pending_handle = self._loop.call_later(
            self._debounce_seconds, self._fire
        )

    def _fire(self) -> None:
        self._pending_handle = None
        self._event.set()


def _get_db_mtime(messages_dir: Path) -> float:
    best = 0.0
    for name in ("chat.db", "chat.db-wal", "chat.db-shm"):
        try:
            mt = (messages_dir / name).stat().st_mtime
            if mt > best:
                best = mt
        except OSError:
            pass
    return best


async def start_watcher(
    messages_dir: Path,
    callback: Callable[[], Coroutine],
    debounce_seconds: float = 0.5,
) -> None:
    """Watch for chat.db changes via FSEvents + polling, invoke callback."""
    loop = asyncio.get_running_loop()
    change_event = asyncio.Event()

    handler = _ChatDBHandler(change_event, loop, debounce_seconds)
    observer = Observer()
    observer.schedule(handler, str(messages_dir), recursive=False)
    observer.daemon = True
    observer.start()
    logger.info(
        "Watching %s for chat.db changes (FSEvents + %gs poll)",
        messages_dir,
        _POLL_INTERVAL,
    )

    last_mtime = _get_db_mtime(messages_dir)

    try:
        while True:
            try:
                await asyncio.wait_for(change_event.wait(), timeout=_POLL_INTERVAL)
                change_event.clear()
                logger.debug("FSEvents triggered callback")
            except asyncio.TimeoutError:
                current_mtime = _get_db_mtime(messages_dir)
                if current_mtime <= last_mtime:
                    continue
                last_mtime = current_mtime
                logger.debug("Poll detected chat.db change")

            await callback()
            last_mtime = _get_db_mtime(messages_dir)
    finally:
        observer.stop()
        observer.join(timeout=5)
        logger.info("Watcher stopped")
