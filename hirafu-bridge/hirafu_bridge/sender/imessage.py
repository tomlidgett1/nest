"""Send iMessages via macOS AppleScript for Hirafu."""

from __future__ import annotations

import asyncio
import logging
import random
import re

logger = logging.getLogger("hirafu_bridge.sender.imessage")

MAX_MESSAGE_LENGTH = 2000
MAX_RETRIES = 3
RETRY_DELAY = 2.0
OSASCRIPT_TIMEOUT = 15.0

MIN_INTER_MSG_DELAY = 2.5
MAX_INTER_MSG_DELAY = 3.5

_BOLD_UPPER = {chr(c): chr(0x1D5D4 + (c - ord("A"))) for c in range(ord("A"), ord("Z") + 1)}
_BOLD_LOWER = {chr(c): chr(0x1D5EE + (c - ord("a"))) for c in range(ord("a"), ord("z") + 1)}
_BOLD_DIGIT = {chr(c): chr(0x1D7EC + (c - ord("0"))) for c in range(ord("0"), ord("9") + 1)}
_BOLD_MAP = {**_BOLD_UPPER, **_BOLD_LOWER, **_BOLD_DIGIT}


def _to_unicode_bold(text: str) -> str:
    return "".join(_BOLD_MAP.get(c, c) for c in text)


def strip_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", lambda m: _to_unicode_bold(m.group(1)), text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"^#{1,4}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^- ", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return text.strip()


_SEPARATOR_RE = re.compile(r"\s*---\s*")


def _split_conversational(text: str) -> list[str]:
    has_separator = "---" in text
    if has_separator:
        parts = re.split(r"\n---\n|\n---$|^---\n|\s+---\s+|\s+---$|^---\s+", text)
    else:
        parts = text.split("\n") if "\n" in text else [text]

    chunks: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) <= MAX_MESSAGE_LENGTH:
            chunks.append(part)
        else:
            for para in part.split("\n\n"):
                para = para.strip()
                if para:
                    chunks.append(para[:MAX_MESSAGE_LENGTH])

    return chunks or [text.strip()[:MAX_MESSAGE_LENGTH]]


def _escape_applescript(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


async def send_imessage(phone: str, text: str) -> bool:
    clean = strip_markdown(text)
    if not clean:
        logger.warning("Empty message after stripping, skipping")
        return False

    chunks = _split_conversational(clean)
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
                logger.warning("osascript attempt %d/%d timed out", attempt, MAX_RETRIES)
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
                attempt, MAX_RETRIES, proc.returncode, stderr.decode().strip(),
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY)

        if not success:
            logger.error("Failed to send chunk %d/%d after %d retries", i + 1, len(chunks), MAX_RETRIES)
            return False

        if len(chunks) > 1 and i < len(chunks) - 1:
            word_count = len(chunk.split())
            if word_count > 18:
                delay = max(4.0, random.uniform(4.0, 4.8))
            else:
                delay = random.uniform(MIN_INTER_MSG_DELAY, MAX_INTER_MSG_DELAY)
            await asyncio.sleep(delay)

    logger.info("Sent %d iMessage(s) to %s", len(chunks), phone)
    return True
