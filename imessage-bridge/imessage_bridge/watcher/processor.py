"""Process new iMessages: check user status, onboard new users, forward to V2 agent."""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time

import httpx

from ..config import Config
from ..sender.imessage import send_imessage, send_reaction
from ..state import BridgeState
from .chat_db import IncomingMessage, fetch_new_messages, get_group_participants

logger = logging.getLogger("imessage_bridge.watcher.processor")
_debug_logger = logging.getLogger("imessage_bridge.debug")

_MAX_BACKOFF = 30.0
_backoff = 0.0

# Phone number to enable deep debug logging for
_DEBUG_PHONE = "+61414187820"


def _dbg(phone: str, msg: str, *args: object) -> None:
    """Print rich debug output only for the target phone number."""
    if phone != _DEBUG_PHONE:
        return
    formatted = msg % args if args else msg
    _debug_logger.info("🔍 %s", formatted)

_SEND_COOLDOWN_SECONDS = 0.1
_INTER_MESSAGE_DELAY = 1.0

_JUNK_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^https?://\S+$"),
    re.compile(r"missed a call", re.IGNORECASE),
    re.compile(r"didn't leave a message", re.IGNORECASE),
    # Liked / Loved are handled by _transform_tapback() — NOT junk
    re.compile(r"^Laughed at\s+\"", re.IGNORECASE),
    re.compile(r"^Emphasised\s+\"", re.IGNORECASE),
    re.compile(r"^Emphasized\s+\"", re.IGNORECASE),
    re.compile(r"^Disliked\s+\"", re.IGNORECASE),
    re.compile(r"^Questioned\s+\"", re.IGNORECASE),
]

# Tapback reactions that signal agreement / confirmation.
# iMessage sends them as: Liked "original message text"
_TAPBACK_CONFIRM_RE = re.compile(
    r"^(?:Liked|Loved)\s+\"(.+?)\"$", re.IGNORECASE | re.DOTALL
)


def _transform_tapback(text: str) -> str | None:
    """Convert a Liked/Loved tapback into a real message for the agent.

    If the quoted (reacted-to) message contains a question, treat the
    tapback as a confirmation: "Yes, go ahead".
    If it doesn't contain a question, return None (ignore it — it's
    just an acknowledgment, not actionable).
    """
    m = _TAPBACK_CONFIRM_RE.match(text.strip())
    if not m:
        return None
    quoted = m.group(1).strip()
    # The quoted text is from Nest's message. If it contained a question
    # the user is saying "yes" by liking it.
    if "?" in quoted:
        return f"Yes, go ahead. [reacted to: \"{quoted}\"]"
    return None

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

# These look casual but are often confirmations for pending actions
# (e.g. "yes" after "want me to send it?"). Route through agent so
# the model can see conversation history and act on them.
_NEVER_CASUAL = {
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "k", "kk",
    "do it", "go ahead", "send", "send it", "go for it", "confirm",
    "?", "??", "???",
}

_ACK_FALLBACKS = [
    "One sec.",
    "Checking now.",
    "Let me look into that.",
    "On it.",
    "Looking into it.",
]

# Patterns that indicate the user is talking to Nest in a group chat.
# Case-insensitive. Checked against the start of the message.
_NEST_MENTION_PREFIX: list[re.Pattern[str]] = [
    re.compile(r"^@?nest\b[,:]?\s*", re.IGNORECASE),
    re.compile(r"^hey nest\b[,:]?\s*", re.IGNORECASE),
    re.compile(r"^yo nest\b[,:]?\s*", re.IGNORECASE),
]

_NEST_MENTION_SUFFIX: list[re.Pattern[str]] = [
    re.compile(r"[,;]?\s+@?nest[.!?\s]*$", re.IGNORECASE),
]

_NEST_MENTION_ANYWHERE = re.compile(r"(?:^|\s)@nest(?:\s|$)", re.IGNORECASE)


