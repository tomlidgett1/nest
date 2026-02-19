"""iMessage ↔ V2 Agent Bridge.

Standalone daemon that bridges iMessage with the Nest V2 agent system:

  Process 1 (Watcher): FSEvents on chat.db → detect new messages → call agent → send reply
  Process 2 (Listener): Supabase Realtime on v2_chat_messages → send trigger/system messages

Usage:
    python -m imessage_bridge
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from .config import Config
from .sender.listener import RealtimeListener
from .sender.outbound_poller import OutboundPoller
from .state import BridgeState
from .watcher.chat_db import get_max_rowid
from .watcher.fs_monitor import start_watcher
from .watcher.processor import MessageProcessor
from .watcher.trigger_checker import TriggerChecker

logger = logging.getLogger("imessage_bridge")


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


async def _run() -> None:
    config = Config.from_env()
    _setup_logging(config.log_level)

    state = BridgeState.load(config.state_dir)

    logger.info("=" * 60)
    logger.info("iMessage Bridge starting")
    logger.info("  Multi-user   : %s", config.multi_user)
    logger.info("  Supabase URL : %s", config.supabase_url)
    logger.info("  Last ROWID   : %d", state.last_rowid)
    logger.info("  chat.db      : %s", config.chat_db_path)
    logger.info("=" * 60)

    # Verify chat.db is accessible
    if not config.chat_db_path.exists():
        logger.error("chat.db not found at %s", config.chat_db_path)
        logger.error("Ensure Full Disk Access is granted to this process.")
        sys.exit(1)

    # On first run (last_rowid == 0), skip ALL historical messages.
    # Only process messages that arrive AFTER the bridge starts.
    if state.last_rowid == 0:
        current_max = get_max_rowid(config.chat_db_path)
        state.last_rowid = current_max
        state.save()
        logger.info(
            "First run detected — skipping historical messages (set last_rowid=%d)",
            current_max,
        )

    # Watcher: FSEvents + poll on chat.db → detect new messages → call agent → reply
    processor = MessageProcessor(config, state)
    watcher_task = asyncio.create_task(
        start_watcher(
            messages_dir=config.chat_db_path.parent,
            callback=processor.on_chat_db_changed,
            debounce_seconds=config.debounce_seconds,
        ),
        name="watcher",
    )

    # Trigger checker: polls v2-trigger every 60s for upcoming meeting preps
    trigger_checker = TriggerChecker(config)
    trigger_task = asyncio.create_task(
        trigger_checker.run(),
        name="trigger_checker",
    )

    # Outbound poller: delivers queued iMessages from edge functions
    outbound_poller = OutboundPoller(config)
    outbound_task = asyncio.create_task(
        outbound_poller.run(),
        name="outbound_poller",
    )

    # Graceful shutdown
    shutdown_event = asyncio.Event()

    def _signal_handler() -> None:
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _signal_handler)

    # Wait for shutdown or task failure
    done, pending = await asyncio.wait(
        [watcher_task, trigger_task, outbound_task, asyncio.create_task(shutdown_event.wait())],
        return_when=asyncio.FIRST_COMPLETED,
    )

    # Check for unexpected failures
    for task in done:
        if task.get_name() in ("watcher", "trigger_checker", "outbound_poller") and task.exception():
            logger.error("%s failed: %s", task.get_name(), task.exception())

    # Cleanup
    logger.info("Shutting down...")
    state.save()
    await processor.close()
    await trigger_checker.close()
    await outbound_poller.close()

    for task in pending:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    logger.info("Goodbye")


def main() -> None:
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
