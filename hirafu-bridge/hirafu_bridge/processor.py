"""Message processor — routes between pre-registered and active users."""

from __future__ import annotations

import json
import logging
import random
from typing import Any
from urllib.parse import quote

import httpx

from .config import Config
from .sender.imessage import send_imessage

logger = logging.getLogger("hirafu_bridge.processor")


class MessageProcessor:
    def __init__(self, config: Config):
        self.config = config
        self._http = httpx.AsyncClient(timeout=60.0)
        self._headers = {
            "Authorization": f"Bearer {config.supabase_service_role_key}",
            "Content-Type": "application/json",
            "apikey": config.supabase_service_role_key,
        }

    async def close(self):
        await self._http.aclose()

    async def get_user_info(self, phone: str) -> dict[str, Any] | None:
        """Look up a Hirafu user by phone number."""
        url = (
            f"{self.config.supabase_url}/rest/v1/hirafu_users"
            f"?phone_number=eq.{quote(phone, safe='')}"
            f"&select=id,phone_number,user_id,status,onboarding_token,display_name,onboard_messages,onboard_count"
        )
        try:
            resp = await self._http.get(url, headers=self._headers)
            if resp.status_code == 200:
                data = resp.json()
                return data[0] if data else None
        except Exception as e:
            logger.error("Failed to look up user %s: %s", phone, e)
        return None

    async def create_user(self, phone: str) -> dict[str, Any] | None:
        """Create a new hirafu_users row. On conflict, fetch the existing one."""
        url = f"{self.config.supabase_url}/rest/v1/hirafu_users"
        payload = {"phone_number": phone, "status": "pre_registered"}
        try:
            resp = await self._http.post(
                url,
                headers={**self._headers, "Prefer": "return=representation"},
                json=payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return data[0] if isinstance(data, list) else data
            if resp.status_code == 409:
                logger.info("User %s already exists, fetching", phone)
                return await self.get_user_info(phone)
        except Exception as e:
            logger.error("Failed to create user %s: %s", phone, e)
        return None

    async def process_message(self, phone: str, text: str) -> None:
        """Route a message to the appropriate handler."""
        user = await self.get_user_info(phone)

        if not user:
            logger.info("New user: %s — creating and starting onboarding", phone)
            user = await self.create_user(phone)
            if not user:
                logger.error("Failed to create user for %s", phone)
                return

        status = user.get("status", "pending")

        if status in ("pending", "pre_registered"):
            await self._handle_pre_registered(user, text)
        elif status == "active":
            await self._handle_active(user, text)
        else:
            logger.warning("Unknown status '%s' for %s", status, phone)

    async def _handle_pre_registered(self, user: dict, text: str) -> None:
        """Poke-style pre-registered chat."""
        phone = user["phone_number"]
        token = user.get("onboarding_token", "")
        history = user.get("onboard_messages") or []
        message_count = user.get("onboard_count", 0) + 1

        onboard_url = f"https://nest.expert/?token={token}&product=hirafu"

        logger.info("Pre-registered chat for %s (msg #%d)", phone, message_count)

        try:
            resp = await self._http.post(
                self.config.hirafu_onboard_chat_url,
                headers=self._headers,
                json={
                    "phone": phone,
                    "message": text,
                    "history": history,
                    "message_count": message_count,
                    "onboard_url": onboard_url,
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                response_text = data.get("response", "")
                if response_text:
                    delay = random.uniform(2.0, 5.0)
                    import asyncio
                    await asyncio.sleep(delay)
                    await send_imessage(phone, response_text)
            else:
                logger.error("Onboard chat error %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("Pre-registered handler failed for %s: %s", phone, e)

    async def _handle_active(self, user: dict, text: str) -> None:
        """Full agent chat for active users."""
        phone = user["phone_number"]
        user_id = user.get("user_id")

        if not user_id:
            logger.warning("Active user %s has no user_id, treating as pre-registered", phone)
            await self._handle_pre_registered(user, text)
            return

        logger.info("Active chat for %s (user_id: %s)", phone, user_id)

        try:
            resp = await self._http.post(
                self.config.hirafu_chat_service_url,
                headers=self._headers,
                json={
                    "message": text,
                    "user_id": user_id,
                    "phone": phone,
                },
            )

            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "")

                if "ndjson" in content_type:
                    ack_sent = False
                    response_text = ""
                    reaction = None

                    for line in resp.text.strip().split("\n"):
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        if chunk.get("type") == "ack" and not ack_sent:
                            ack_text = chunk.get("text", "")
                            if ack_text:
                                await send_imessage(phone, ack_text)
                                ack_sent = True
                        elif chunk.get("type") == "response":
                            response_text = chunk.get("response", "")
                            reaction = chunk.get("reaction")
                        elif chunk.get("type") == "error":
                            logger.error("Chat service error: %s", chunk.get("error"))

                    if response_text:
                        delay = random.uniform(2.0, 5.0)
                        import asyncio
                        await asyncio.sleep(delay)
                        await send_imessage(phone, response_text)
                else:
                    data = resp.json()
                    response_text = data.get("response", "")
                    if response_text:
                        delay = random.uniform(2.0, 5.0)
                        import asyncio
                        await asyncio.sleep(delay)
                        await send_imessage(phone, response_text)
            else:
                logger.error("Chat service error %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("Active handler failed for %s: %s", phone, e)

    async def poll_outbound(self) -> None:
        """Poll hirafu_outbound_messages for pending messages and deliver them."""
        url = (
            f"{self.config.supabase_url}/rest/v1/hirafu_outbound_messages"
            f"?status=eq.pending&order=created_at.asc&limit=10"
        )
        try:
            resp = await self._http.get(url, headers=self._headers)
            if resp.status_code != 200:
                return

            messages = resp.json()
            for msg in messages:
                msg_id = msg["id"]
                phone = msg["phone_number"]
                content = msg["content"]

                success = await send_imessage(phone, content)

                update_url = f"{self.config.supabase_url}/rest/v1/hirafu_outbound_messages?id=eq.{msg_id}"
                status = "sent" if success else "failed"
                await self._http.patch(
                    update_url,
                    headers=self._headers,
                    json={"status": status, "sent_at": "now()"},
                )
                logger.info("Outbound message %s → %s: %s", msg_id, phone, status)
        except Exception as e:
            logger.error("Outbound poll failed: %s", e)

    async def check_triggers(self) -> None:
        """Call hirafu-trigger to check for meeting preps and reminders."""
        try:
            await self._http.post(
                self.config.hirafu_trigger_url,
                headers=self._headers,
                json={"action": "meeting_prep"},
            )
            await self._http.post(
                self.config.hirafu_trigger_url,
                headers=self._headers,
                json={"action": "check_daily_briefing"},
            )
            await self._http.post(
                self.config.hirafu_trigger_url,
                headers=self._headers,
                json={"action": "check_cron_reminders"},
            )
        except Exception as e:
            logger.error("Trigger check failed: %s", e)
