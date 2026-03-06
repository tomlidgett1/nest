"""Watch chat.db for changes using FSEvents (macOS) with polling fallback."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger("hirafu_bridge.watcher.fs_monitor")


class _ChatDBHandler(FileSystemEventHandler):
    def __init__(self, event: asyncio.Event, loop: asyncio.AbstractEventLoop):
        self._event = event
        self._loop = loop

    def on_modified(self, event):
        if not event.is_directory:
            self._loop.call_soon_threadsafe(self._event.set)


async def watch_chat_db(
    chat_db_path: Path,
    change_event: asyncio.Event,
    poll_interval: float = 2.0,
) -> None:
    """Watch the Messages directory for changes. Sets change_event on modification."""
    loop = asyncio.get_running_loop()
    watch_dir = str(chat_db_path.parent)

    handler = _ChatDBHandler(change_event, loop)
    observer = Observer()
    observer.schedule(handler, watch_dir, recursive=False)

    try:
        observer.start()
        logger.info("FSEvents watcher started on %s", watch_dir)

        while True:
            await asyncio.sleep(poll_interval)
            change_event.set()
    except Exception:
        logger.exception("Watcher error")
    finally:
        observer.stop()
        observer.join()
