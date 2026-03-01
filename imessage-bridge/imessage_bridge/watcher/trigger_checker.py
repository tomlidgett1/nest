"""Periodic trigger checker — polls v2-trigger for meeting preps and cron reminders.

In multi-user mode, fetches all active users and checks triggers for each.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import Config
from ..sender.imessage import send_imessage
from ..state import BridgeState

logger = logging.getLogger("imessage_bridge.watcher.trigger_checker")

CHECK_INTERVAL_SECONDS = 60
REQUEST_TIMEOUT = 30.0


class TriggerChecker:
    """Periodically checks for meeting triggers and sends prep via iMessage."""

    def __init__(self, config: Config, state: BridgeState | None = None) -> None:
        self.config = config
        self.state = state
        self._http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
        self._fired_event_ids: dict[str, set[str]] = {}  # user_id -> set of event_ids
        self._user_phone_cache: dict[str, str] = {}  # user_id -> phone_number
        self._running = True

    async def run(self) -> None:
        logger.info("Trigger checker started (interval=%ds)", CHECK_INTERVAL_SECONDS)

        while self._running:
            try:
                await self._check_triggers()
            except Exception:
                logger.exception("Trigger check failed")

            await asyncio.sleep(CHECK_INTERVAL_SECONDS)

    async def _check_triggers(self) -> None:
        # Fire-and-forget: check if any daily briefings need regeneration
        await self._check_daily_briefing()

        # Check cron-based reminders (fires due reminders and delivers via Realtime)
        await self._check_cron_reminders()

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

    async def _check_cron_reminders(self) -> None:
        """Call v2-trigger to fire any due cron reminders and deliver via iMessage.

        The edge function handles querying due reminders, generating messages,
        inserting into v2_chat_messages, and rescheduling repeating reminders.
        We then deliver each message via iMessage to the right phone number.
        """
        url = f"{self.config.supabase_url}/functions/v1/v2-trigger"
        try:
            resp = await self._http.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"action": "check_cron_reminders"},
            )
            if resp.status_code != 200:
                logger.warning(
                    "check_cron_reminders returned %d: %s",
                    resp.status_code, resp.text[:200],
                )
                return

            data = resp.json()
            messages: list[dict] = data.get("messages", [])
            if not messages:
                return

            logger.info("Cron reminders: %d to deliver", len(messages))

            for entry in messages:
                user_id = entry.get("user_id", "")
                message = entry.get("message", "")
                msg_id = entry.get("message_id", "")
                if not user_id or not message or not message.strip():
                    continue

                # Register the DB message ID so the Realtime Listener skips it
                if msg_id and self.state:
                    self.state.sent_message_ids.add(msg_id)

                phone = await self._resolve_phone(user_id)
                if not phone:
                    logger.error(
                        "No phone number for user %s, cannot deliver reminder",
                        user_id[:8],
                    )
                    continue

                sent = await send_imessage(phone, message)
                if sent:
                    logger.info("Reminder sent to %s (user %s)", phone, user_id[:8])
                    if self.state:
                        self.state.save()
                else:
                    logger.error("Failed to send reminder to %s", phone)
                await asyncio.sleep(1.5)

        except httpx.TimeoutException:
            logger.warning("check_cron_reminders request timed out")
        except Exception:
            logger.exception("check_cron_reminders failed")

    async def _resolve_phone(self, user_id: str) -> str | None:
        """Look up phone number for a user_id, with caching."""
        if user_id in self._user_phone_cache:
            return self._user_phone_cache[user_id]

        try:
            resp = await self._http.get(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                params={
                    "user_id": f"eq.{user_id}",
                    "status": "eq.active",
                    "select": "phone_number",
                    "limit": "1",
                },
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )
            if resp.status_code == 200:
                rows = resp.json()
                if rows:
                    phone = rows[0].get("phone_number")
                    if phone:
                        self._user_phone_cache[user_id] = phone
                        return phone
        except Exception:
            logger.exception("Failed to resolve phone for user %s", user_id[:8])

        return None

    async def _check_daily_briefing(self) -> None:
        """Call v2-trigger to regenerate stale daily briefings."""
        url = f"{self.config.supabase_url}/functions/v1/v2-trigger"
        try:
            resp = await self._http.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"action": "check_daily_briefing"},
            )
            if resp.status_code != 200:
                logger.warning(
                    "check_daily_briefing returned %d: %s",
                    resp.status_code, resp.text[:200],
                )
        except httpx.TimeoutException:
            logger.warning("check_daily_briefing request timed out")
        except Exception:
            logger.exception("check_daily_briefing failed")

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
            message_ids: list[str] = data.get("message_ids", [])

            if not messages:
                return

            logger.info(
                "Trigger checker: %d meeting prep message(s) for user %s",
                len(messages), user_id[:8],
            )

            for eid in event_ids:
                fired.add(eid)

            # Register DB message IDs so the Realtime Listener skips them
            if self.state:
                for mid in message_ids:
                    if mid:
                        self.state.sent_message_ids.add(mid)

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
                        if self.state:
                            self.state.save()
                    else:
                        logger.error("Failed to send meeting prep to %s", phone)
                    await asyncio.sleep(2.0)

        except httpx.TimeoutException:
            logger.warning("v2-trigger request timed out for user %s", user_id[:8])
        except Exception:
            logger.exception("Trigger check failed for user %s", user_id[:8])

    async def close(self) -> None:
        self._running = False
        await self._http.aclose()
