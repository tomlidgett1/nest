from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("imessage_bridge.state")

DEFAULT_STATE_DIR = Path.home() / ".config" / "imessage-bridge"
STATE_FILENAME = "state.json"

# Cap set sizes to prevent unbounded growth
MAX_PROCESSED_GUIDS = 500
MAX_SENT_IDS = 200


@dataclass
class BridgeState:
    last_rowid: int = 0
    processed_guids: set[str] = field(default_factory=set)
    sent_message_ids: set[str] = field(default_factory=set)
    _state_path: Path = field(default=DEFAULT_STATE_DIR / STATE_FILENAME, repr=False)

    def save(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "last_rowid": self.last_rowid,
            "processed_guids": list(self.processed_guids)[-MAX_PROCESSED_GUIDS:],
            "sent_message_ids": list(self.sent_message_ids)[-MAX_SENT_IDS:],
        }
        tmp = self._state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._state_path)
        logger.debug("State saved (last_rowid=%d)", self.last_rowid)

    @classmethod
    def load(cls, state_dir: Path = DEFAULT_STATE_DIR) -> BridgeState:
        path = state_dir / STATE_FILENAME
        if path.exists():
            try:
                data = json.loads(path.read_text())
                state = cls(
                    last_rowid=data.get("last_rowid", 0),
                    processed_guids=set(data.get("processed_guids", [])),
                    sent_message_ids=set(data.get("sent_message_ids", [])),
                    _state_path=path,
                )
                logger.info(
                    "Loaded state: last_rowid=%d, %d processed, %d sent",
                    state.last_rowid,
                    len(state.processed_guids),
                    len(state.sent_message_ids),
                )
                return state
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Corrupt state file, starting fresh: %s", exc)
        return cls(_state_path=path)