def _extract_nest_mention(text: str) -> str | None:
    """If the message is addressed to Nest, return the text with the mention stripped.

    Returns None if Nest is not mentioned (message should be ignored in group chats).
    Handles: "nest do X", "hey nest do X", "do X nest", "do X @nest", "@nest do X"
    """
    # 1. Prefix patterns: "nest ...", "hey nest ...", "@nest ..."
    for pattern in _NEST_MENTION_PREFIX:
        m = pattern.match(text)
        if m:
            remainder = text[m.end():].strip()
            return remainder if remainder else text.strip()

    # 2. Suffix patterns: "... nest", "... @nest"
    for pattern in _NEST_MENTION_SUFFIX:
        m = pattern.search(text)
        if m:
            remainder = text[:m.start()].strip()
            return remainder if remainder else text.strip()

    # 3. @nest anywhere mid-sentence
    m = _NEST_MENTION_ANYWHERE.search(text)
    if m:
        remainder = (text[:m.start()] + " " + text[m.end():]).strip()
        return remainder if remainder else text.strip()

    return None


def _is_junk_message(text: str) -> bool:
    return any(p.search(text) for p in _JUNK_PATTERNS)


_VALID_SENDER_RE = re.compile(r"^\+?\d[\d\s\-()]{6,}$")

def _is_blocked_sender(sender: str) -> bool:
    """Block Apple Business Chat, short codes, and non-mobile identifiers."""
    if not sender:
        return True
    if sender.startswith("urn:biz:"):
        return True
    if sender.startswith("mailto:"):
        return True
    s = sender.strip()
    if s.startswith("+") or s[0].isdigit():
        digits = re.sub(r"\D", "", s)
        if len(digits) < 7:
            return True
        return False
    if "@" in s:
        return False
    return True


def _is_casual(text: str) -> bool:
    raw = text.lower().strip()
    # "?" messages mean "I don't understand" — always route through full agent
    if raw in ("?", "??", "???"):
        return False
    cleaned = raw.rstrip("!?.").strip()
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


# ── User status cache (avoids hitting Supabase on every message) ──

class _UserCache:
    """In-memory cache of imessage_users lookups. TTL-based."""

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


_GROUP_BUFFER_MAX = 30
_GROUP_BUFFER_TTL = 3600.0  # 1 hour


class _GroupChatBuffer:
    """In-memory rolling buffer of recent messages per group chat."""

    def __init__(self, max_messages: int = _GROUP_BUFFER_MAX, ttl: float = _GROUP_BUFFER_TTL) -> None:
        self._buffers: dict[str, list[dict]] = {}
        self._last_activity: dict[str, float] = {}
        self._max = max_messages
        self._ttl = ttl

    def append(self, chat_guid: str, role: str, content: str, sender_name: str | None = None) -> None:
        self._evict_stale()
        if chat_guid not in self._buffers:
            self._buffers[chat_guid] = []
        entry: dict = {"role": role, "content": content}
        if sender_name:
            entry["name"] = sender_name
        self._buffers[chat_guid].append(entry)
        if len(self._buffers[chat_guid]) > self._max:
            self._buffers[chat_guid] = self._buffers[chat_guid][-self._max:]
        self._last_activity[chat_guid] = time.monotonic()

    def get_context(self, chat_guid: str) -> list[dict]:
        self._evict_stale()
        return list(self._buffers.get(chat_guid, []))

    def _evict_stale(self) -> None:
        now = time.monotonic()
        stale = [k for k, t in self._last_activity.items() if now - t > self._ttl]
        for k in stale:
            self._buffers.pop(k, None)
            self._last_activity.pop(k, None)


# ── Chime-in detection (LLM-based) ──────────────────────────
# Instead of hardcoded patterns, uses a lightweight LLM call to decide
# if Nest should respond to a group message that didn't mention it.

_CHIME_IN_COOLDOWN = 120.0  # max 1 uninvited response per group per 2 minutes
_CHIME_IN_CHECK_COOLDOWN = 15.0  # don't call the LLM decision endpoint more than once per 15s per group
_chime_in_timestamps: dict[str, float] = {}
_chime_in_check_timestamps: dict[str, float] = {}

