from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_role_key: str
    target_phone: str
    user_id: str
    multi_user: bool = True
    log_level: str = "INFO"
    debounce_seconds: float = 0.5
    chat_db_path: Path = Path.home() / "Library" / "Messages" / "chat.db"
    state_dir: Path = Path.home() / ".config" / "imessage-bridge"

    @classmethod
    def from_env(cls) -> Config:
        load_dotenv()
        required = [
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
        ]
        missing = [k for k in required if not os.getenv(k)]
        if missing:
            raise ValueError(f"Missing required env vars: {', '.join(missing)}")

        return cls(
            supabase_url=os.environ["SUPABASE_URL"],
            supabase_service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            target_phone=os.getenv("TARGET_PHONE", ""),
            user_id=os.getenv("USER_ID", ""),
            multi_user=os.getenv("MULTI_USER", "true").lower() in ("true", "1", "yes"),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            debounce_seconds=float(os.getenv("DEBOUNCE_SECONDS", "0.5")),
        )

    @property
    def v2_chat_service_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/v2-chat-service"

    @property
    def v2_ack_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/v2-ack"

    @property
    def v2_onboard_chat_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/v2-onboard-chat"
