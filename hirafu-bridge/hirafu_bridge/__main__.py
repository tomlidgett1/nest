"""Hirafu iMessage bridge — main entry point.

Runs three async tasks:
  1. Watcher: monitors chat.db for new messages from the target phone
  2. Outbound poller: delivers queued messages from edge functions
  3. Trigger checker: fires meeting preps, briefings, reminders
"""

from __future__ import annotations

import asyncio
import logging
import sys

from .config import load_config
from .state import BridgeState
from .watcher.fs_monitor import watch_chat_db
from .watcher.chat_db import fetch_new_messages, get_max_rowid
from .processor import MessageProcessor

logger = logging.getLogger("hirafu_bridge")


async def main() -> None:
    config = load_config()

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    logger.info("Starting Hirafu bridge")
    logger.info("  Target phone: %s", config.target_phone or "(multi-user)")
    logger.info("  Chat DB: %s", config.chat_db_path)
    logger.info("  Supabase: %s", config.supabase_url[:40])

    state = BridgeState.load(config.state_dir / "state.json")

    if state.last_rowid == 0:
        state.last_rowid = get_max_rowid(config.chat_db_path)
        state.save()
        logger.info("First run — skipping existing messages (rowid: %d)", state.last_rowid)

    processor = MessageProcessor(config)
    change_event = asyncio.Event()

    async def watcher_task():
        await watch_chat_db(config.chat_db_path, change_event)

    async def message_task():
        while True:
            await change_event.wait()
            change_event.clear()

            await asyncio.sleep(config.debounce_seconds)

            try:
                messages = fetch_new_messages(
                    config.chat_db_path,
                    config.target_phone,
                    state.last_rowid,
                )

                for msg in messages:
                    if msg.guid in state.processed_guids:
                        continue

                    logger.info("New message from %s: %s", msg.sender, msg.text[:80])

                    state.processed_guids.add(msg.guid)
                    state.last_rowid = max(state.last_rowid, msg.rowid)

                    await processor.process_message(msg.sender, msg.text)

                    state.save()

            except Exception:
                logger.exception("Error processing messages")

    async def outbound_task():
        while True:
            try:
                await processor.poll_outbound()
            except Exception:
                logger.exception("Outbound poll error")
            await asyncio.sleep(5.0)

    async def trigger_task():
        while True:
            try:
                await processor.check_triggers()
            except Exception:
                logger.exception("Trigger check error")
            await asyncio.sleep(60.0)

    try:
        await asyncio.gather(
            watcher_task(),
            message_task(),
            outbound_task(),
            trigger_task(),
        )
    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        await processor.close()
        state.save()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
