#!/bin/bash
# Comprehensive test suite for Responses API migration

SUPABASE_URL="https://ynoidbjupfcaaymzbtic.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlub2lkYmp1cGZjYWF5bXpidGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTEyODYyMiwiZXhwIjoyMDg2NzA0NjIyfQ.RHDlgzWK6V_zUa3zkTtfSGWdI24kqHpRZY9iY_tFOeU"
USER_ID="0aa8cc36-4759-4178-aaca-299e3beae5aa"
ENDPOINT="${SUPABASE_URL}/functions/v1/v2-chat-service"

call_agent() {
  local label="$1"
  local message="$2"
  local start_ms=$(python3 -c "import time; print(int(time.time()*1000))")
  
  local result=$(curl -s -X POST "$ENDPOINT" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"${USER_ID}\",\"message\":\"${message}\",\"user_name\":\"Tom Lidgett\",\"source\":\"imessage\"}" \
    --max-time 120)
  
  local end_ms=$(python3 -c "import time; print(int(time.time()*1000))")
  local elapsed=$(( end_ms - start_ms ))
  
  # Handle both streaming (newline-delimited JSON) and regular JSON
  local parsed=$(echo "$result" | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
# Try parsing as regular JSON first
try:
    d = json.loads(raw)
    resp = d.get('response', '<EMPTY>')
    path = d.get('_debug', {}).get('path', '?')
    tools = ','.join(d.get('_debug', {}).get('tools_used', []))
    model = d.get('_debug', {}).get('model', '?')
except:
    # Try streaming format (newline-delimited JSON)
    resp = '<EMPTY>'
    path = '?'
    tools = ''
    model = '?'
    for line in raw.split('\n'):
        line = line.strip()
        if not line: continue
        try:
            d = json.loads(line)
            if d.get('type') == 'response':
                resp = d.get('response', '<EMPTY>')
                path = d.get('_debug', {}).get('path', '?')
                tools = ','.join(d.get('_debug', {}).get('tools_used', []))
                model = d.get('_debug', {}).get('model', '?')
        except: pass

empty = 'YES' if resp == '<EMPTY>' or not resp else 'NO'
print(f'PATH={path}')
print(f'MODEL={model}')
print(f'TOOLS={tools}')
print(f'EMPTY={empty}')
print(f'RESP={resp[:200]}')
" 2>/dev/null)
  
  local path=$(echo "$parsed" | grep '^PATH=' | cut -d= -f2-)
  local model=$(echo "$parsed" | grep '^MODEL=' | cut -d= -f2-)
  local tools=$(echo "$parsed" | grep '^TOOLS=' | cut -d= -f2-)
  local is_empty=$(echo "$parsed" | grep '^EMPTY=' | cut -d= -f2-)
  local response_text=$(echo "$parsed" | grep '^RESP=' | cut -d= -f2-)
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: $label"
  echo "  Message:  $message"
  echo "  Latency:  ${elapsed}ms"
  echo "  Path:     $path"
  echo "  Tools:    $tools"
  echo "  Empty:    $is_empty"
  echo "  Response: $response_text"
  echo ""
}

echo "╔══════════════════════════════════════════════════════╗"
echo "║  RESPONSES API TEST SUITE v2                         ║"
echo "║  $(date)                                              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

echo "═══ BATCH 1: CASUAL / GREETINGS / ACKS ═══"
call_agent "Greeting: Hey" "Hey"
call_agent "Ack: Thanks" "Thanks!"
call_agent "Ack: Lol" "Lol"
call_agent "Casual: How are you" "How are you going?"

echo ""
echo "═══ BATCH 2: SINGLE TOOL CALLS ═══"
call_agent "Calendar: Today" "What's on my calendar today?"
call_agent "Email: Search" "Any emails from tom@lidgett.net recently?"
call_agent "Web Search: News" "What's happening in global news today?"
call_agent "Weather" "What's the weather like?"

echo ""
echo "═══ BATCH 3: MULTI-TOOL CALLS ═══"
call_agent "Multi: News + Email" "Summarise the latest global news and draft a summary email to tom@lidgett.net"
call_agent "Multi: Calendar + Weather" "What's on my calendar tomorrow and what will the weather be like?"

echo ""
echo "═══ TEST COMPLETE ═══"
