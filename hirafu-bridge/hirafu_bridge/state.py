"""Persistent bridge state for deduplication and crash recovery."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("hirafu_bridge.state")


@dataclass
class BridgeState:
    last_rowid: int = 0
    processed_guids: set[str] = field(default_factory=set)
    sent_message_ids: set[str] = field(default_factory=set)

    _path: Path | None = field(default=None, repr=False)

    def save(self) -> None:
        if not self._path:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "last_rowid": self.last_rowid,
            "processed_guids": list(self.processed_guids)[-500:],
            "sent_message_ids": list(self.sent_message_ids)[-200:],
        }
        self._path.write_text(json.dumps(data, indent=2))

    @classmethod
    def load(cls, path: Path) -> BridgeState:
        if path.exists():
            try:
                data = json.loads(path.read_text())
                state = cls(
                    last_rowid=data.get("last_rowid", 0),
                    processed_guids=set(data.get("processed_guids", [])),
                    sent_message_ids=set(data.get("sent_message_ids", [])),
                    _path=path,
                )
                logger.info("Loaded state: last_rowid=%d, %d guids", state.last_rowid, len(state.processed_guids))
                return state
            except Exception as e:
                logger.warning("Failed to load state: %s", e)

        state = cls(_path=path)
        logger.info("Starting with fresh state")
        return state
