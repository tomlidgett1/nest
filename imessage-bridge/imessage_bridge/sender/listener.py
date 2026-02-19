"""Supabase Realtime listener for trigger/system messages.

Process 2: catches assistant and system messages pushed to v2_chat_messages
by the v2-trigger edge function (email notifications, calendar alerts) and
sends them as iMessages.  Also acts as a fallback if Process 1's fast-path
send fails.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from ..config import Config
from ..state import BridgeState
from .imessage import send_imessage

logger = logging.getLogger("imessage_bridge.sender.listener")

# How far back to look for unsent messages on startup (seconds)
CATCHUP_WINDOW_SECONDS = 3600


class RealtimeListener:
    """Subscribe to v2_chat_messages INSERTs and send them as iMessages."""

    def __init__(self, config: Config, state: BridgeState) -> None:
        self.config = config
        self.state = state
        self._supabase = None
        self._channel = None

    async def start(self) -> None:
        """Connect to Supabase Realtime and subscribe to new messages."""
        try:
            from supabase import acreate_client

            self._supabase = await acreate_client(
                self.config.supabase_url,
                self.config.supabase_service_role_key,
            )
        except ImportError:
            logger.warning(
                "supabase package not available; Realtime listener disabled. "
                "Install with: pip install supabase"
            )
            # Fall back to polling
            await self._poll_fallback()
            return

        # Catch up on any messages missed while offline
        await self._catch_up()

        try:
            channel = self._supabase.realtime.channel("imessage-bridge")
            channel.on_postgres_changes(
                event="INSERT",
                schema="public",
                table="v2_chat_messages",
                filter=f"user_id=eq.{self.config.user_id}",
                callback=self._on_insert,
            )
            await channel.subscribe()
            self._channel = channel
            logger.info("Realtime subscription active on v2_chat_messages")

            # Keep alive
            while True:
                await asyncio.sleep(3600)
        except Exception:
            logger.exception("Realtime subscription failed, falling back to polling")
            await self._poll_fallback()

    def _on_insert(self, payload: dict) -> None:
        """Handle a Realtime INSERT event (called from websocket thread)."""
        try:
            record = payload.get("data", {}).get("record", {})
            if not record:
                record = payload.get("new", {})
            if not record:
                return

            role = record.get("role", "")
            content = record.get("content", "")
            msg_id = record.get("id", "")

            # Only forward assistant and system messages
            if role not in ("assistant", "system"):
                return

            if not content or not content.strip():
                return

            # Dedup: already sent by Process 1 or a previous Realtime event
            if msg_id in self.state.sent_message_ids:
                return

            logger.info(
                "Realtime: new %s message (%s): %s",
                role,
                msg_id[:8],
                content[:80],
            )

            # Schedule the send on the event loop
            loop = asyncio.get_event_loop()
            loop.create_task(self._send_and_track(msg_id, content))
        except Exception:
            logger.exception("Error in Realtime callback")

    async def _send_and_track(self, msg_id: str, content: str) -> None:
        """Send an iMessage and mark as sent in state.

        Waits briefly before sending so the Processor (Process 1) has time to
        claim the message first.  If the Processor already sent it via the
        fast-path HTTP response, we skip the duplicate.
        """
        await asyncio.sleep(3.0)

        # Re-check after delay — processor may have sent it already
        if msg_id in self.state.sent_message_ids:
            logger.debug(
                "Realtime: message %s already sent by processor, skipping",
                msg_id[:8],
            )
            return

        sent = await send_imessage(self.config.target_phone, content)
        if sent:
            self.state.sent_message_ids.add(msg_id)
            self.state.save()
        else:
            logger.error("Failed to send Realtime message %s via iMessage", msg_id[:8])

    async def _catch_up(self) -> None:
        """On startup, mark existing messages as seen so we don't re-send them.

        We do NOT send old messages — only messages that arrive via Realtime
        AFTER the subscription is active will be sent.  This prevents spam
        on every restart.
        """
        if not self._supabase:
            return

        try:
            result = (
                await self._supabase.table("v2_chat_messages")
                .select("id")
                .eq("user_id", self.config.user_id)
                .in_("role", ["assistant", "system"])
                .order("created_at", desc=True)
                .limit(50)
                .execute()
            )

            for r in result.data or []:
                self.state.sent_message_ids.add(r["id"])

            logger.info(
                "Marked %d existing messages as seen (won't re-send)",
                len(result.data or []),
            )
            self.state.save()
        except Exception:
            logger.exception("Catch-up query failed")

    async def _poll_fallback(self) -> None:
        """Simple polling fallback if Realtime is unavailable."""
        logger.info("Starting polling fallback (every 3s)")
        http = httpx.AsyncClient(timeout=30.0)
        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
        }

        while True:
            try:
                resp = await http.get(
                    f"{self.config.supabase_url}/rest/v1/v2_chat_messages",
                    headers=headers,
                    params={
                        "user_id": f"eq.{self.config.user_id}",
                        "role": "in.(assistant,system)",
                        "order": "created_at.desc",
                        "limit": "10",
                    },
                )
                if resp.status_code == 200:
                    for r in reversed(resp.json()):
                        msg_id = r.get("id", "")
                        if msg_id not in self.state.sent_message_ids:
                            content = r.get("content", "")
                            if content:
                                await self._send_and_track(msg_id, content)
            except Exception:
                logger.debug("Poll fallback error", exc_info=True)

            await asyncio.sleep(3.0)

    async def stop(self) -> None:
        if self._channel:
            try:
                await self._channel.unsubscribe()
            except Exception:
                pass
