"""Send iMessages via macOS osascript / AppleScript."""

from __future__ import annotations

import asyncio
import logging
import random
import re

logger = logging.getLogger("imessage_bridge.sender.imessage")

MAX_MESSAGE_LENGTH = 2000
MAX_RETRIES = 3
RETRY_DELAY = 2.0
OSASCRIPT_TIMEOUT = 15.0  # seconds — kill if Messages.app hangs

# Delay range (seconds) between conversational messages to feel human
MIN_INTER_MSG_DELAY = 1.8
MAX_INTER_MSG_DELAY = 2.5


_BOLD_UPPER = {chr(c): chr(0x1D5D4 + (c - ord("A"))) for c in range(ord("A"), ord("Z") + 1)}
_BOLD_LOWER = {chr(c): chr(0x1D5EE + (c - ord("a"))) for c in range(ord("a"), ord("z") + 1)}
_BOLD_DIGIT = {chr(c): chr(0x1D7EC + (c - ord("0"))) for c in range(ord("0"), ord("9") + 1)}
_BOLD_MAP = {**_BOLD_UPPER, **_BOLD_LOWER, **_BOLD_DIGIT}


def _to_unicode_bold(text: str) -> str:
    """Convert ASCII text to Unicode Mathematical Sans-Serif Bold glyphs."""
    return "".join(_BOLD_MAP.get(c, c) for c in text)


def _apply_bold(match: re.Match) -> str:
    return _to_unicode_bold(match.group(1))


def strip_markdown(text: str) -> str:
    """Convert markdown to iMessage-friendly text with Unicode bold.

    Preserves <nest-content> tags for the splitter to handle.
    """
    text = re.sub(r"\*\*(.+?)\*\*", _apply_bold, text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"^#{1,4}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^- ", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    return text.strip()


# We always split on newlines now - the LLM deliberately uses newlines
# to create separate conversational bubbles.
_SINGLE_MESSAGE_THRESHOLD = 0


_SEPARATOR_RE = re.compile(r"\s*---\s*")

_NEST_CONTENT_RE = re.compile(
    r"<nest-content>(.*?)</nest-content>", re.DOTALL
)


def _strip_separators(text: str) -> str:
    """Remove any --- markers (inline or on their own line) and split into parts."""
    return _SEPARATOR_RE.sub("\n\n", text).strip()


def _split_conversational(text: str) -> list[str]:
    """Split a response into conversational iMessage chunks.

    <nest-content> blocks are sent as single messages (never split).
    Raw text outside those blocks is split by newlines / --- markers.
    """
    # Extract <nest-content> blocks and interleave with raw text
    segments: list[tuple[str, bool]] = []  # (text, is_block)
    last_end = 0
    for m in _NEST_CONTENT_RE.finditer(text):
        before = text[last_end:m.start()].strip()
        if before:
            segments.append((before, False))
        segments.append((m.group(1).strip(), True))
        last_end = m.end()
    trailing = text[last_end:].strip()
    if trailing:
        segments.append((trailing, False))

    if not segments:
        segments = [(text, False)]

    chunks: list[str] = []
    for segment_text, is_block in segments:
        if is_block:
            if len(segment_text) <= MAX_MESSAGE_LENGTH:
                chunks.append(segment_text)
            else:
                chunks.extend(_split_by_paragraphs(segment_text))
            continue

        has_separator = "---" in segment_text
        if has_separator:
            parts = re.split(
                r"\n---\n|\n---$|^---\n|\s+---\s+|\s+---$|^---\s+",
                segment_text,
            )
        else:
            parts = segment_text.split("\n") if "\n" in segment_text else [segment_text]

        for part in parts:
            part = part.strip()
            if not part:
                continue
            if len(part) <= MAX_MESSAGE_LENGTH:
                chunks.append(part)
            else:
                chunks.extend(_split_by_paragraphs(part))

    if not chunks:
        return [text.strip()[:MAX_MESSAGE_LENGTH]]

    return chunks


def _split_by_paragraphs(text: str) -> list[str]:
    """Split a long text at paragraph boundaries."""
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


def _escape_applescript(text: str) -> str:
    """Escape a string for embedding in an AppleScript double-quoted literal."""
    return text.replace("\\", "\\\\").replace('"', '\\"')


async def send_imessage(phone: str, text: str) -> bool:
    """Send *text* as one or more iMessages to *phone*.  Returns True on success."""
    clean = strip_markdown(text)
    if not clean:
        logger.warning("Empty message after markdown stripping, skipping")
        return False

    chunks = _split_conversational(clean)
    logger.info(
        "Sending %d message(s) to %s (total %d chars)",
        len(chunks), phone, len(clean),
    )

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
                    "osascript attempt %d/%d timed out after %.0fs — killing process",
                    attempt, MAX_RETRIES, OSASCRIPT_TIMEOUT,
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
                attempt,
                MAX_RETRIES,
                proc.returncode,
                stderr.decode().strip(),
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY)

        if not success:
            logger.error(
                "Failed to send chunk %d/%d after %d retries",
                i + 1, len(chunks), MAX_RETRIES,
            )
            return False

        # Natural-feeling delay between conversational messages
        if len(chunks) > 1 and i < len(chunks) - 1:
            delay = random.uniform(MIN_INTER_MSG_DELAY, MAX_INTER_MSG_DELAY)
            await asyncio.sleep(delay)

    logger.info("Sent %d iMessage(s) to %s", len(chunks), phone)
    return True
