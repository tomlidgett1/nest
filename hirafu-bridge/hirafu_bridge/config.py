"""Configuration for the Hirafu iMessage bridge."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


@dataclass
class Config:
    supabase_url: str
    supabase_service_role_key: str
    target_phone: str | None = None
    log_level: str = "INFO"
    debounce_seconds: float = 0.5
    chat_db_path: Path = field(
        default_factory=lambda: Path.home() / "Library" / "Messages" / "chat.db"
    )
    state_dir: Path = field(
        default_factory=lambda: Path.home() / ".config" / "hirafu-bridge"
    )

    @property
    def hirafu_chat_service_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/hirafu-chat-service"

    @property
    def hirafu_onboard_chat_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/hirafu-onboard-chat"

    @property
    def hirafu_trigger_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/hirafu-trigger"

    @property
    def onboard_base_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/hirafu-onboard"


def load_config() -> Config:
    load_dotenv()
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    phone = os.environ.get("TARGET_PHONE", "")

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    return Config(
        supabase_url=url,
        supabase_service_role_key=key,
        target_phone=phone or None,
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
