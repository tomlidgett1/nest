from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("probe_bridge.state")

STATE_FILENAME = "state.json"
MAX_PROCESSED_GUIDS = 500


@dataclass
class BridgeState:
    last_rowid: int = 0
    processed_guids: set[str] = field(default_factory=set)
    _state_path: Path = field(default=Path.home() / ".config" / "probe-bridge" / STATE_FILENAME, repr=False)

    def save(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "last_rowid": self.last_rowid,
            "processed_guids": list(self.processed_guids)[-MAX_PROCESSED_GUIDS:],
        }
        tmp = self._state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._state_path)
        logger.debug("State saved (last_rowid=%d)", self.last_rowid)

    @classmethod
    def load(cls, state_dir: Path) -> BridgeState:
        path = state_dir / STATE_FILENAME
        if path.exists():
            try:
                data = json.loads(path.read_text())
                state = cls(
                    last_rowid=data.get("last_rowid", 0),
                    processed_guids=set(data.get("processed_guids", [])),
                    _state_path=path,
                )
                logger.info(
                    "Loaded state: last_rowid=%d, %d processed",
                    state.last_rowid,
                    len(state.processed_guids),
                )
                return state
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Corrupt state file, starting fresh: %s", exc)
        return cls(_state_path=path)
