from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    openai_api_key: str
    target_phone: str
    log_level: str = "INFO"
    debounce_seconds: float = 0.5
    chat_db_path: Path = Path.home() / "Library" / "Messages" / "chat.db"
    findings_dir: Path = Path.home() / ".config" / "probe-bridge"

    @classmethod
    def from_env(cls) -> Config:
        load_dotenv()
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("Missing required env var: OPENAI_API_KEY")

        findings_dir_str = os.getenv("FINDINGS_DIR", "")
        findings_dir = Path(findings_dir_str) if findings_dir_str else Path.home() / ".config" / "probe-bridge"

        return cls(
            openai_api_key=os.environ["OPENAI_API_KEY"],
            target_phone=os.getenv("TARGET_PHONE", "+16504448053"),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            findings_dir=findings_dir,
        )
