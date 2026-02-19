"""Outbound iMessage poller.

Polls the outbound_imessages table for pending messages queued by edge
functions (e.g. post-signup welcome messages) and delivers them via iMessage.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import Config
from .imessage import send_imessage

logger = logging.getLogger("imessage_bridge.sender.outbound_poller")

POLL_INTERVAL_SECONDS = 1


class OutboundPoller:
    """Poll outbound_imessages for pending messages and send them."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self._http: httpx.AsyncClient | None = None

    async def run(self) -> None:
        self._http = httpx.AsyncClient(timeout=15.0)
        headers = {
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "apikey": self.config.supabase_service_role_key,
        }

        logger.info("Outbound poller started (every %ds)", POLL_INTERVAL_SECONDS)

        while True:
            try:
                resp = await self._http.get(
                    f"{self.config.supabase_url}/rest/v1/outbound_imessages",
                    headers=headers,
                    params={
                        "status": "eq.pending",
                        "order": "created_at.asc",
                        "limit": "10",
                    },
                )

                if resp.status_code == 200:
                    rows = resp.json()
                    for row in rows:
                        msg_id = row.get("id", "")
                        phone = row.get("phone_number", "")
                        content = row.get("content", "")

                        if not phone or not content:
                            continue

                        logger.info(
                            "Sending outbound message %s to %s: %s",
                            msg_id[:8],
                            phone[:6] + "***",
                            content[:80],
                        )

                        sent = await send_imessage(phone, content)

                        from datetime import datetime, timezone

                        new_status = "sent" if sent else "failed"
                        patch_headers = {
                            **headers,
                            "Content-Type": "application/json",
                        }
                        patch_body: dict = {"status": new_status}
                        if sent:
                            patch_body["sent_at"] = datetime.now(timezone.utc).isoformat()

                        await self._http.patch(
                            f"{self.config.supabase_url}/rest/v1/outbound_imessages",
                            headers=patch_headers,
                            params={"id": f"eq.{msg_id}"},
                            json=patch_body,
                        )

                        if sent:
                            logger.info("Outbound message %s sent", msg_id[:8])
                        else:
                            logger.error("Outbound message %s failed", msg_id[:8])

                        await asyncio.sleep(0.5)

            except Exception:
                logger.debug("Outbound poll error", exc_info=True)

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()
