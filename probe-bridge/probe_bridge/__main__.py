"""Probe Bridge — reverse-engineer a chatbot's system prompt via iMessage.

Standalone daemon that watches chat.db for messages from a target phone number,
uses an LLM agent to craft probing questions, sends replies via iMessage, and
maintains a centralised findings file.

Usage:
    python -m probe_bridge
"""

from __future__ import annotations

import asyncio
import logging
import random
import signal
import sys
import time

from .config import Config
from .findings import Findings
from .sender.imessage import send_imessage
from .state import BridgeState
from .watcher.chat_db import IncomingMessage, fetch_new_messages, get_max_rowid
from .watcher.fs_monitor import start_watcher
from .agent.detective import PromptDetective

logger = logging.getLogger("probe_bridge")

# Wait this long after the last received message before processing,
# so multi-bubble bot responses are collected as a single turn.
_QUIET_PERIOD = 3.5


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


class ProbeProcessor:
    """Processes incoming messages from the target bot and generates probing replies."""

    def __init__(self, config: Config, state: BridgeState, findings: Findings) -> None:
        self.config = config
        self.state = state
        self.findings = findings
        self.detective = PromptDetective(config.openai_api_key)
        self._processing = False
        self._pending_messages: list[IncomingMessage] = []
        self._last_message_time: float = 0.0

    async def on_chat_db_changed(self) -> None:
        if self._processing:
            logger.debug("Already processing, skipping")
            return

        messages = fetch_new_messages(
            chat_db_path=self.config.chat_db_path,
            target_phone=self.config.target_phone,
            last_rowid=self.state.last_rowid,
        )

        new_messages = [
            m for m in messages
            if m.guid not in self.state.processed_guids
        ]

        if not new_messages:
            return

        for msg in new_messages:
            logger.info(
                "Buffered message [ROWID %d] from %s: %s",
                msg.rowid, msg.sender, msg.text[:120],
            )
            self._pending_messages.append(msg)
            self._last_message_time = time.monotonic()
            self.state.last_rowid = max(self.state.last_rowid, msg.rowid)
            self.state.processed_guids.add(msg.guid)

        # Wait for quiet period -- more messages may still be arriving
        while True:
            elapsed_since_last = time.monotonic() - self._last_message_time
            remaining = _QUIET_PERIOD - elapsed_since_last
            if remaining <= 0:
                break
            logger.info("Waiting %.1fs for more messages (quiet period)", remaining)
            await asyncio.sleep(remaining)

            # Check for any new messages that arrived during the wait
            more = fetch_new_messages(
                chat_db_path=self.config.chat_db_path,
                target_phone=self.config.target_phone,
                last_rowid=self.state.last_rowid,
            )
            fresh = [m for m in more if m.guid not in self.state.processed_guids]
            if fresh:
                for msg in fresh:
                    logger.info(
                        "Additional message [ROWID %d]: %s",
                        msg.rowid, msg.text[:120],
                    )
                    self._pending_messages.append(msg)
                    self._last_message_time = time.monotonic()
                    self.state.last_rowid = max(self.state.last_rowid, msg.rowid)
                    self.state.processed_guids.add(msg.guid)

        # All messages collected — process as a single bot turn
        batch = list(self._pending_messages)
        self._pending_messages.clear()

        if not batch:
            return

        self._processing = True
        try:
            bubbles = [m.text for m in batch]
            bubble_timestamps = [m.timestamp.isoformat() if m.timestamp else None for m in batch]
            logger.info(
                "Processing %d bubble(s) as single turn (%d chars total)",
                len(bubbles), sum(len(b) for b in bubbles),
            )
            await self._process_bot_turn(bubbles, bubble_timestamps)
            self.state.save()
        except Exception:
            logger.exception("Failed to process bot turn")
        finally:
            self._processing = False

    # Full analysis every N bot turns; lightweight reply-only in between
    _ANALYSIS_INTERVAL = 10

    async def _process_bot_turn(self, bubbles: list[str], bubble_timestamps: list[str | None]) -> None:
        t0 = time.monotonic()

        conversation = self.findings.get_conversation_for_prompt()
        bot_turn_count = self.findings.bot_metrics.get("total_bot_turns", 0) + 1
        do_full_analysis = (bot_turn_count % self._ANALYSIS_INTERVAL == 0) or bot_turn_count <= 2

        # Format bubbles so the agent can see the multi-message structure
        if len(bubbles) == 1:
            bot_text_for_agent = bubbles[0]
        else:
            bot_text_for_agent = "\n".join(
                f"[bubble {i+1}/{len(bubbles)}]: {b}" for i, b in enumerate(bubbles)
            )

        if do_full_analysis:
            logger.info(">>> FULL ANALYSIS (turn %d) <<<", bot_turn_count)
            result = await self.detective.analyse_and_reply(
                conversation=conversation,
                current_analysis=self.findings.analysis,
                strategy_notes=self.findings.strategy_notes,
                latest_bot_message=bot_text_for_agent,
                bubble_count=len(bubbles),
                bot_metrics_summary=self.findings.get_bot_metrics_summary(),
                topics_explored=self.findings.get_topics_explored(),
            )
        else:
            logger.info(">>> REPLY-ONLY (turn %d, next analysis at %d) <<<",
                        bot_turn_count,
                        ((bot_turn_count // self._ANALYSIS_INTERVAL) + 1) * self._ANALYSIS_INTERVAL)
            result = await self.detective.reply_only(
                conversation=conversation,
                strategy_notes=self.findings.strategy_notes,
                latest_bot_message=bot_text_for_agent,
                topics_explored=self.findings.get_topics_explored(),
            )

        reply = result["reply"]
        analysis = result.get("analysis", "") or self.findings.analysis
        strategy = result["strategy_notes"]

        elapsed = time.monotonic() - t0
        mode = "FULL" if do_full_analysis else "LITE"
        logger.info("[%s] Agent replied in %.1fs: %s", mode, elapsed, reply[:120])
        logger.info("Strategy: %s", strategy[:200])

        self.findings.add_exchange(
            bot_message="\n".join(bubbles),
            our_reply=reply,
            analysis=analysis,
            strategy_notes=strategy,
            phase=result.get("phase", str(self.findings.current_phase)),
            confidence=result.get("confidence", str(self.findings.confidence)),
            bubble_count=len(bubbles),
            bubble_texts=bubbles,
        )
        self.findings.save()

        delay = random.uniform(2.0, 5.0)
        logger.info("Waiting %.1fs before replying (human-like delay)", delay)
        await asyncio.sleep(delay)

        sent = await send_imessage(self.config.target_phone, reply)
        if sent:
            logger.info("Reply sent to %s", self.config.target_phone)
        else:
            logger.error("Failed to send reply to %s", self.config.target_phone)

    async def send_opening_message(self) -> None:
        """Send the first probing message to start the conversation."""
        if self.findings.conversation_history:
            logger.info("Conversation already in progress (%d messages), skipping opener",
                        len(self.findings.conversation_history))
            return

        logger.info("No conversation history — sending opening message")
        result = await self.detective.generate_opening()

        reply = result["reply"]
        analysis = result["analysis"]
        strategy = result["strategy_notes"]

        logger.info("Opening message: %s", reply)

        sent = await send_imessage(self.config.target_phone, reply)
        if sent:
            self.findings.add_outbound(reply)
            self.findings.analysis = analysis
            self.findings.strategy_notes = strategy
            self.findings.save()
            logger.info("Opening message sent to %s", self.config.target_phone)
        else:
            logger.error("Failed to send opening message")

    async def close(self) -> None:
        await self.detective.close()


async def _run() -> None:
    config = Config.from_env()
    _setup_logging(config.log_level)

    state = BridgeState.load(config.findings_dir)
    findings = Findings.load(config.findings_dir)

    logger.info("=" * 60)
    logger.info("Probe Bridge starting")
    logger.info("  Target phone : %s", config.target_phone)
    logger.info("  Findings dir : %s", config.findings_dir)
    logger.info("  Last ROWID   : %d", state.last_rowid)
    logger.info("  Messages so far: %d", len(findings.conversation_history))
    logger.info("  chat.db      : %s", config.chat_db_path)
    logger.info("=" * 60)

    if not config.chat_db_path.exists():
        logger.error("chat.db not found at %s", config.chat_db_path)
        logger.error("Ensure Full Disk Access is granted to this process.")
        sys.exit(1)

    if state.last_rowid == 0:
        current_max = get_max_rowid(config.chat_db_path)
        state.last_rowid = current_max
        state.save()
        logger.info(
            "First run — skipping historical messages (set last_rowid=%d)",
            current_max,
        )

    processor = ProbeProcessor(config, state, findings)

    await processor.send_opening_message()

    watcher_task = asyncio.create_task(
        start_watcher(
            messages_dir=config.chat_db_path.parent,
            callback=processor.on_chat_db_changed,
            debounce_seconds=config.debounce_seconds,
        ),
        name="watcher",
    )

    shutdown_event = asyncio.Event()

    def _signal_handler() -> None:
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _signal_handler)

    done, pending = await asyncio.wait(
        [watcher_task, asyncio.create_task(shutdown_event.wait())],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for task in done:
        if task.get_name() == "watcher" and task.exception():
            logger.error("Watcher failed: %s", task.exception())

    logger.info("Shutting down...")
    state.save()
    findings.save()
    await processor.close()

    for task in pending:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    logger.info("Goodbye — findings saved to %s", config.findings_dir / "findings.json")


def main() -> None:
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
