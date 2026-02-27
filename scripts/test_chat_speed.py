#!/usr/bin/env python3
"""Test v2-chat-service response speed for tom@lidgett.net. No emails sent."""

import os
import sys
import time
from typing import Optional

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
TARGET_EMAIL = "tom@lidgett.net"

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Set it in imessage-bridge/.env or environment.")
    sys.exit(1)

CHAT_URL = f"{SUPABASE_URL}/rest/v1/v2_chat_messages"
FUNCTIONS_URL = f"{SUPABASE_URL}/functions/v1/v2-chat-service"

HEADERS = {
    "Authorization": f"Bearer {SERVICE_KEY}",
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
}


def get_user_id() -> Optional[str]:
    """Find user_id for tom@lidgett.net from user_google_accounts."""
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/user_google_accounts",
        params={"google_email": f"eq.{TARGET_EMAIL}", "select": "user_id"},
        headers=HEADERS,
        timeout=10,
    )
    if resp.status_code != 200:
        print(f"Failed to query user_google_accounts: {resp.status_code} {resp.text[:200]}")
        return None
    data = resp.json()
    if not data:
        print(f"No user found for {TARGET_EMAIL} in user_google_accounts")
        return None
    return data[0]["user_id"]


import json as jsonlib


def call_chat(user_id: str, message: str) -> tuple:
    """Call v2-chat-service, return (latency_sec, ack_preview, response_preview, status_code)."""
    body = {
        "user_id": user_id,
        "message": message,
        "channel": "imessage",
    }
    start = time.perf_counter()
    resp = httpx.post(FUNCTIONS_URL, json=body, headers=HEADERS, timeout=90)
    elapsed = time.perf_counter() - start
    ack = ""
    text = ""
    if resp.status_code == 200:
        content_type = resp.headers.get("content-type", "")
        if "ndjson" in content_type:
            for line in resp.text.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    event = jsonlib.loads(line)
                except jsonlib.JSONDecodeError:
                    continue
                if event.get("type") == "ack":
                    ack = event.get("text", "")[:120]
                elif event.get("type") == "response":
                    text = event.get("response", "")[:120]
        else:
            data = resp.json()
            text = data.get("response", data.get("text", str(data)))[:120]
    else:
        text = resp.text[:120]
    return elapsed, ack, text, resp.status_code


def main():
    print("=" * 60)
    print("v2-chat-service speed test for tom@lidgett.net")
    print("=" * 60)

    user_id = get_user_id()
    if not user_id:
        sys.exit(1)
    print(f"User ID: {user_id[:8]}...")

    tests = [
        ("Casual (hey)", "hey"),
        ("Casual (what's up)", "what's up"),
        ("Static (contact card)", "what's your contact"),
        ("Agent simple (calendar)", "what's on my calendar today"),
        ("Agent tools (inbox)", "summarise my inbox"),
    ]

    print()
    for name, msg in tests:
        print(f"Test: {name}")
        print(f"  Message: {msg!r}")
        lat, ack, preview, status = call_chat(user_id, msg)
        print(f"  Latency: {lat:.2f}s | Status: {status}")
        if ack:
            print(f"  Ack: {ack}")
        if preview:
            print(f"  Response: {preview}...")
        print()
        time.sleep(1)

    print("Done.")


if __name__ == "__main__":
    main()
