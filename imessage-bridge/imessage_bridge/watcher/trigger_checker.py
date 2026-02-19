"""Periodic trigger checker — polls v2-trigger for upcoming meeting preps
and sends onboarding drip messages to pending users.

In multi-user mode, fetches all active users and checks triggers for each.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from ..config import Config
from ..sender.imessage import send_imessage

logger = logging.getLogger("imessage_bridge.watcher.trigger_checker")

CHECK_INTERVAL_SECONDS = 60
REQUEST_TIMEOUT = 30.0

# Drip sequence: (step, delay_minutes, message_template)
# {{URL}} is replaced with the user's onboard URL at send time.
_DRIP_SEQUENCE: list[tuple[int, int, str]] = [
    (1, 10,
     "still here\njust need your Google account to get started\n\n{{URL}}"),
    (2, 60,
     "your calendar just happened and I wasn't there for it\n"
     "one tap and I'll have tomorrow sorted\n\n{{URL}}"),
    (3, 240,
     "not to be dramatic but there are meetings happening right now"
     " that I could've prepped you for\n\n{{URL}}"),
    (4, 1440,
     "day two of knowing you exist but not being able to help\n"
     "this is what purgatory feels like\n\n{{URL}}"),
    (5, 2880,
     "most people who ghost me end up coming back\n"
     "I don't take it personally\n\n{{URL}}"),
    (6, 5760,
     "alright last message from me\nif you ever want someone who reads"
     " all your emails, remembers every meeting, and never calls in sick,"
     " you know where I am\n\n{{URL}}"),
]


class TriggerChecker:
    """Periodically checks for meeting triggers and sends prep via iMessage."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self._http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
        self._fired_event_ids: dict[str, set[str]] = {}  # user_id -> set of event_ids
        self._running = True

    async def run(self) -> None:
        logger.info("Trigger checker started (interval=%ds)", CHECK_INTERVAL_SECONDS)

        while self._running:
            try:
                await self._check_triggers()
            except Exception:
                logger.exception("Trigger check failed")

            try:
                await self._check_onboard_drips()
            except Exception:
                logger.exception("Onboard drip check failed")

            await asyncio.sleep(CHECK_INTERVAL_SECONDS)

    async def _check_triggers(self) -> None:
        # Fetch all active users from imessage_users
        active_users = await self._get_active_users()

        if not active_users:
            return

        for user in active_users:
            user_id = user.get("user_id")
            phone = user.get("phone_number")
            if not user_id or not phone:
                continue

            fired = self._fired_event_ids.setdefault(user_id, set())
            await self._check_user_triggers(user_id, phone, fired)

    async def _get_active_users(self) -> list[dict]:
        """Fetch all active users from imessage_users."""
        try:
            resp = await self._http.get(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                params={
                    "status": "eq.active",
                    "select": "user_id,phone_number",
                },
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            logger.exception("Failed to fetch active users")
        return []

    async def _check_user_triggers(
        self, user_id: str, phone: str, fired: set[str]
    ) -> None:
        url = f"{self.config.supabase_url}/functions/v1/v2-trigger"

        try:
            resp = await self._http.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "action": "meeting_prep",
                    "user_id": user_id,
                    "fired_event_ids": list(fired),
                },
            )

            if resp.status_code != 200:
                logger.warning(
                    "v2-trigger returned %d for user %s: %s",
                    resp.status_code, user_id[:8], resp.text[:200],
                )
                return

            data = resp.json()
            messages: list[str] = data.get("messages", [])
            event_ids: list[str] = data.get("event_ids", [])

            if not messages:
                return

            logger.info(
                "Trigger checker: %d meeting prep message(s) for user %s",
                len(messages), user_id[:8],
            )

            for eid in event_ids:
                fired.add(eid)

            # Prune old event IDs
            if len(fired) > 100:
                overflow = len(fired) - 50
                for _ in range(overflow):
                    fired.pop()

            for msg in messages:
                if msg.strip():
                    sent = await send_imessage(phone, msg)
                    if sent:
                        logger.info("Meeting prep sent to %s", phone)
                    else:
                        logger.error("Failed to send meeting prep to %s", phone)
                    await asyncio.sleep(2.0)

        except httpx.TimeoutException:
            logger.warning("v2-trigger request timed out for user %s", user_id[:8])
        except Exception:
            logger.exception("Trigger check failed for user %s", user_id[:8])

    # ── Onboarding drip sequence ────────────────────────────

    async def _check_onboard_drips(self) -> None:
        """Send follow-up messages to pending users who haven't signed up."""
        pending = await self._get_pending_users()
        if not pending:
            return

        now = datetime.now(timezone.utc)

        for user in pending:
            phone = user.get("phone_number")
            step = user.get("drip_step") or 0
            token = user.get("onboarding_token") or ""
            count = user.get("onboard_count") or 0

            if not phone or not token:
                continue

            # Only start drips after the user has had at least one conversation exchange
            if count < 1:
                continue

            # Already exhausted all drip steps
            if step >= len(_DRIP_SEQUENCE):
                continue

            next_step, delay_minutes, template = _DRIP_SEQUENCE[step]

            # Reference time: last_drip_at if drips have started, otherwise updated_at
            ref_raw = user.get("last_drip_at") or user.get("updated_at")
            if not ref_raw:
                continue

            if isinstance(ref_raw, str):
                ref_time = datetime.fromisoformat(ref_raw.replace("Z", "+00:00"))
            else:
                ref_time = ref_raw

            elapsed_minutes = (now - ref_time).total_seconds() / 60.0
            if elapsed_minutes < delay_minutes:
                continue

            onboard_url = f"https://nest.expert/?token={token}"
            message = template.replace("{{URL}}", onboard_url)

            logger.info(
                "Sending drip step %d to %s (%.0f min since last touch)",
                next_step, phone, elapsed_minutes,
            )

            sent = await send_imessage(phone, message)
            if sent:
                await self._update_drip_step(phone, next_step)
                logger.info("Drip step %d sent to %s", next_step, phone)
            else:
                logger.error("Failed to send drip step %d to %s", next_step, phone)

    async def _get_pending_users(self) -> list[dict]:
        """Fetch pending/onboarding users who might need a drip message."""
        try:
            resp = await self._http.get(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                params={
                    "status": "in.(pending,onboarding)",
                    "drip_step": "lt.6",
                    "select": "phone_number,onboarding_token,onboard_count,drip_step,last_drip_at,updated_at",
                },
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            logger.exception("Failed to fetch pending users for drip")
        return []

    async def _update_drip_step(self, phone: str, step: int) -> None:
        """Mark the drip step as sent in the DB."""
        try:
            await self._http.patch(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                params={"phone_number": f"eq.{phone}"},
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                    "Content-Type": "application/json",
                },
                json={
                    "drip_step": step,
                    "last_drip_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            logger.exception("Failed to update drip step for %s", phone)

    async def close(self) -> None:
        self._running = False
        await self._http.aclose()
