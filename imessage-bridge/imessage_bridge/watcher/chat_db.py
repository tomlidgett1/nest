"""Read-only access to macOS iMessage database (chat.db)."""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("imessage_bridge.watcher.chat_db")

# Carrier / system notification patterns to skip at the DB level
_CARRIER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"your voicemail", re.IGNORECASE),
    re.compile(r"minutes remaining", re.IGNORECASE),
    re.compile(r"data usage", re.IGNORECASE),
    re.compile(r"account balance", re.IGNORECASE),
    re.compile(r"^You have \d+ new", re.IGNORECASE),
    re.compile(r"your plan has been", re.IGNORECASE),
    re.compile(r"reply STOP to", re.IGNORECASE),
    re.compile(r"service notification", re.IGNORECASE),
    re.compile(r"verification code", re.IGNORECASE),
    re.compile(r"^Your .+ code is", re.IGNORECASE),
]


def _is_carrier_notification(text: str) -> bool:
    """Return True if text matches known carrier/system notification patterns."""
    return any(p.search(text) for p in _CARRIER_PATTERNS)

# Apple Core Data epoch: 2001-01-01 00:00:00 UTC
_APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class IncomingMessage:
    rowid: int
    guid: str
    text: str
    sender: str
    timestamp: datetime


def apple_timestamp_to_datetime(nanoseconds: int) -> datetime:
    """Convert Apple Core Data timestamp (nanoseconds since 2001-01-01) to UTC datetime."""
    return _APPLE_EPOCH + timedelta(seconds=nanoseconds / 1_000_000_000)


def extract_text_from_attributed_body(blob: bytes) -> str | None:
    """Extract plain text from an NSAttributedString binary blob.

    When iMessage stores rich text (styled, reactions, etc.), the ``text``
    column is NULL and the content lives in ``attributedBody`` as a
    serialised ``NSMutableAttributedString``.  The plain-text payload sits
    between known byte markers that we scan for here.
    """
    if not blob:
        return None
    try:
        # The streamtyped blob contains the string after an NSString /
        # NSMutableString class marker.  We locate that marker then scan
        # forward past length-prefix bytes to the readable UTF-8 text.
        for marker in (b"NSString", b"NSMutableString"):
            idx = blob.find(marker)
            if idx != -1:
                break
        else:
            return None

        # Scan forward from the marker looking for the first printable run.
        search_from = idx + len(marker)
        for i in range(search_from, min(search_from + 120, len(blob))):
            b_val = blob[i]
            if b_val >= 0x20 and b_val < 0x7F:
                # Looks like the start of readable text.
                text_bytes = bytearray()
                for j in range(i, len(blob)):
                    v = blob[j]
                    if v == 0x00:
                        break
                    # Accept printable ASCII + common whitespace
                    if v >= 0x20 or v in (0x0A, 0x0D, 0x09):
                        text_bytes.append(v)
                    else:
                        # Non-printable byte — try UTF-8 multi-byte
                        if v >= 0x80:
                            text_bytes.append(v)
                        else:
                            break
                if len(text_bytes) > 1:
                    return text_bytes.decode("utf-8", errors="replace").strip()
        return None
    except Exception:
        logger.debug("Failed to extract attributedBody text", exc_info=True)
        return None


def get_max_rowid(chat_db_path: Path) -> int:
    """Return the current maximum ROWID in chat.db.

    Used on first startup to skip all historical messages and only
    process messages that arrive *after* the bridge starts.
    """
    uri = f"file:{chat_db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA query_only=ON")
        row = conn.execute("SELECT MAX(ROWID) FROM message").fetchone()
        max_id = row[0] if row and row[0] else 0
        logger.info("Current chat.db max ROWID: %d", max_id)
        return max_id
    finally:
        conn.close()


def fetch_new_messages(
    chat_db_path: Path,
    target_phone: str | None,
    last_rowid: int,
) -> list[IncomingMessage]:
    """Query chat.db for new incoming messages.

    If *target_phone* is provided, only fetch from that number.
    If None, fetch from ALL senders (multi-user mode).

    Opens the database in **read-only** WAL mode so we never conflict with
    Messages.app which holds the write lock.
    """
    uri = f"file:{chat_db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA query_only=ON")

        if target_phone:
            cursor = conn.execute(
                """
                SELECT m.ROWID,
                       m.guid,
                       m.text,
                       m.attributedBody,
                       m.date,
                       h.id AS sender
                FROM message m
                JOIN handle h ON m.handle_id = h.ROWID
                WHERE h.id = ?
                  AND m.is_from_me = 0
                  AND m.ROWID > ?
                ORDER BY m.ROWID ASC
                """,
                (target_phone, last_rowid),
            )
        else:
            cursor = conn.execute(
                """
                SELECT m.ROWID,
                       m.guid,
                       m.text,
                       m.attributedBody,
                       m.date,
                       h.id AS sender
                FROM message m
                JOIN handle h ON m.handle_id = h.ROWID
                WHERE m.is_from_me = 0
                  AND m.ROWID > ?
                ORDER BY m.ROWID ASC
                """,
                (last_rowid,),
            )

        messages: list[IncomingMessage] = []
        for rowid, guid, text, attributed_body, date_ns, sender in cursor.fetchall():
            # Prefer text column; fall back to attributedBody for rich messages
            msg_text = text
            if not msg_text and attributed_body:
                msg_text = extract_text_from_attributed_body(attributed_body)

            if not msg_text or not msg_text.strip():
                continue  # Skip empty messages (tapbacks, reactions, read receipts)

            cleaned = msg_text.strip()
            # Skip single-character messages and reaction artifacts
            if len(cleaned) <= 1:
                continue
            # Skip messages that are just punctuation/symbols (tapback artifacts)
            if all(c in "+\u200d\u200b\u00a0!?.,;:-_=/" for c in cleaned):
                continue
            # Skip carrier/system notifications (OTP codes, data alerts, etc.)
            if _is_carrier_notification(cleaned):
                logger.debug("Skipping carrier notification: %s", cleaned[:60])
                continue

            messages.append(
                IncomingMessage(
                    rowid=rowid,
                    guid=guid,
                    text=msg_text.strip(),
                    sender=sender,
                    timestamp=apple_timestamp_to_datetime(date_ns),
                )
            )

        logger.debug(
            "Fetched %d new messages (ROWID > %d)", len(messages), last_rowid
        )
        return messages
    finally:
        conn.close()
