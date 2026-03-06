"""Read-only access to macOS iMessage database (chat.db), filtered to a single target phone."""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("probe_bridge.watcher.chat_db")

_APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class IncomingMessage:
    rowid: int
    guid: str
    text: str
    sender: str
    timestamp: datetime


def apple_timestamp_to_datetime(nanoseconds: int) -> datetime:
    return _APPLE_EPOCH + timedelta(seconds=nanoseconds / 1_000_000_000)


def extract_text_from_attributed_body(blob: bytes) -> str | None:
    if not blob:
        return None
    try:
        for marker in (b"NSString", b"NSMutableString"):
            idx = blob.find(marker)
            if idx != -1:
                break
        else:
            return None

        search_from = idx + len(marker)
        for i in range(search_from, min(search_from + 120, len(blob))):
            b_val = blob[i]
            if b_val >= 0x20 and b_val < 0x7F:
                text_bytes = bytearray()
                for j in range(i, len(blob)):
                    v = blob[j]
                    if v == 0x00:
                        break
                    if v >= 0x20 or v in (0x0A, 0x0D, 0x09):
                        text_bytes.append(v)
                    elif v >= 0x80:
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
    target_phone: str,
    last_rowid: int,
) -> list[IncomingMessage]:
    """Query chat.db for new incoming messages from the target phone only."""
    uri = f"file:{chat_db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA query_only=ON")

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
              AND h.id = ?
            ORDER BY m.ROWID ASC
            """,
            (last_rowid, target_phone),
        )

        messages: list[IncomingMessage] = []
        for rowid, guid, text, attributed_body, date_ns, sender in cursor.fetchall():
            msg_text = text
            if not msg_text and attributed_body:
                msg_text = extract_text_from_attributed_body(attributed_body)

            if not msg_text or not msg_text.strip():
                continue

            cleaned = msg_text.strip()
            if len(cleaned) <= 1 and cleaned not in ("?",):
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
            "Fetched %d new messages from %s (ROWID > %d)",
            len(messages), target_phone, last_rowid,
        )
        return messages
    finally:
        conn.close()
