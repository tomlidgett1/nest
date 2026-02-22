"""Process new iMessages: check user status, onboard new users, forward to V2 agent.

v2 — Concurrent per-user processing. Each user's messages are handled in
their own asyncio Task so 50 users messaging simultaneously don't queue
behind each other. Per-user locks prevent reply interleaving within a
single conversation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from collections import defaultdict

import httpx

from ..config import Config
from ..sender.imessage import send_imessage
from ..state import BridgeState
from .chat_db import IncomingMessage, fetch_new_messages

logger = logging.getLogger("imessage_bridge.watcher.processor")
_debug_logger = logging.getLogger("imessage_bridge.debug")

_DEBUG_PHONE = "+61414187820"

MAX_CONCURRENT_AGENTS = 20
USER_QUEUE_TIMEOUT = 300.0


def _dbg(phone: str, msg: str, *args: object) -> None:
    if phone != _DEBUG_PHONE:
        return
    formatted = msg % args if args else msg
    _debug_logger.info("🔍 %s", formatted)


_JUNK_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^https?://\S+$"),
    re.compile(r"missed a call", re.IGNORECASE),
    re.compile(r"didn't leave a message", re.IGNORECASE),
    re.compile(r"^Liked\s+\"", re.IGNORECASE),
    re.compile(r"^Loved\s+\"", re.IGNORECASE),
    re.compile(r"^Laughed at\s+\"", re.IGNORECASE),
    re.compile(r"^Emphasised\s+\"", re.IGNORECASE),
    re.compile(r"^Emphasized\s+\"", re.IGNORECASE),
    re.compile(r"^Disliked\s+\"", re.IGNORECASE),
    re.compile(r"^Questioned\s+\"", re.IGNORECASE),
]

_CASUAL_WORDS = {
    "hey", "hi", "hello", "yo", "sup", "hiya", "g'day",
    "thanks", "thank you", "cheers", "ta", "thx",
    "nah", "nope", "no",
    "good morning", "good afternoon", "good evening", "good night",
    "gm", "gn", "morning", "night",
    "lol", "haha", "hahaha", "lmao", "nice", "cool", "great", "awesome",
    "bye", "cya", "see ya", "later", "ttyl",
    "how are you", "how's it going", "what's up", "whats up",
}

_NEVER_CASUAL = {
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "k", "kk",
    "do it", "go ahead", "send", "send it", "go for it", "confirm",
}

_ACK_FALLBACKS = [
    "One sec.",
    "Checking now.",
    "Let me look into that.",
    "On it.",
    "Looking into it.",
]


def _is_junk_message(text: str) -> bool:
    return any(p.search(text) for p in _JUNK_PATTERNS)


def _is_casual(text: str) -> bool:
    cleaned = text.lower().strip().rstrip("!?.").strip()
    if cleaned in _NEVER_CASUAL:
        return False
    if cleaned in _CASUAL_WORDS:
        return True
    words = cleaned.split()
    if len(words) <= 2 and len(cleaned) <= 12:
        substance = {"meeting", "email", "note", "calendar", "schedule",
                     "search", "find", "draft", "transcript", "summary",
                     "send", "book", "create", "delete", "cancel", "remind",
                     "update", "reschedule", "forward", "reply"}
        return not any(w in substance for w in words)
    return False


def _pick_fallback_ack() -> str:
    return random.choice(_ACK_FALLBACKS)


# ── User status cache ─────────────────────────────────────────

class _UserCache:
    def __init__(self, ttl: float = 60.0) -> None:
        self._cache: dict[str, dict] = {}
        self._timestamps: dict[str, float] = {}
        self._ttl = ttl

    def get(self, phone: str) -> dict | None:
        if phone in self._cache:
            if time.monotonic() - self._timestamps[phone] < self._ttl:
                return self._cache[phone]
            del self._cache[phone]
            del self._timestamps[phone]
        return None

    def set(self, phone: str, data: dict) -> None:
        if data.get("status") != "active":
            return
        self._cache[phone] = data
        self._timestamps[phone] = time.monotonic()

    def invalidate(self, phone: str) -> None:
        self._cache.pop(phone, None)
        self._timestamps.pop(phone, None)


# ── Processor ─────────────────────────────────────────────────

class MessageProcessor:
    """Concurrent per-user message processor.

    Architecture:
      - on_chat_db_changed() reads new messages, groups by sender, and
        dispatches each sender's batch as a separate asyncio.Task.
      - Per-user asyncio.Lock ensures messages from the same sender are
        processed sequentially (preserving conversation order).
      - A global Semaphore caps concurrent agent HTTP calls.
      - State (last_rowid, processed_guids) is protected by an asyncio.Lock.
    """

    def __init__(self, config: Config, state: BridgeState) -> None:
        self.config = config
        self.state = state
        self._http = httpx.AsyncClient(timeout=180.0)
        self._user_cache = _UserCache(ttl=15.0)

        self._user_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._agent_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AGENTS)
        self._state_lock = asyncio.Lock()
        self._active_tasks: set[asyncio.Task] = set()
        self._last_response_ids: dict[str, str | None] = {}
        self._fetching = False

    async def on_chat_db_changed(self) -> None:
        if self._fetching:
            return
        self._fetching = True
        try:
            messages = fetch_new_messages(
                chat_db_path=self.config.chat_db_path,
                target_phone=None,
                last_rowid=self.state.last_rowid,
            )

            to_process: list[IncomingMessage] = []
            for msg in messages:
                if msg.guid in self.state.processed_guids:
                    async with self._state_lock:
                        self.state.last_rowid = max(self.state.last_rowid, msg.rowid)
                    continue

                if _is_junk_message(msg.text):
                    logger.debug("Skipping junk [ROWID %d]: %s", msg.rowid, msg.text[:80])
                    async with self._state_lock:
                        self.state.last_rowid = msg.rowid
                        self.state.processed_guids.add(msg.guid)
                        self.state.save()
                    continue

                async with self._state_lock:
                    self.state.last_rowid = msg.rowid
                    self.state.processed_guids.add(msg.guid)
                    self.state.save()

                to_process.append(msg)

            if not to_process:
                return

            by_sender: dict[str, list[IncomingMessage]] = defaultdict(list)
            for msg in to_process:
                by_sender[msg.sender].append(msg)

            logger.info(
                "Dispatching %d message(s) from %d user(s) concurrently",
                len(to_process), len(by_sender),
            )

            for sender, sender_msgs in by_sender.items():
                task = asyncio.create_task(
                    self._process_user_batch(sender, sender_msgs),
                    name=f"user:{sender}",
                )
                self._active_tasks.add(task)
                task.add_done_callback(self._active_tasks.discard)

        finally:
            self._fetching = False

    async def _process_user_batch(self, sender: str, messages: list[IncomingMessage]) -> None:
        """Process a batch of messages from a single sender, sequentially and under lock."""
        async with self._user_locks[sender]:
            for msg in messages:
                logger.info(
                    "New iMessage [ROWID %d] from %s: %s",
                    msg.rowid, msg.sender, msg.text[:120],
                )
                _dbg(msg.sender, "=" * 70)
                _dbg(msg.sender, "📨 INCOMING MESSAGE")
                _dbg(msg.sender, "  ROWID: %d | GUID: %s", msg.rowid, msg.guid)
                _dbg(msg.sender, "  From:  %s", msg.sender)
                _dbg(msg.sender, "  Text:  %s", msg.text)
                _dbg(msg.sender, "-" * 70)

                try:
                    await self._route_message(msg)
                except Exception:
                    logger.exception("Failed to process message %s from %s", msg.guid, sender)

    async def _route_message(self, msg: IncomingMessage) -> None:
        user_info = await self._get_user_info(msg.sender)

        _dbg(msg.sender, "👤 USER LOOKUP: %s",
             f"status={user_info['status']}, user_id={user_info.get('user_id', 'N/A')}, name={user_info.get('display_name', 'N/A')}"
             if user_info else "NOT FOUND (new user)")

        if user_info is None:
            _dbg(msg.sender, "🆕 Routing → _onboard_new_user()")
            await self._onboard_new_user(msg)
        elif user_info["status"] in ("pending", "onboarding"):
            _dbg(msg.sender, "📋 Routing → _continue_onboarding()")
            await self._continue_onboarding(msg, user_info)
        elif user_info["status"] == "active":
            _dbg(msg.sender, "✅ Routing → _process_active_user()")
            await self._process_active_user(msg, user_info)
        else:
            logger.warning("Unknown user status: %s", user_info["status"])

    # ── User Lookup ───────────────────────────────────────────

    async def _get_user_info(self, phone: str) -> dict | None:
        cached = self._user_cache.get(phone)
        if cached is not None:
            return cached if cached.get("_exists") else None

        try:
            resp = await self._http.get(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                params={
                    "phone_number": f"eq.{phone}",
                    "select": "id,phone_number,user_id,status,onboarding_token,display_name,onboard_messages,onboard_count,pdl_profile",
                },
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                if data and len(data) > 0:
                    user = data[0]
                    user["_exists"] = True
                    self._user_cache.set(phone, user)
                    return user

            self._user_cache.set(phone, {"_exists": False})
            return None
        except Exception:
            logger.exception("Failed to look up user %s", phone)
            return None

    # ── New User Onboarding ───────────────────────────────────

    async def _onboard_new_user(self, msg: IncomingMessage) -> None:
        logger.info("New user detected: %s", msg.sender)

        try:
            resp = await self._http.post(
                f"{self.config.supabase_url}/rest/v1/imessage_users",
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json={
                    "phone_number": msg.sender,
                    "status": "pending",
                },
            )

            if resp.status_code == 409 or (resp.status_code >= 400 and "duplicate" in resp.text.lower()):
                logger.info("Phone %s already exists, re-fetching", msg.sender)
                self._user_cache.invalidate(msg.sender)
                user_info = await self._get_user_info(msg.sender)
                if user_info and user_info.get("status") == "active":
                    await self._process_active_user(msg, user_info)
                elif user_info:
                    await self._continue_onboarding(msg, user_info)
                return

            if resp.status_code not in (200, 201):
                logger.error("Failed to create user entry: %s", resp.text[:200])
                return

            user_data = resp.json()
            if isinstance(user_data, list):
                user_data = user_data[0]

            token = user_data.get("onboarding_token", "")
            self._user_cache.invalidate(msg.sender)

            logger.info("Created imessage_users entry for %s (token=%s)", msg.sender, token[:8])

        except Exception:
            logger.exception("Failed to create user entry for %s", msg.sender)
            return

        onboard_url = f"https://nest.expert/?token={token}"
        await self._call_onboard_chat(msg, history=[], message_count=1, onboard_url=onboard_url)

    # ── Continue Onboarding Conversation ─────────────────────

    async def _continue_onboarding(self, msg: IncomingMessage, user_info: dict) -> None:
        self._user_cache.invalidate(msg.sender)
        fresh_info = await self._get_user_info(msg.sender)
        if fresh_info and fresh_info.get("status") == "active" and fresh_info.get("user_id"):
            logger.info("User %s completed onboarding since last check, routing as active", msg.sender)
            await self._process_active_user(msg, fresh_info)
            return

        info = fresh_info or user_info
        token = info.get("onboarding_token", "")
        onboard_url = f"https://nest.expert/?token={token}"
        history = info.get("onboard_messages") or []
        count = (info.get("onboard_count") or 0) + 1

        pdl_context = self._build_pdl_context(info.get("pdl_profile"))
        await self._call_onboard_chat(msg, history=history, message_count=count, onboard_url=onboard_url, pdl_context=pdl_context)

    # ── PDL Context Builder ────────────────────────────────────

    @staticmethod
    def _build_pdl_context(pdl_profile: dict | None) -> str | None:
        if not pdl_profile or not isinstance(pdl_profile, dict):
            return None
        lines: list[str] = []
        p = pdl_profile

        if p.get("full_name"):
            lines.append(f"Name: {p['full_name']}")
        if p.get("sex"):
            lines.append(f"Gender: {p['sex']}")
        if p.get("job_title"):
            lines.append(f"Current Title: {p['job_title']}")
        if p.get("job_company_name"):
            company = p["job_company_name"]
            if p.get("job_company_size"):
                company += f" ({p['job_company_size']} employees)"
            if p.get("job_company_type"):
                company += f" [{p['job_company_type']}]"
            lines.append(f"Company: {company}")
        if p.get("job_company_industry"):
            lines.append(f"Company Industry: {p['job_company_industry']}")
        if p.get("job_title_role"):
            role = p["job_title_role"]
            if p.get("job_title_sub_role"):
                role += f" / {p['job_title_sub_role']}"
            lines.append(f"Role Category: {role}")
        levels = p.get("job_title_levels")
        if levels and isinstance(levels, list) and len(levels) > 0:
            lines.append(f"Seniority: {', '.join(levels)}")
        if p.get("job_start_date"):
            lines.append(f"In Current Role Since: {p['job_start_date']}")
        if p.get("job_summary"):
            lines.append(f"Job Description: {p['job_summary']}")
        if p.get("headline"):
            lines.append(f"LinkedIn Headline: {p['headline']}")
        if p.get("industry"):
            lines.append(f"Personal Industry: {p['industry']}")
        yoe = p.get("inferred_years_experience")
        if yoe is not None:
            lines.append(f"Years of Experience: ~{yoe}")
        if p.get("inferred_salary"):
            lines.append(f"Salary Range: {p['inferred_salary']}")
        prev = p.get("previous_companies")
        if prev and isinstance(prev, list) and len(prev) > 0:
            lines.append(f"Previous Companies: {', '.join(prev)}")
        if p.get("education_school"):
            edu = p["education_school"]
            majors = p.get("education_majors")
            degrees = p.get("education_degrees")
            if majors and isinstance(majors, list):
                edu += f" ({', '.join(majors)})"
            if degrees and isinstance(degrees, list):
                edu += f" — {', '.join(degrees)}"
            lines.append(f"University: {edu}")
        if p.get("location_name"):
            lines.append(f"Location: {p['location_name']}")
        elif p.get("location_locality"):
            loc = p["location_locality"]
            if p.get("location_region"):
                loc += f", {p['location_region']}"
            lines.append(f"Location: {loc}")
        interests = p.get("interests")
        if interests and isinstance(interests, list) and len(interests) > 0:
            lines.append(f"Interests: {', '.join(interests)}")

        return "\n".join(lines) if lines else None

    # ── Onboard Chat Edge Function Call ──────────────────────

    async def _call_onboard_chat(
        self,
        msg: IncomingMessage,
        history: list,
        message_count: int,
        onboard_url: str,
        pdl_context: str | None = None,
    ) -> None:
        try:
            payload: dict = {
                "phone": msg.sender,
                "message": msg.text,
                "history": history,
                "message_count": message_count,
                "onboard_url": onboard_url,
            }
            if pdl_context:
                payload["pdl_context"] = pdl_context

            edge_timeout = 25.0 if message_count <= 1 else 20.0
            resp = await self._http.post(
                f"{self.config.supabase_url}/functions/v1/v2-onboard-chat",
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=edge_timeout,
            )

            if resp.status_code != 200:
                logger.error("v2-onboard-chat returned %d: %s", resp.status_code, resp.text[:300])
                await send_imessage(msg.sender, "Hey, something went wrong on my end. Text me again in a sec.")
                return

            data = resp.json()
            response_text = data.get("response", "")
            if not response_text:
                logger.error("Empty response from v2-onboard-chat")
                return

            logger.info("Onboard chat response (%d chars, count=%d): %s", len(response_text), message_count, response_text[:120])
            await send_imessage(msg.sender, response_text)

        except Exception:
            logger.exception("Failed to call v2-onboard-chat for %s", msg.sender)
            await send_imessage(msg.sender, "Hey, something went wrong on my end. Text me again in a sec.")

    # ── Active User Processing ────────────────────────────────

    async def _process_active_user(self, msg: IncomingMessage, user_info: dict) -> None:
        user_id = user_info.get("user_id")
        if not user_id:
            logger.error("Active user %s has no user_id", msg.sender)
            await send_imessage(msg.sender, "Something's off with your account. Try signing in again.")
            return

        display_name = user_info.get("display_name")
        _dbg(msg.sender, "⚙️  PROCESSING ACTIVE USER")
        _dbg(msg.sender, "  user_id:      %s", user_id)
        _dbg(msg.sender, "  display_name: %s", display_name or "(none)")

        agent_start = time.monotonic()

        async with self._agent_semaphore:
            _dbg(msg.sender, "💬 Calling agent (streaming)")
            response_text = await self._forward_to_agent_streaming(msg, user_id, display_name)

        agent_elapsed = time.monotonic() - agent_start
        _dbg(msg.sender, "⏱ Agent round-trip: %.1fs", agent_elapsed)

        if response_text:
            resp_id = self._last_response_ids.get(msg.sender)
            if resp_id:
                self.state.sent_message_ids.add(resp_id)

            _dbg(msg.sender, "📤 SENDING RESPONSE (%d chars):", len(response_text))
            _dbg(msg.sender, "  %s", response_text[:500])
            if len(response_text) > 500:
                _dbg(msg.sender, "  ... (%d more chars)", len(response_text) - 500)

            sent = await send_imessage(msg.sender, response_text)

            if sent:
                logger.info("Reply sent to %s via iMessage", msg.sender)
                _dbg(msg.sender, "✅ Reply sent successfully")
            else:
                logger.error("Failed to send iMessage reply to %s", msg.sender)
                _dbg(msg.sender, "❌ FAILED to send iMessage reply")
        else:
            logger.debug("Agent returned empty response")
            _dbg(msg.sender, "⚠️ Agent returned empty response")

        _dbg(msg.sender, "=" * 70)

    # ── Agent Communication ───────────────────────────────────

    async def _forward_to_agent(
        self, msg: IncomingMessage, user_id: str, display_name: str | None = None
    ) -> str | None:
        self._last_response_ids[msg.sender] = None

        body: dict = {"user_id": user_id, "message": msg.text}
        if display_name:
            body["user_name"] = display_name

        _dbg(msg.sender, "🌐 CALLING v2-chat-service")
        req_start = time.monotonic()

        resp = await self._http.post(
            self.config.v2_chat_service_url,
            headers={
                "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )

        req_elapsed = time.monotonic() - req_start

        if resp.status_code != 200:
            logger.error("Edge function returned %d: %s", resp.status_code, resp.text[:500])
            _dbg(msg.sender, "❌ Edge function returned HTTP %d (%.1fs)", resp.status_code, req_elapsed)
            raise RuntimeError(f"v2-chat-service error: {resp.status_code}")

        _dbg(msg.sender, "🌐 RESPONSE received (HTTP %d, %.1fs)", resp.status_code, req_elapsed)

        response_text: str | None = None
        content_type = resp.headers.get("content-type", "")

        if "ndjson" in content_type:
            for line in resp.text.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "ack":
                    ack_text = event.get("text", "")
                    if ack_text:
                        _dbg(msg.sender, "⚡ ACK (legacy path): \"%s\"", ack_text)
                        await send_imessage(msg.sender, ack_text)
                elif event.get("type") == "response":
                    response_text = event.get("response", "")
                    self._last_response_ids[msg.sender] = event.get("response_id")
                    debug_info = event.get("_debug")
                    if debug_info:
                        self._log_debug_info(msg.sender, debug_info)
        else:
            data = resp.json()
            response_text = data.get("response", "")
            self._last_response_ids[msg.sender] = data.get("response_id")
            debug_info = data.get("_debug")
            if debug_info:
                self._log_debug_info(msg.sender, debug_info)

        if not response_text:
            logger.debug("Empty response from agent")
            return None

        logger.info("Agent response (%d chars): %s", len(response_text), response_text[:120])
        return response_text

    async def _forward_to_agent_streaming(
        self, msg: IncomingMessage, user_id: str, display_name: str | None = None
    ) -> str | None:
        """POST to v2-chat-service and handle NDJSON streaming.

        Streams ack immediately, returns full response text.
        Falls back to standard JSON if the response isn't NDJSON.
        """
        self._last_response_ids[msg.sender] = None

        body: dict = {"user_id": user_id, "message": msg.text}
        if display_name:
            body["user_name"] = display_name

        _dbg(msg.sender, "🌐 CALLING v2-chat-service (streaming)")
        _dbg(msg.sender, "  URL:     %s", self.config.v2_chat_service_url)
        _dbg(msg.sender, "  Payload: user_id=%s, message='%s', user_name=%s",
             user_id, msg.text[:100], display_name or "(none)")

        req_start = time.monotonic()
        response_text: str | None = None

        try:
            async with self._http.stream(
                "POST",
                self.config.v2_chat_service_url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            ) as stream:
                if stream.status_code != 200:
                    body_text = ""
                    async for chunk in stream.aiter_text():
                        body_text += chunk
                    _dbg(msg.sender, "❌ Edge function returned HTTP %d (%.1fs)", stream.status_code, time.monotonic() - req_start)
                    raise RuntimeError(f"v2-chat-service error: {stream.status_code}")

                content_type = stream.headers.get("content-type", "")
                is_ndjson = "ndjson" in content_type

                if is_ndjson:
                    buffer = ""
                    async for chunk in stream.aiter_text():
                        buffer += chunk
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                event = json.loads(line)
                            except json.JSONDecodeError:
                                logger.warning("Bad NDJSON line: %s", line[:200])
                                continue

                            event_type = event.get("type")

                            if event_type == "ack":
                                ack_text = event.get("text", "")
                                if ack_text:
                                    _dbg(msg.sender, "⚡ ACK received: \"%s\" (%.1fs)", ack_text, time.monotonic() - req_start)
                                    await send_imessage(msg.sender, ack_text)

                            elif event_type == "response":
                                response_text = event.get("response", "")
                                self._last_response_ids[msg.sender] = event.get("response_id")
                                debug_info = event.get("_debug")
                                if debug_info:
                                    self._log_debug_info(msg.sender, debug_info)

                            elif event_type == "error":
                                logger.error("Stream error from service: %s", event.get("error"))
                else:
                    full_body = ""
                    async for chunk in stream.aiter_text():
                        full_body += chunk
                    data = json.loads(full_body)
                    response_text = data.get("response", "")
                    self._last_response_ids[msg.sender] = data.get("response_id")
                    debug_info = data.get("_debug")
                    if debug_info:
                        self._log_debug_info(msg.sender, debug_info)

        except httpx.TimeoutException:
            logger.error("v2-chat-service timed out for %s", msg.sender)
            _dbg(msg.sender, "❌ v2-chat-service TIMED OUT (%.1fs)", time.monotonic() - req_start)
            raise RuntimeError("v2-chat-service timeout")

        req_elapsed = time.monotonic() - req_start
        _dbg(msg.sender, "🌐 RESPONSE complete (%.1fs)", req_elapsed)

        if not response_text:
            logger.debug("Empty response from agent")
            return None

        logger.info("Agent response (%d chars): %s", len(response_text), response_text[:120])
        return response_text

    def _log_debug_info(self, phone: str, debug_info: dict) -> None:
        _dbg(phone, "-" * 50)
        _dbg(phone, "🧠 ORCHESTRATION DEBUG:")
        _dbg(phone, "  Source:  %s", debug_info.get("source"))
        _dbg(phone, "  Path:    %s", debug_info.get("path"))

        tools_used = debug_info.get("tools_used", [])
        if tools_used:
            _dbg(phone, "  Tools:   %s", ", ".join(tools_used))
        else:
            _dbg(phone, "  Tools:   (none)")

        timing = debug_info.get("timing", {})
        _dbg(phone, "-" * 50)
        _dbg(phone, "⏱ TIMING:")
        _dbg(phone, "  Context:       %dms", timing.get("context_ms", 0))
        _dbg(phone, "  Agent:         %dms", timing.get("agent_ms", 0))
        _dbg(phone, "  Orchestrator:  %dms", timing.get("orchestrator_latency_ms", 0))
        _dbg(phone, "  Total:         %dms", timing.get("total_ms", 0))
        _dbg(phone, "-" * 50)

    async def close(self) -> None:
        for task in self._active_tasks:
            task.cancel()
        if self._active_tasks:
            await asyncio.gather(*self._active_tasks, return_exceptions=True)
        await self._http.aclose()
