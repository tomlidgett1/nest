#!/usr/bin/env python3
"""Test calendar_lookup: ask Nest about Blacklane calendar events to verify all calendars are queried."""

import os
import sys
import time
import json as jsonlib

# Load env from imessage-bridge
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "imessage-bridge"))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "imessage-bridge", ".env"))
except ImportError:
    pass

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ynoidbjupfcaaymzbtic.supabase.co")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Set it in imessage-bridge/.env or environment.")
    sys.exit(1)

FUNCTIONS_URL = f"{SUPABASE_URL}/functions/v1/v2-chat-service"
HEADERS = {
    "Authorization": f"Bearer {SERVICE_KEY}",
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
}


def get_user_id() -> str:
    """Find user_id for tom@lidgett.net from user_google_accounts."""
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/user_google_accounts",
        params={"google_email": "eq.tom@lidgett.net", "select": "user_id"},
        headers=HEADERS,
        timeout=10,
    )
    if resp.status_code != 200:
        print(f"Failed to query user_google_accounts: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)
    data = resp.json()
    if not data:
        print("No user found for tom@lidgett.net")
        sys.exit(1)
    return data[0]["user_id"]


def call_chat(user_id: str, message: str) -> dict:
    """Call v2-chat-service and return full parsed response."""
    body = {
        "user_id": user_id,
        "message": message,
        "channel": "imessage",
    }
    start = time.perf_counter()
    resp = httpx.post(FUNCTIONS_URL, json=body, headers=HEADERS, timeout=120)
    elapsed = time.perf_counter() - start

    print(f"\n  Status: {resp.status_code} | Latency: {elapsed:.2f}s")

    if resp.status_code != 200:
        print(f"  Error: {resp.text[:500]}")
        return {}

    content_type = resp.headers.get("content-type", "")
    events = []

    if "ndjson" in content_type:
        for line in resp.text.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = jsonlib.loads(line)
            except jsonlib.JSONDecodeError:
                continue
            events.append(event)
            event_type = event.get("type", "unknown")
            if event_type == "ack":
                print(f"  Ack: {event.get('text', '')[:200]}")
            elif event_type == "response":
                print(f"  Response: {event.get('response', '')[:1000]}")
            elif event_type == "tool_result":
                print(f"  Tool: {event.get('tool', '')} -> {jsonlib.dumps(event.get('result', ''))[:500]}")
            else:
                print(f"  [{event_type}]: {jsonlib.dumps(event)[:300]}")
    else:
        data = resp.json()
        print(f"  Response: {jsonlib.dumps(data, indent=2)[:2000]}")

    return {"events": events}


def main():
    print("=" * 60)
    print("Calendar Debug Test - Checking Blacklane calendar")
    print("=" * 60)

    user_id = get_user_id()
    print(f"User ID: {user_id[:8]}...")

    tests = [
        "What events do I have on my Blacklane calendar this week?",
        "List all my calendars and what events are on each one today",
    ]

    for msg in tests:
        print(f"\n{'─' * 50}")
        print(f"Message: {msg}")
        call_chat(user_id, msg)
        time.sleep(2)

    print(f"\n{'=' * 60}")
    print("Done. Check Supabase function logs for calendar listing details.")
    print("Look for lines like:")
    print('  [tools] calendar_lookup: ... has N calendars, querying M: Calendar1, Calendar2, ...')
    print("=" * 60)


if __name__ == "__main__":
    main()
