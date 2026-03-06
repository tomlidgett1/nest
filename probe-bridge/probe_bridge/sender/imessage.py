"""Send iMessages via macOS osascript / AppleScript."""

from __future__ import annotations

import asyncio
import logging
import random
import re

logger = logging.getLogger("probe_bridge.sender.imessage")

MAX_MESSAGE_LENGTH = 2000
MAX_RETRIES = 3
RETRY_DELAY = 2.0
OSASCRIPT_TIMEOUT = 15.0

MIN_INTER_MSG_DELAY = 4.0
MAX_INTER_MSG_DELAY = 8.0


def _escape_applescript(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def strip_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"^#{1,4}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^- ", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return text.strip()


def _split_message(text: str) -> list[str]:
    """Split long text into chunks at paragraph or newline boundaries."""
    if len(text) <= MAX_MESSAGE_LENGTH:
        return [text]

    chunks: list[str] = []
    current = ""
    for paragraph in text.split("\n\n"):
        if current and len(current) + len(paragraph) + 2 > MAX_MESSAGE_LENGTH:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current.strip():
        chunks.append(current.strip())
    return chunks or [text[:MAX_MESSAGE_LENGTH]]


async def send_imessage(phone: str, text: str) -> bool:
    """Send text as one or more iMessages to the given phone number."""
    clean = strip_markdown(text)
    if not clean:
        logger.warning("Empty message after stripping, skipping")
        return False

    chunks = _split_message(clean)
    logger.info("Sending %d message(s) to %s (%d chars)", len(chunks), phone, len(clean))

    for i, chunk in enumerate(chunks):
        escaped = _escape_applescript(chunk)
        script = (
            f'tell application "Messages" to send "{escaped}" '
            f'to buddy "{phone}" of '
            f"(1st account whose service type = iMessage)"
        )

        success = False
        for attempt in range(1, MAX_RETRIES + 1):
            proc = await asyncio.create_subprocess_exec(
                "osascript", "-e", script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=OSASCRIPT_TIMEOUT,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "osascript attempt %d/%d timed out — killing",
                    attempt, MAX_RETRIES,
                )
                proc.kill()
                await proc.wait()
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_DELAY)
                continue

            if proc.returncode == 0:
                success = True
                break

            logger.warning(
                "osascript attempt %d/%d failed (rc=%d): %s",
                attempt, MAX_RETRIES, proc.returncode,
                stderr.decode().strip(),
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY)

        if not success:
            logger.error("Failed to send chunk %d/%d after %d retries", i + 1, len(chunks), MAX_RETRIES)
            return False

        if len(chunks) > 1 and i < len(chunks) - 1:
            delay = random.uniform(MIN_INTER_MSG_DELAY, MAX_INTER_MSG_DELAY)
            await asyncio.sleep(delay)

    logger.info("Sent %d iMessage(s) to %s", len(chunks), phone)
    return True