# Quick-reject: messages too short or clearly not for Nest
_CHIME_IN_SKIP = re.compile(
    r"^(?:lol|haha+|lmao|lmfao|nice|ok|okay|k|kk|yep|yea|yeah|nah|nope|true|same|omg|wtf|bruh|oof|rip|bet|fr|ikr|smh|tbh|ngl|idk|imo|fyi|gg|ez|w|l|f|dead|mood|slay|word|damn|dang|wow|ooh|ahh|hmm|mhm|hm|ye|ya|no|yes|cheers|thanks|thx|ty|np|sure|aight|ight|facts|cap|nocap|lowkey|highkey|sus|valid|based|lit|fire|goat|simp|vibe|vibes|salty|toxic|cringe|pog|sheesh|bussin|fam|bro|dude|mate|cunt|legend|sick|wicked|mint|ace|top|class)[\s!?.]*$",
    re.IGNORECASE,
)


# ── Group Participant Tracker ─────────────────────────────────

class _GroupParticipantTracker:
    """Tracks known groups and triggers participant discovery + enrichment."""

    def __init__(self, config: Config, http: httpx.AsyncClient) -> None:
        self._config = config
        self._http = http
        self._known_groups: dict[str, float] = {}      # chat_guid -> last_scan_time
        self._known_participants: dict[str, set[str]] = {}  # chat_guid -> phone set
        self._scan_interval = 3600.0  # re-scan participants every hour

    async def on_group_message(self, chat_guid: str, sender: str) -> None:
        """Called for every group message. Discovers participants if needed."""
        now = time.monotonic()

        if chat_guid not in self._known_participants:
            self._known_participants[chat_guid] = set()
        sender_is_new = sender not in self._known_participants[chat_guid]
        self._known_participants[chat_guid].add(sender)

        # Full participant scan if new group or hourly interval elapsed
        should_scan = (
            chat_guid not in self._known_groups
            or now - self._known_groups.get(chat_guid, 0) > self._scan_interval
        )

        if should_scan:
            participants = get_group_participants(
                self._config.chat_db_path, chat_guid
            )
            new_phones = set(participants) - self._known_participants.get(chat_guid, set())
            self._known_participants[chat_guid] = set(participants)
            self._known_participants[chat_guid].add(sender)  # sender might not be in chat_handle_join yet
            self._known_groups[chat_guid] = now

            if participants:
                asyncio.create_task(
                    self._sync_participants(chat_guid, list(self._known_participants[chat_guid]))
                )
                logger.info(
                    "Group scan: %d participants for %s (%d new)",
                    len(participants), chat_guid[:20], len(new_phones),
                )
        elif sender_is_new:
            # New sender discovered via messaging
            asyncio.create_task(self._sync_participants(chat_guid, [sender]))

    async def _sync_participants(self, chat_guid: str, phones: list[str]) -> None:
        """POST participant phones to v2-group-sync edge function."""
        try:
            resp = await self._http.post(
                f"{self._config.supabase_url}/functions/v1/v2-group-sync",
                headers={
                    "Authorization": f"Bearer {self._config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"chat_guid": chat_guid, "phones": phones},
                timeout=15.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    "Group sync: %d new, %d existing, %d enriched",
                    data.get("new_prospects", 0),
                    data.get("existing_prospects", 0),
                    data.get("enriched", 0),
                )
            else:
                logger.warning("v2-group-sync returned %d: %s", resp.status_code, resp.text[:200])
        except Exception:
            logger.warning("Failed to sync group participants (non-blocking)", exc_info=True)


class MessageProcessor:
    """Watches for new iMessages and routes them based on user status."""

    def __init__(self, config: Config, state: BridgeState) -> None:
        self.config = config
        self.state = state
        self._http = httpx.AsyncClient(timeout=180.0)
        self._processing = False
        self._last_send_time: float = 0.0
        self._group_buffer = _GroupChatBuffer()
        self._user_cache = _UserCache(ttl=15.0)
        self._participant_tracker = _GroupParticipantTracker(config, self._http)

    async def _should_nest_respond(self, text: str, chat_guid: str) -> bool:
        """Ask the LLM whether Nest should respond to an unmentioned group message."""
        now = time.monotonic()

        # Rate limit: don't check too often per group
        last_check = _chime_in_check_timestamps.get(chat_guid, 0)
        if now - last_check < _CHIME_IN_CHECK_COOLDOWN:
            return False

        # Cooldown: don't respond too often per group
        last_respond = _chime_in_timestamps.get(chat_guid, 0)
        if now - last_respond < _CHIME_IN_COOLDOWN:
            return False

        # Quick-reject obvious non-triggers
        if _CHIME_IN_SKIP.match(text.strip()):
            return False

        # Too short to be worth an LLM call
        if len(text.strip()) < 5:
            return False

        _chime_in_check_timestamps[chat_guid] = now

        try:
            context = self._group_buffer.get_context(chat_guid)
            resp = await self._http.post(
                self.config.v2_group_should_respond_url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"messages": context[-8:], "current_message": text},
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("respond", False)
            logger.warning("v2-group-should-respond returned %d", resp.status_code)
            return False
        except Exception:
            logger.warning("LLM chime-in check failed (non-blocking)", exc_info=True)
            return False

    async def on_chat_db_changed(self) -> None:
        global _backoff

        if self._processing:
            logger.debug("Already processing, skipping overlapping trigger")
            return

        elapsed = time.monotonic() - self._last_send_time
        if elapsed < _SEND_COOLDOWN_SECONDS:
            logger.debug("Cooldown active (%.1fs ago), skipping FS event", elapsed)
            return

        self._processing = True
        try:
            # Multi-user mode: fetch from all senders (target_phone=None)
            messages = fetch_new_messages(
                chat_db_path=self.config.chat_db_path,
                target_phone=None,
                last_rowid=self.state.last_rowid,
            )

            for i, msg in enumerate(messages):
                if msg.guid in self.state.processed_guids:
                    self.state.last_rowid = max(self.state.last_rowid, msg.rowid)
                    continue

                # Tapback reactions: Liked/Loved on a question → confirmation
                tapback_result = _transform_tapback(msg.text)
                if tapback_result is not None:
                    logger.info("Tapback confirmation [ROWID %d]: %s → %s", msg.rowid, msg.text[:80], tapback_result)
                    msg = IncomingMessage(
                        rowid=msg.rowid, guid=msg.guid, text=tapback_result,
                        sender=msg.sender, timestamp=msg.timestamp,
                        is_group=msg.is_group, chat_guid=msg.chat_guid,
                    )
                elif _TAPBACK_CONFIRM_RE.match(msg.text.strip()):
                    # Liked/Loved on a non-question — just an acknowledgment, skip it
                    logger.debug("Skipping non-question tapback [ROWID %d]: %s", msg.rowid, msg.text[:80])
                    self.state.last_rowid = msg.rowid
                    self.state.processed_guids.add(msg.guid)
                    self.state.save()
                    continue

                if _is_junk_message(msg.text):
                    logger.debug("Skipping junk [ROWID %d]: %s", msg.rowid, msg.text[:80])
                    self.state.last_rowid = msg.rowid
                    self.state.processed_guids.add(msg.guid)
                    self.state.save()
                    continue

                if _is_blocked_sender(msg.sender):
                    logger.debug("Blocked sender [ROWID %d]: %s", msg.rowid, msg.sender)
                    self.state.last_rowid = msg.rowid
                    self.state.processed_guids.add(msg.guid)
                    self.state.save()
                    continue

                logger.info(
                    "New iMessage [ROWID %d] from %s%s: %s",
                    msg.rowid, msg.sender,
                    " (GROUP)" if msg.is_group else "",
                    msg.text[:120],
                )
                _dbg(msg.sender, "=" * 70)
                _dbg(msg.sender, "📨 INCOMING MESSAGE")
                _dbg(msg.sender, "  ROWID: %d | GUID: %s", msg.rowid, msg.guid)
                _dbg(msg.sender, "  From:  %s", msg.sender)
                _dbg(msg.sender, "  Group: %s (chat_guid=%s)", msg.is_group, msg.chat_guid or "N/A")
                _dbg(msg.sender, "  Text:  %s", msg.text)
                _dbg(msg.sender, "-" * 70)

                # Group chat: always buffer the message for context,
                # track participants, and check for mention or chime-in
                is_chime_in = False
                if msg.is_group:
                    if msg.chat_guid:
                        sender_label = msg.sender
                        cached = self._user_cache.get(msg.sender)
                        if cached and cached.get("display_name"):
                            sender_label = cached["display_name"]
                        self._group_buffer.append(msg.chat_guid, "user", msg.text, sender_name=sender_label)

                        # Track participants (async, non-blocking)
                        asyncio.create_task(
                            self._participant_tracker.on_group_message(msg.chat_guid, msg.sender)
                        )

                    stripped = _extract_nest_mention(msg.text)
                    if stripped is None:
                        # No explicit mention — ask LLM if Nest should respond
                        if msg.chat_guid and await self._should_nest_respond(msg.text, msg.chat_guid):
                            _chime_in_timestamps[msg.chat_guid] = time.monotonic()
                            is_chime_in = True
                            logger.info("LLM chime-in triggered for group %s: %s", (msg.chat_guid or "")[:20], msg.text[:80])
                            _dbg(msg.sender, "🗣️ LLM decided Nest should respond (uninvited)")
                        else:
                            _dbg(msg.sender, "💤 Group message, Nest not needed — buffered for context")
                            self.state.last_rowid = msg.rowid
                            self.state.processed_guids.add(msg.guid)
                            self.state.save()
                            continue
                    else:
                        _dbg(msg.sender, "🏷️ Nest mentioned in group, stripped text: %s", stripped[:100])
                        msg = IncomingMessage(
                            rowid=msg.rowid,
                            guid=msg.guid,
                            text=stripped,
                            sender=msg.sender,
                            timestamp=msg.timestamp,
                            is_group=msg.is_group,
                            chat_guid=msg.chat_guid,
                        )

                if i > 0:
                    await asyncio.sleep(_INTER_MESSAGE_DELAY)

                try:
                    # Look up user status for this sender
                    user_info = await self._get_user_info(msg.sender)

                    _dbg(msg.sender, "👤 USER LOOKUP: %s",
                         f"status={user_info['status']}, user_id={user_info.get('user_id', 'N/A')}, name={user_info.get('display_name', 'N/A')}"
                         if user_info else "NOT FOUND (new user)")

                    if msg.is_group:
                        # Group chats: respond to anyone who mentions Nest,
                        # regardless of whether they have a Nest account.
                        # Use their user_id if they're active, otherwise a
                        # placeholder — the edge function skips all private
                        # context for group messages anyway.
                        group_user_id = (user_info or {}).get("user_id") or "group-anonymous"
                        group_display = (user_info or {}).get("display_name") or msg.sender
                        group_info = {"user_id": group_user_id, "display_name": group_display, "_is_chime_in": is_chime_in}
                        _dbg(msg.sender, "👥 Group route → _process_active_user() (user_id=%s, chime_in=%s)", group_user_id, is_chime_in)
                        await self._process_active_user(msg, group_info)
                    elif user_info is None:
                        _dbg(msg.sender, "🆕 Routing → _onboard_new_user()")
                        await self._onboard_new_user(msg)
                    elif user_info["status"] == "pending" or user_info["status"] == "onboarding":
                        _dbg(msg.sender, "📋 Routing → _continue_onboarding()")
                        await self._continue_onboarding(msg, user_info)
                    elif user_info["status"] == "active":
                        _dbg(msg.sender, "✅ Routing → _process_active_user()")
                        await self._process_active_user(msg, user_info)
                    else:
                        logger.warning("Unknown user status: %s", user_info["status"])

                    _backoff = 0.0
                except Exception:
                    logger.exception("Failed to process message %s", msg.guid)
                    _backoff = min(_backoff * 2 or 1.0, _MAX_BACKOFF)
                    logger.info("Backing off %.1fs before next attempt", _backoff)
                    await asyncio.sleep(_backoff)
                    continue

                self.state.last_rowid = msg.rowid
                self.state.processed_guids.add(msg.guid)
                self.state.save()
        finally:
            self._processing = False

    # ── User Lookup ───────────────────────────────────────────

    async def _get_user_info(self, phone: str) -> dict | None:
        """Look up a phone number in imessage_users. Returns None if not found."""
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

            # Not found
            self._user_cache.set(phone, {"_exists": False})
            return None
        except Exception:
            logger.exception("Failed to look up user %s", phone)
            return None

    # ── New User Onboarding ───────────────────────────────────

    async def _check_group_prospect(self, phone: str) -> bool:
        """Check if this phone number has interacted with Nest in any group chat."""
        try:
            resp = await self._http.get(
                f"{self.config.supabase_url}/rest/v1/group_prospects",
                params={
                    "phone_number": f"eq.{phone}",
                    "select": "id,interaction_count",
                    "limit": "1",
                },
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return len(data) > 0 and (data[0].get("interaction_count", 0) > 0)
        except Exception:
            logger.debug("Group prospect check failed (non-blocking)")
        return False

    async def _onboard_new_user(self, msg: IncomingMessage) -> None:
        """Create a new imessage_users entry and start the conversational onboarding."""
        logger.info("New user detected: %s", msg.sender)

        # Check if this person was seen in a group chat (for transition messaging)
        from_group = await self._check_group_prospect(msg.sender)
        if from_group:
            logger.info("New user %s previously interacted in a group chat", msg.sender)

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
        await self._call_onboard_chat(msg, history=[], message_count=1, onboard_url=onboard_url, from_group=from_group)

    # ── Continue Onboarding Conversation ─────────────────────

    async def _continue_onboarding(self, msg: IncomingMessage, user_info: dict) -> None:
        """Continue the pre-signup conversation, or route to active if they signed up."""
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
        """Convert a cached PDL profile dict into a context string for the LLM."""
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
        from_group: bool = False,
    ) -> None:
        """Call v2-onboard-chat and send the response."""
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
            if from_group:
                payload["from_group"] = True

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
                self._last_send_time = time.monotonic()
                return

            data = resp.json()
            response_text = data.get("response", "")
            if not response_text:
                logger.error("Empty response from v2-onboard-chat")
                return

            logger.info("Onboard chat response (%d chars, count=%d): %s", len(response_text), message_count, response_text[:120])
            await send_imessage(msg.sender, response_text)
            self._last_send_time = time.monotonic()

        except Exception:
            logger.exception("Failed to call v2-onboard-chat for %s", msg.sender)
            await send_imessage(msg.sender, "Hey, something went wrong on my end. Text me again in a sec.")
            self._last_send_time = time.monotonic()

    # ── Contextual Acknowledgments ──────────────────────────────

    async def _generate_contextual_ack(self, message: str) -> str | None:
        """Call v2-ack edge function for a contextual acknowledgment.
        Returns None if the message is conversational and no ack is needed."""
        try:
            resp = await self._http.post(
                self.config.v2_ack_url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
                json={"message": message},
                timeout=4.0,
            )

            if resp.status_code == 200:
                ack = resp.json().get("ack")
                if ack and isinstance(ack, str) and len(ack) < 100:
                    return ack.strip()
                return None
        except httpx.TimeoutException:
            logger.debug("Ack edge function timed out")
        except Exception:
            logger.debug("Ack edge function failed", exc_info=True)

        return None

    # ── Active User Processing ────────────────────────────────

    async def _process_active_user(self, msg: IncomingMessage, user_info: dict) -> None:
        """Process a message from an active (authenticated) user."""
        user_id = user_info.get("user_id")
        if not user_id:
            logger.error("Active user %s has no user_id", msg.sender)
            if not msg.is_group:
                await send_imessage(msg.sender, "Something's off with your account. Try signing in again.")
            return

        display_name = user_info.get("display_name")
        is_casual = _is_casual(msg.text)
        _dbg(msg.sender, "⚙️  PROCESSING ACTIVE USER")
        _dbg(msg.sender, "  user_id:      %s", user_id)
        _dbg(msg.sender, "  display_name: %s", display_name or "(none)")
        _dbg(msg.sender, "  is_casual:    %s", is_casual)
        _dbg(msg.sender, "  is_group:     %s", msg.is_group)

        agent_start = time.monotonic()

        is_chime_in = user_info.get("_is_chime_in", False)
        _dbg(msg.sender, "💬 Calling agent (streaming, chime_in=%s)", is_chime_in)
        response_text, reaction = await self._forward_to_agent_streaming(msg, user_id, display_name, is_chime_in=is_chime_in)

        agent_elapsed = time.monotonic() - agent_start
        _dbg(msg.sender, "⏱ Agent round-trip: %.1fs", agent_elapsed)

        # Tapback reactions — disabled for now, re-enable when ready
        # if reaction:
        #     _dbg(msg.sender, "👍 Sending tapback: %s", reaction)
        #     reacted = await send_reaction(msg.sender, reaction)
        #     if reacted:
        #         _dbg(msg.sender, "✅ Tapback sent: %s", reaction)
        #         await asyncio.sleep(random.uniform(0.8, 1.5))
        #     else:
        #         _dbg(msg.sender, "⚠️ Tapback failed (non-blocking): %s", reaction)
        if reaction:
            _dbg(msg.sender, "👍 Tapback decided: %s (disabled)", reaction)

        if response_text:
            resp_id = self._last_response_id
            if resp_id:
                self.state.sent_message_ids.add(resp_id)

            _dbg(msg.sender, "📤 SENDING RESPONSE (%d chars):", len(response_text))
            _dbg(msg.sender, "  %s", response_text[:500])
            if len(response_text) > 500:
                _dbg(msg.sender, "  ... (%d more chars)", len(response_text) - 500)

            # Group chats: reply to the group, not the individual
            reply_chat_guid = msg.chat_guid if msg.is_group else None
            sent = await send_imessage(msg.sender, response_text, chat_guid=reply_chat_guid)
            self._last_send_time = time.monotonic()

            # Record Nest's reply in group buffer
            if msg.is_group and msg.chat_guid:
                self._group_buffer.append(msg.chat_guid, "assistant", response_text)

            if sent:
                target = f"group {msg.chat_guid}" if msg.is_group else msg.sender
                logger.info("Reply sent to %s via iMessage", target)
                _dbg(msg.sender, "✅ Reply sent successfully")
            else:
                logger.error("Failed to send iMessage reply to %s", msg.sender)
                _dbg(msg.sender, "❌ FAILED to send iMessage reply")
        elif not reaction:
            logger.debug("Agent returned empty response")
            _dbg(msg.sender, "⚠️ Agent returned empty response")

        _dbg(msg.sender, "=" * 70)

    async def _forward_to_agent(
        self, msg: IncomingMessage, user_id: str, display_name: str | None = None
    ) -> str | None:
        """POST the message to the v2-chat-service edge function."""
        self._last_response_id: str | None = None

        body: dict = {
            "user_id": user_id,
            "message": msg.text,
        }
        if display_name:
            body["user_name"] = display_name

        _dbg(msg.sender, "🌐 CALLING v2-chat-service")
        _dbg(msg.sender, "  URL:     %s", self.config.v2_chat_service_url)
        _dbg(msg.sender, "  Payload: user_id=%s, message='%s', user_name=%s",
             user_id, msg.text[:100], display_name or "(none)")

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
            logger.error(
                "Edge function returned %d: %s",
                resp.status_code, resp.text[:500],
            )
            _dbg(msg.sender, "❌ Edge function returned HTTP %d (%.1fs)", resp.status_code, req_elapsed)
            _dbg(msg.sender, "  Body: %s", resp.text[:500])
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
                        ack_guid = msg.chat_guid if msg.is_group else None
                        await send_imessage(msg.sender, ack_text, chat_guid=ack_guid)
                elif event.get("type") == "response":
                    response_text = event.get("response", "")
                    self._last_response_id = event.get("response_id")
                    debug_info = event.get("_debug")
                    if debug_info:
                        self._log_debug_info(msg.sender, debug_info)
        else:
            data = resp.json()
            response_text = data.get("response", "")
            self._last_response_id = data.get("response_id")
            debug_info = data.get("_debug")
            if debug_info:
                self._log_debug_info(msg.sender, debug_info)

        if not response_text:
            logger.debug("Empty response from agent")
            _dbg(msg.sender, "⚠️ Empty response text from agent")
            return None

        logger.info("Agent response (%d chars): %s", len(response_text), response_text[:120])
        return response_text

    async def _forward_to_agent_streaming(
        self, msg: IncomingMessage, user_id: str, display_name: str | None = None,
        *, is_chime_in: bool = False,
    ) -> tuple[str | None, str | None]:
        """POST to v2-chat-service and handle NDJSON streaming.

        Returns (response_text, reaction) where reaction is a tapback type
        like "love", "like", "laugh", etc. or None.
        """
        self._last_response_id = None

        body: dict = {"user_id": user_id, "message": msg.text}
        if display_name:
            body["user_name"] = display_name
        if msg.is_group:
            body["is_group"] = True
            body["sender_phone"] = msg.sender
            if is_chime_in:
                body["is_chime_in"] = True
            if msg.chat_guid:
                body["chat_guid"] = msg.chat_guid
                group_ctx = self._group_buffer.get_context(msg.chat_guid)
                if group_ctx:
                    body["group_context"] = group_ctx

        _dbg(msg.sender, "🌐 CALLING v2-chat-service (streaming)")
        _dbg(msg.sender, "  URL:     %s", self.config.v2_chat_service_url)
        _dbg(msg.sender, "  Payload: user_id=%s, message='%s', user_name=%s, is_group=%s, group_ctx=%d msgs",
             user_id, msg.text[:100], display_name or "(none)", msg.is_group,
             len(body.get("group_context", [])))

        req_start = time.monotonic()

        response_text: str | None = None
        reaction: str | None = None

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
                    _dbg(msg.sender, "  Body: %s", body_text[:500])
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
                                    ack_guid = msg.chat_guid if msg.is_group else None
                                    await send_imessage(msg.sender, ack_text, chat_guid=ack_guid)
                                    self._last_send_time = time.monotonic()

                            elif event_type == "response":
                                response_text = event.get("response", "")
                                reaction = event.get("reaction")
                                self._last_response_id = event.get("response_id")
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
                    reaction = data.get("reaction")
                    self._last_response_id = data.get("response_id")
                    debug_info = data.get("_debug")
                    if debug_info:
                        self._log_debug_info(msg.sender, debug_info)

        except httpx.TimeoutException:
            logger.error("v2-chat-service timed out for %s", msg.sender)
            _dbg(msg.sender, "❌ v2-chat-service TIMED OUT (%.1fs)", time.monotonic() - req_start)
            raise RuntimeError("v2-chat-service timeout")

        req_elapsed = time.monotonic() - req_start
        _dbg(msg.sender, "🌐 RESPONSE complete (%.1fs)", req_elapsed)

        if not response_text and not reaction:
            logger.debug("Empty response from agent")
            _dbg(msg.sender, "⚠️ Empty response text from agent")
            return None, None

        logger.info("Agent response (%d chars, reaction=%s): %s",
                     len(response_text or ""), reaction, (response_text or "")[:120])
        return response_text, reaction

    def _log_debug_info(self, phone: str, debug_info: dict) -> None:
        """Log orchestration debug info."""
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
        await self._http.aclose()
