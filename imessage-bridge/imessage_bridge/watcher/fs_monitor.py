"""FSEvents-based watcher + polling fallback for chat.db changes."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Callable, Coroutine

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger("imessage_bridge.watcher.fs_monitor")

# Polling interval in seconds — safety net when FSEvents misses events
_POLL_INTERVAL = 3.0


class _ChatDBHandler(FileSystemEventHandler):
    """Debounced handler that signals the main loop when chat.db changes.

    Instead of invoking the callback directly, this sets an asyncio Event
    so the single poll loop processes all changes through one code path.
    This prevents FSEvents and the poll from invoking the callback concurrently.
    """

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
    """Return the latest mtime across chat.db, chat.db-wal, chat.db-shm."""
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
    """Watch for chat.db changes via FSEvents + polling, invoke callback.

    Both FSEvents and the poll signal a single asyncio Event. The main loop
    waits on either the event or the poll timer, ensuring the callback is
    invoked sequentially — never concurrently.
    """
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
            # Wait for FSEvents signal OR poll timeout — whichever comes first
            try:
                await asyncio.wait_for(change_event.wait(), timeout=_POLL_INTERVAL)
                change_event.clear()
                logger.debug("FSEvents triggered callback")
            except asyncio.TimeoutError:
                # Poll: check mtime
                current_mtime = _get_db_mtime(messages_dir)
                if current_mtime <= last_mtime:
                    continue
                last_mtime = current_mtime
                logger.debug("Poll detected chat.db change")

            # Run the callback — only one invocation at a time
            await callback()

            # Update mtime after callback (sent messages may have changed WAL)
            last_mtime = _get_db_mtime(messages_dir)
    finally:
        observer.stop()
        observer.join(timeout=5)
        logger.info("Watcher stopped")
