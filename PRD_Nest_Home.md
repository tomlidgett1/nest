# Product Requirements Document: The Nest Home Experience

**Product:** Nest (macOS)
**Feature:** Reimagined Home Screen
**Author:** AI Product Architect
**Date:** February 2026
**Status:** Draft

---

## 1. Executive Summary

The Nest Home screen is the soul of the product. Today it is a static list — two action cards, some calendar events, some recent notes. It contains zero intelligence, zero cross-referencing, and zero awareness of what the user should be doing right now.

This PRD defines the transformation of Home into **the single surface a knowledge worker opens every morning to understand their day, prepare for their meetings, act on what matters, and never drop a ball.** It is the reason someone will say "I literally cannot work without Nest."

The core insight: Nest already has extraordinarily rich data — meeting transcripts, AI-enhanced notes, multi-account Gmail, Google Calendar, AI-extracted todos, semantic search across everything. The Home screen uses **none of it.** This PRD defines how to connect that data into an intelligent, time-aware, relationship-aware surface that no other product provides.

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Daily Home tab views per user | ~2 (launch + occasional) | 8+ (habitual check-ins throughout day) |
| Time spent on Home before navigating away | <5 seconds | 30-60 seconds (engaging with content) |
| Meeting prep actions taken from Home | 0 | 60%+ of meetings have a prep interaction |
| Todo completion rate (todos surfaced on Home) | Unknown | 40% completed within 24h of surfacing |
| Follow-up emails drafted from Home | 0 | 30%+ of meetings get follow-up from Home |
| "Could not work without" NPS qualifier | N/A | 50%+ of active users |

---

## 2. Problem Statement

### The Knowledge Worker's Daily Reality

Knowledge workers attend 5-8 meetings per day. Between meetings, they context-switch across email, todos, notes, and calendars. Critical information falls through cracks:

- **Before meetings:** They walk in unprepared. They can't remember what was discussed last time, what they promised, or what emails were exchanged since.
- **After meetings:** Action items are captured but never followed up. Follow-up emails don't get sent. Commitments rot.
- **Throughout the day:** They check email anxiously because they can't distinguish urgent from noise. Todos pile up without contextual ranking. They lose track of who needs what from them.

### Why Nest Is Uniquely Positioned

Nest already captures the three pillars of knowledge work:
1. **Conversations** (meeting transcripts + AI-enhanced notes)
2. **Communications** (multi-account Gmail with full thread history)
3. **Commitments** (AI-extracted todos from both meetings and emails)

Plus **Calendar** as the structural backbone of the day, and **Semantic Search** across all of it.

No other product has all five. The Home screen should be where these five data sources converge into a single intelligent surface.

### Current Home Screen (What Exists Today)

Located in `NotesListView.swift` at line 1358, `HomeContentView` contains:

1. Static "Home" title (28pt serif)
2. Two action cards: "New Meeting" / "New Note"
3. Pinned notes list (if any)
4. "Coming Up" — next 5 calendar events (title, time, join button)
5. "Recent" — last 5 notes (title, date, enhanced badge)
6. Floating semantic search bar at bottom (Cmd+K)

**What's wrong:**
- No todos visible on Home (only in dedicated tab)
- No email preview on Home (only in dedicated tab)
- No cross-referencing between data sources
- No time-awareness (same view at 7am and 5pm)
- No proactive suggestions or nudges
- No meeting preparation intelligence
- No post-meeting follow-up tracking
- Calendar events show zero context (just title + time)

---

## 3. Design Philosophy

### The Intelligent Desk

The Home screen should feel like arriving at a desk that a world-class executive assistant has laid out for you. Everything you need is right there — today's briefing, the files for your next meeting, the urgent emails, the things you promised people. You don't hunt for anything. It's already surfaced.

### Core Principles

1. **Time-aware:** The Home adapts throughout the day. Morning briefing at 8am. Meeting prep at 9:25 (5 minutes before a 9:30 meeting). Post-meeting follow-ups at 10:35 (after a 10:00 meeting ends). End-of-day summary at 5pm.

2. **Relationship-aware:** People are the connective tissue. When Sarah's name appears in your 2pm meeting AND in 3 unread emails AND in an overdue todo, Nest connects them. "You're seeing Sarah at 2pm — she's emailed 3 times since your last sync, and you owe her the revised deck."

3. **Cross-data intelligence:** The value is in the joins, not the rows. Calendar + Email + Notes + Todos cross-referenced together reveal insights that no single-source app can provide.

4. **Proactive, not passive:** Nest doesn't wait to be asked. It surfaces what matters, nudges when things are overdue, warns when you're about to walk into a meeting unprepared.

5. **Emotionally warm:** This is not a cold business dashboard. It's warm cream paper, serif headings, gentle olive accents, celebratory animations. It should feel like a favourite notebook, not a project management tool.

6. **Progressive disclosure:** The Home doesn't overwhelm. Compact cards with expand-on-tap. Sections that appear only when relevant (no empty states cluttering the view). Intelligence that hides until it's useful.

---

## 4. Feature Specifications

### 4.1 The Adaptive Greeting

**Priority:** P0 (ship first — sets the tone for everything)
**Effort:** Small (1-2 days)
**AI Required:** No

#### Description

Replace the static "Home" title with a dynamic, time-aware, context-aware greeting that makes the app feel alive and personal. This single element transforms the perception from "tool" to "assistant."

#### Specifications

**Time-of-day variants:**

| Time Window | Greeting Template | Example |
|-------------|-------------------|---------|
| 6am-11am | "Good morning. {meeting_count} meetings today, first at {first_meeting_time}." | "Good morning. 4 meetings today, first at 9:30." |
| 11am-2pm | "Afternoon ahead. {remaining_meetings} meetings remaining, {pending_todos} to-dos pending." | "Afternoon ahead. 2 meetings remaining, 5 to-dos pending." |
| 2pm-6pm | "Almost there. {remaining_meetings} meeting(s) left{focus_time_note}." | "Almost there. 1 meeting left, then you're clear." |
| 6pm-10pm | "Wrapping up. You handled {completed_count} items today." | "Wrapping up. You handled 11 items today." |
| Weekend | "Weekend mode. {weekend_context}." | "Weekend mode. Nothing on the books." |

**Special state overrides (take precedence):**

| State | Greeting | Condition |
|-------|----------|-----------|
| Active meeting | "Currently recording: {title}. {duration} so far." | `appState.isMeetingActive == true` |
| Long absence | "Welcome back. {new_emails} new emails, {meetings_missed} meetings happened while you were away." | Last open > 4 hours ago |
| Zero meetings today | "Meeting-free day. {pending_todos} to-dos waiting." | No calendar events today |
| All done | "Clear desk. Everything handled." | No pending todos + no remaining meetings |

**Sub-greeting line (always present below main greeting):**

Displays the single most urgent context item, prioritized:
1. Overdue todo (if any): "Overdue: {todo_title} ({days} days late)"
2. Imminent meeting (< 30 min): "Next: {meeting_title} in {minutes} minutes"
3. Next meeting today: "Next: {meeting_title} at {time}"
4. Unread email count: "{count} unread emails"
5. Fallback: "All clear."

**Visual Design:**
- Main greeting: `Theme.titleFont(28)`, `Theme.textPrimary`
- Sub-greeting: `Theme.captionFont(14)`, `Theme.textSecondary`
- Entrance animation: 300ms fade-in on first appearance per session. No animation on subsequent tab switches.

**Data Sources:**
- `calendarService.upcomingEvents` — count, next event, remaining events
- `todoRepository.fetchPendingTodos()` — count, overdue filter
- `appState.isMeetingActive`, `appState.currentMeeting`
- `gmailService.inboxThreads.filter { $0.isUnread }` — count
- `UserDefaults("lastHomeOpenTimestamp")` — for absence detection
- `Calendar.current` — day of week, time of day

**Edge Cases:**
- No calendar connected: Omit meeting references, focus on todos/emails
- No Gmail connected: Omit email references
- No todos: Omit todo count
- Brand new user (no data): "Welcome to Nest. Start by recording your first meeting."

---

### 4.2 The Momentum Meter

**Priority:** P1
**Effort:** Small (1-2 days)
**AI Required:** No

#### Description

A warm, organic visualization showing the day's progress — a horizontal strip of dots representing work items, filled as they're completed. Provides emotional feedback and a sense of momentum.

#### Specifications

**Work units tracked:**

| Unit Type | Counted As | Source |
|-----------|-----------|--------|
| Meetings attended (with notes) | 1 unit per meeting | Notes created today with `noteType == .meeting` |
| Todos completed today | 1 unit per todo | `todoRepository.fetchCompletedTodos()` filtered to today |
| Remaining meetings | 1 pending unit each | Today's calendar events not yet passed |
| Pending todos (due today or overdue) | 1 pending unit each (max 5) | `todoRepository.fetchPendingTodos()` filtered to due today or overdue |

**Visual Design:**
- Container: 40pt tall horizontal strip, full width, no card background (embedded in page)
- Dots: 8pt diameter circles, 6pt spacing
- Completed: filled `Theme.olive`
- Pending: 1pt stroke `Theme.olive.opacity(0.3)`, no fill
- Overdue: 1pt stroke `Theme.recording.opacity(0.5)` (warm red accent)
- Max dots displayed: 12. If more, show "...+{n}" text after last dot

**Textual Label (right-aligned next to dots):**

| Condition | Label |
|-----------|-------|
| Morning, nothing done | "Fresh day — {total} items ahead" |
| Some progress | "{done} of {total} items handled" |
| Good progress (>60%) | "Strong momentum — {remaining} to go" |
| All complete | "Clear desk. Well done." |
| No items at all | Hidden entirely |

**Celebration State:**
When the last pending item is completed (transition from 1 remaining → 0):
- All dots do a sequential scale-up animation (1.0 → 1.3 → 1.0) cascading left to right over 600ms
- Label transitions to "Clear desk. Well done." with 200ms fade
- Follows the existing celebration pattern from `TodoListView` (`justCompletedIds`)

**Data Sources:**
- `todoRepository.fetchPendingTodos()` — filtered by `dueDate` is today or before
- `todoRepository.fetchCompletedTodos()` — filtered by completion timestamp today
- `noteRepository.fetchAllNotes()` — filtered by `createdAt` today + `noteType == .meeting`
- `calendarService.upcomingEvents` — filtered to today, partitioned by `endDate < .now`

---

### 4.3 The Morning Briefing

**Priority:** P1
**Effort:** Medium (3-4 days)
**AI Required:** Yes (one AI call, cached)

#### Description

When the user opens Nest in the morning (or after a 4+ hour absence), a warm, conversational narrative briefing streams in — like reading a note from a personal assistant who organized your desk overnight.

#### Specifications

**Trigger Conditions:**
- First open of the day (no `lastHomeOpenTimestamp` for today)
- OR last open was > 4 hours ago
- AND current time is between 5am and 12pm (morning mode)
- Store trigger check in `UserDefaults("lastMorningBriefingDate")`

**Data Aggregation (pre-AI):**

Collect and serialize the following into a structured prompt:

```
Today's Calendar:
- 9:30-10:00: 1:1 with Sarah Chen (Google Meet)
- 11:00-12:00: Product Review with Tom, Alex, James (Zoom)
- 2:00-3:00: Engineering Standup (Google Meet)
- 4:00-4:30: Client call with Acme Corp (Teams)

Pending Todos (7 total, 2 overdue):
- OVERDUE (3 days): Send revised deck to Tom [from: Product Sync, Jan 14]
- OVERDUE (1 day): Review Sarah's proposal [from: email, Jan 16]
- Due today: Prepare agenda for Engineering Standup [manual]
- Due this week: Follow up with Acme on contract terms [from: email, Jan 15]
- (3 more without due dates)

Overnight Emails (since last open):
- 7 new unread threads
- Key senders: Sarah Chen (2), Acme Corp (3), Tom Wilson (1), Newsletter (1)
- Unread from today's meeting attendees: Sarah Chen (2), Tom Wilson (1)

Yesterday's Meetings:
- "Q1 Budget Review" (45 min, with Sarah, James) — 3 action items extracted, 1 completed
- "Design Sprint Kickoff" (30 min, with Alex) — 2 action items extracted, 0 completed
```

**AI Prompt:**

```
You are Nest, an intelligent meeting assistant. Generate a warm, concise morning briefing for the user based on the data below. Write in second person ("you"), conversational tone, 4-8 sentences. Prioritize: (1) the most important meeting today and any prep needed, (2) overdue commitments, (3) notable overnight emails. Do not list everything — highlight what matters most. End with one forward-looking sentence about the day ahead.

{serialized data}
```

**Model:** Claude Sonnet 4.5 via `AIProxyClient.shared.stream` (fast, conversational)

**Visual Design:**
- Card: `Theme.cardBackground` with 16pt padding, 12pt corner radius
- Header: Small sparkle icon + "Your Morning Briefing" in `Theme.captionFont(12)`, `Theme.textSecondary`
- Body: `Theme.bodyFont(14)`, `Theme.textPrimary`, with 1.5 line spacing
- Streaming: Text appears token-by-token (existing streaming pattern)
- Dismiss: Small "X" button top-right. Sets `UserDefaults("lastMorningBriefingDate")` to today.

**Inline Action Buttons (extracted from briefing content):**

After the briefing text, show up to 3 contextual action buttons:

| Detected Context | Button Label | Action |
|-----------------|-------------|--------|
| Meeting within 2 hours | "Join {meeting_title}" | Opens meeting URL |
| Overdue todos mentioned | "View overdue to-dos" | Navigates to Todos tab |
| Emails from specific sender mentioned | "Open {sender} emails" | Navigates to Email tab with sender filter |
| Yesterday's meeting with pending items | "Review {meeting_title}" | Navigates to note |

**Caching:**
- Briefing text cached in `NestHomeService.morningBriefing: String?`
- TTL: Until dismissed OR 3 hours, whichever comes first
- If user navigates away and returns within TTL, show cached version instantly (no re-stream)

**Edge Cases:**
- No calendar connected: Briefing focuses on todos + emails
- No Gmail connected: Briefing focuses on calendar + todos
- No data at all: Skip briefing entirely, show greeting only
- Very long absence (>24h): "Welcome back. Here's what happened since {last_date}..." with broader summary window

---

### 4.4 Meeting Intelligence Dossiers

**Priority:** P0 (highest-value feature — directly impacts meeting quality)
**Effort:** Medium-Large (4-6 days)
**AI Required:** Optional (AI Brief button only; base dossier is pure data)

#### Description

For every meeting happening in the next 2 hours, Nest auto-generates a contextual "dossier" card that cross-references three data sources: past meetings, recent emails, and outstanding commitments with the same attendees.

#### Specifications

**Trigger:** Any calendar event where `startDate` is within the next 2 hours AND has not yet ended.

**Data Collection (per meeting):**

**A. Prior Meeting History:**
```
Query: noteRepository.fetchAllNotes()
  .filter { note in
    note.noteType == .meeting &&
    note.attendees.contains(where: { event.attendeeNames.contains($0) })
  }
  .sorted(by: { $0.createdAt > $1.createdAt })
  .prefix(5)
```
Display: "{count} previous meetings with {shared_attendees}. Last: {title} ({date})"

If the most recent shared meeting has `enhancedNotes`, show first 3 lines of content as preview.

**B. Recent Email Threads:**
```
Query: gmailService.inboxThreads + gmailService.sentThreads
  .filter { thread in
    thread.messages.contains(where: { message in
      event.attendeeEmails.contains(message.fromEmail) ||
      event.attendeeEmails.intersects(message.toRecipients)
    })
  }
  .filter { $0.latestMessageDate > lastMeetingDateWithTheseAttendees }
  .sorted(by: { $0.latestMessageDate > $1.latestMessageDate })
  .prefix(5)
```
Display: "{count} email threads since your last meeting" with thread subjects listed

Highlight unread threads with olive dot.

**C. Outstanding Commitments:**
```
Query: todoRepository.fetchPendingTodos()
  .filter { todo in
    // Todo from a meeting with these attendees
    if let sourceId = todo.sourceId,
       let sourceNote = noteRepository.fetchNote(id: sourceId),
       sourceNote.attendees.intersects(event.attendeeNames) {
      return true
    }
    // Todo from an email from these attendees
    if let senderEmail = todo.senderEmail,
       event.attendeeEmails.contains(senderEmail) {
      return true
    }
    return false
  }
```
Display: "{count} open items related to this group" with titles and age

**Card States:**

**Collapsed (default for meetings >1 hour away):**
```
┌─────────────────────────────────────────────────┐
│ 📅 Product Review with Tom, Alex          in 47m │
│ 3 prior meetings · 2 email threads · 1 open item│
│                                        [Expand ▼]│
└─────────────────────────────────────────────────┘
```

**Expanded (default for meetings <30 minutes away, or on tap):**
```
┌─────────────────────────────────────────────────┐
│ 📅 Product Review                        in 12m │
│ Tom Wilson, Alex Park, James Lee                 │
│ ─────────────────────────────────────────────── │
│                                                  │
│ MEETING HISTORY                                  │
│ 3 meetings with this group                       │
│ Last: "Q1 Roadmap Sync" (Jan 14)                │
│ > Agreed on Q2 priorities. Tom to draft timeline │
│ > Budget approved at $380K with 10% contingency  │
│                                                  │
│ SINCE LAST MEETING                               │
│ 📧 Tom: "Updated timeline attached" (Jan 16)    │
│ 📧 Alex: "Design review feedback" (Jan 15) ●    │
│                                                  │
│ OPEN ITEMS                                       │
│ ⚠️ Send revised deck to Tom (3 days overdue)     │
│ ○ Review Alex's design mockups (due today)       │
│                                                  │
│ [Join Meeting]  [Record]  [AI Brief ✨]          │
└─────────────────────────────────────────────────┘
```

**AI Brief Button:**
- On tap, calls `SemanticChatService.respondStreaming()` with query: "Summarize my complete history with {attendee_names} including all meeting notes, email threads, and outstanding commitments. What should I know before meeting them today?"
- Streams response inline, replacing the manual data sections
- Uses person-aware retrieval (existing `personHint` extraction)
- Citations displayed below response (existing `SemanticCitation` pattern)

**Visual Design:**
- Card: `Theme.cardBackground`, 12pt corner radius, subtle shadow
- Time badge: Right-aligned, olive text. Changes to `Theme.recording` when < 5 minutes away.
- Section headers: `Theme.captionFont(11)`, `Theme.textTertiary`, uppercase
- Content: `Theme.bodyFont(13)`, `Theme.textPrimary`
- Overdue items: `Theme.recording` text color
- Unread email dot: `Theme.olive` filled circle, 6pt

**Edge Cases:**
- Meeting with no known attendees (external link only): Show meeting title + time + "Join" only
- First meeting with someone (no history): "First meeting with {name}. No prior history in Nest." Show any email threads as the sole context.
- Too many results: Cap at 5 prior meetings, 5 email threads, 5 todos. Show "+{n} more" link.

---

### 4.5 The People Strip

**Priority:** P2
**Effort:** Small-Medium (2-3 days)
**AI Required:** No

#### Description

A horizontal scrolling strip of people the user is engaging with today — calendar attendees and recent email contacts — making the Home feel social and relationship-driven rather than task-driven.

#### Specifications

**Population Logic:**

Build a deduplicated `[PersonContext]` array:

1. **From today's calendar:** All unique attendee names/emails from today's `calendarService.upcomingEvents`
2. **From recent emails (48h):** Unique senders from `gmailService.inboxThreads` where `isUnread == true`
3. **Merge by email address** (deduplicate)
4. **Exclude the user themselves** (match against `gmailService.accounts.map { $0.email }`)

**PersonContext model:**
```swift
struct PersonContext {
    let name: String
    let email: String
    let avatarURL: URL?           // Company logo from domain
    let meetingCount: Int         // Total notes with this person in attendees
    let emailThreadCount: Int     // Total threads involving this person
    let unreadCount: Int          // Unread threads from this person
    let lastInteraction: String   // "Met 2 days ago" or "Emailed yesterday"
    let nextMeeting: String?      // "Today at 2pm" if in today's calendar
    let openTodoCount: Int        // Pending todos related to this person
}
```

**Sort Order:**
1. People with upcoming meetings today (sorted by meeting time)
2. People with unread emails (sorted by unread count desc)
3. Others (sorted by total interaction count desc)

**Visual Design:**

Each person pill:
```
┌──────────────────┐
│  [Logo]  Sarah C │
│  ● 2 unread      │
│  Meeting at 2pm  │
└──────────────────┘
```

- Pill: 120pt wide, 72pt tall, `Theme.cardBackground`, 10pt corner radius
- Avatar: 28pt circle, company logo via `https://logo.clearbit.com/{domain}` or initials in olive circle
- Name: `Theme.bodyFont(13)`, `.medium`, `Theme.textPrimary`, truncated to first name + last initial
- Badge line: `Theme.captionFont(11)`, `Theme.textSecondary`
- Unread dot: 6pt `Theme.olive` circle
- Horizontal scroll: `.scrollIndicators(.hidden)`, 8pt item spacing, 16pt leading/trailing inset

**Tap Action:**
Opens a person-focused popover or sheet showing:
- Full name and email
- Meeting history: list of notes involving them (last 10)
- Email history: threads with them (last 10)
- Open todos related to them
- "Last met: {date} — {meeting_title}"
- "Email {name}" button → opens compose

**Visibility Rules:**
- Only shows if at least 2 people are found
- Hidden on weekends with no meetings
- Hidden when no calendar and no Gmail connected

---

### 4.6 The Action Stream

**Priority:** P0 (core value — surfaces the right work at the right time)
**Effort:** Medium (3-4 days)
**AI Required:** No

#### Description

A smart, contextually ranked display of the 3-5 most important action items RIGHT NOW, scored by a weighted algorithm that combines time pressure, social context, and opportunity.

#### Specifications

**Scoring Algorithm:**

For each `TodoItem` where `isCompleted == false`:

```swift
func score(todo: TodoItem, todayEvents: [CalendarEvent]) -> Int {
    var score = 0

    // Time urgency
    if let due = todo.dueDate {
        if due < .now { score += 40 }                    // Overdue
        else if Calendar.current.isDateInToday(due) { score += 25 }  // Due today
        else if due < Calendar.current.date(byAdding: .day, value: 7, to: .now)! { score += 10 }  // This week
    }

    // Social pressure: Is the assignor in today's meetings?
    if let sender = todo.senderEmail {
        let meetingToday = todayEvents.contains { event in
            event.attendeeEmails.contains(sender)
        }
        if meetingToday { score += 30 }
    }

    // Source meeting has a follow-up meeting today
    if let sourceId = todo.sourceId,
       let sourceNote = noteRepository.fetchNote(id: sourceId) {
        let sameGroupMeetingToday = todayEvents.contains { event in
            event.attendeeNames.intersects(sourceNote.attendees)
        }
        if sameGroupMeetingToday { score += 25 }
    }

    // Recency and novelty
    if !todo.isSeen { score += 15 }
    if todo.createdAt > Calendar.current.date(byAdding: .day, value: -1, to: .now)! { score += 10 }

    // Source weight
    switch todo.sourceType {
    case .meeting: score += 10
    case .email: score += 5
    case .manual: score += 3
    }

    // Priority boost
    switch todo.priority {
    case .high: score += 15
    case .medium: score += 5
    case .low: score += 0
    }

    return score
}
```

**Display (top 5 by score):**

```
┌─────────────────────────────────────────────────┐
│ 3 things that matter right now                   │
│ ─────────────────────────────────────────────── │
│                                                  │
│ ○ Send revised deck to Tom                       │
│   From: Product Sync (Jan 14) · 3 days overdue  │
│   ⚡ You're seeing Tom at 2pm                    │
│                                                  │
│ ○ Review Sarah's proposal                        │
│   From: sarah@acme.com (Jan 16) · 1 day overdue │
│                                                  │
│ ○ Prepare Engineering Standup agenda             │
│   Due today                                      │
│                                                  │
│                            See all to-dos →      │
└─────────────────────────────────────────────────┘
```

**Row Specifications:**
- Checkbox: 16pt circle, 1pt `Theme.olive` stroke. On complete: celebration animation (existing pattern — ring pulse, particle burst, checkmark scale).
- Title: `Theme.bodyFont(14)`, `.medium`, `Theme.textPrimary`. Strikethrough + dimmed on complete.
- Provenance line: `Theme.captionFont(12)`, `Theme.textTertiary`. Format: "From: {source_title} ({date})" — tappable to navigate to source note/email.
- Overdue indicator: "· {n} days overdue" in `Theme.recording` color.
- Social nudge: "You're seeing {name} at {time}" in `Theme.olive` with lightning bolt icon. Only shown if scoring algorithm gave social pressure points.
- "New" badge: Olive pill for `isSeen == false` todos, auto-dismissed after 3 seconds (existing pattern).

**Section Header:**
- Dynamic count: "3 things that matter right now" / "1 thing that matters right now"
- If zero pending todos: Section hidden entirely
- "See all to-dos" link: Navigates to Todos sidebar tab

---

### 4.7 The Email Radar

**Priority:** P1
**Effort:** Medium (3-4 days)
**AI Required:** No (classification uses existing heuristic logic)

#### Description

Instead of an unread count badge, the Home shows a curated "Needs Your Attention" email section that filters noise and surfaces only emails requiring human judgment, enriched with cross-data context.

#### Specifications

**Classification Pipeline:**

```swift
// Step 1: Get unread threads
let unreadThreads = gmailService.inboxThreads.filter { $0.isUnread }

// Step 2: Filter out noise using existing EmailCategory classification
let actionableThreads = unreadThreads.filter { thread in
    let category = EmailCategory.classify(
        subject: thread.subject,
        fromEmail: thread.latestMessage.fromEmail,
        labelIds: thread.labelIds
    )
    // Keep only categories that need human action
    return ![.newsletter, .promotion, .notification, .receipt, .socialMedia, .meetingInvite]
        .contains(category)
}

// Step 3: Filter out excluded senders (from todo exclusion list)
let filtered = actionableThreads.filter { thread in
    !UserDefaults.todoExcludedSenders.contains(thread.latestMessage.fromEmail)
}

// Step 4: Sort by relevance
// Priority: (1) sender is in today's meetings, (2) thread has extracted todos, (3) recency
let sorted = filtered.sorted { ... }

// Step 5: Take top 5
let radar = Array(sorted.prefix(5))
```

**Card Display:**

```
┌─────────────────────────────────────────────────┐
│ 5 emails need you                                │
│ ─────────────────────────────────────────────── │
│                                                  │
│ [SC] Sarah Chen                          2:34pm │
│ Re: Q1 Budget Proposal                          │
│ "Can you review the attached and confirm by..."  │
│ 📋 1 action item extracted                       │
│ ⚡ Meeting with Sarah at 2pm                     │
│                                                  │
│ [AC] Acme Corp - James Lee              1:15pm  │
│ Contract Terms Follow-Up                         │
│ "We'd like to schedule a call to discuss the..." │
│                                                  │
│ [TW] Tom Wilson                         11:02am  │
│ Updated Timeline                                 │
│ "Here's the revised project timeline as disc..." │
│                                                  │
│                     View all email →              │
└─────────────────────────────────────────────────┘
```

**Row Specifications:**
- Avatar: 32pt circle with sender initials on colored background (existing `AvatarView` pattern)
- Sender name: `Theme.bodyFont(14)`, `.semibold`, `Theme.textPrimary`
- Timestamp: Right-aligned, `Theme.captionFont(11)`, `Theme.textTertiary`
- Subject: `Theme.bodyFont(13)`, `Theme.textSecondary`, 1 line max
- Smart snippet: `Theme.captionFont(12)`, `Theme.textTertiary`, 1 line max, italic. Uses last meaningful sentence from `bodyPlain` (skip signatures, skip "Sent from iPhone").
- Todo badge: "1 action item extracted" — only shown if `todoRepository` has todos with matching `sourceId`. `Theme.captionFont(11)`, `Theme.olive`.
- Meeting linkage: "Meeting with {name} at {time}" — only shown if sender email matches a today's calendar attendee. `Theme.captionFont(11)`, `Theme.olive`, with lightning bolt.

**Actions (on hover/tap):**
- Tap row: Navigate to Email tab with thread selected
- Quick Reply button (on hover): Opens compose with `EmailAIService` pre-generating 3 draft variants

**Section Header:**
- Dynamic: "{count} emails need you" / "1 email needs you"
- If zero actionable emails: Section hidden
- "View all email" link: Navigates to Email sidebar tab

---

### 4.8 Unfinished Business

**Priority:** P1
**Effort:** Medium (3-4 days)
**AI Required:** No (follow-up drafting uses existing EmailAIService when user clicks)

#### Description

After meetings end, surfaces follow-up cards showing commitment progress and nudging the user to close loops — send the recap, complete the todos, draft the follow-up.

#### Specifications

**Data Query:**

```swift
let recentMeetingNotes = noteRepository.fetchAllNotes()
    .filter { note in
        note.noteType == .meeting &&
        note.status == .enhanced &&
        note.createdAt > Calendar.current.date(byAdding: .hour, value: -48, to: .now)!
    }
    .sorted(by: { $0.createdAt > $1.createdAt })
```

For each note, compute:
```swift
struct UnfinishedBusinessItem {
    let note: Note
    let totalTodos: Int        // todoRepository.fetchTodos(forSourceId: note.id).count
    let completedTodos: Int    // .filter { $0.isCompleted }.count
    let pendingTodos: Int      // totalTodos - completedTodos
    let hasFollowUpEmail: Bool // Check if sent email references note title
    let hoursSinceMeeting: Int // Time since note.createdAt
    let attendeeNames: [String]
    let urgencyLevel: UrgencyLevel // .normal, .nudge (>24h, no follow-up), .overdue (>48h)
}
```

**Card Display:**

```
┌─────────────────────────────────────────────────┐
│ 📋 Product Roadmap Sync                          │
│ Yesterday, 45 min · Sarah, Tom, Alex             │
│                                                  │
│ ████████░░░░ 1 of 3 action items done            │
│                                                  │
│ ○ Send revised deck to Tom (overdue)             │
│ ○ Schedule follow-up with Alex                   │
│ ✓ Share meeting notes (done)                     │
│                                                  │
│ [Draft Follow-Up Email ✉️]  [View Notes]          │
└─────────────────────────────────────────────────┘
```

**Urgency Levels:**

| Level | Condition | Visual Treatment |
|-------|-----------|-----------------|
| Normal | < 24h since meeting | Standard card, olive accents |
| Nudge | > 24h, pending items OR no follow-up email | Amber left border (2pt), "Follow up?" nudge text |
| Overdue | > 48h, pending items | Red left border (2pt), "3 items still pending after 2 days" warning |

**Progress Bar:**
- Width: 100% of card content area
- Height: 4pt, rounded caps
- Fill: `Theme.olive` for completed portion, `Theme.divider` for remainder
- Transition: Animated fill when todo is completed from within the card

**Action Buttons:**
- "Draft Follow-Up Email": Opens `MeetingFollowUpSheet` with note pre-loaded. Uses existing `EmailAIService.meetingFollowUp()` with user's `StyleProfile`.
- "View Notes": Navigates to note detail via `onSelectNote(note.id)`

**Section Header:**
- "Unfinished business" in `Theme.headingFont()`, `Theme.textSecondary`
- Only shown if at least 1 `UnfinishedBusinessItem` exists with `pendingTodos > 0` OR `!hasFollowUpEmail`

---

### 4.9 The Connection Web

**Priority:** P2
**Effort:** Medium (3-4 days)
**AI Required:** No

#### Description

Nest identifies non-obvious connections across meetings, emails, and todos using local heuristics, and surfaces them as dismissible insight cards. This is where the "second brain" concept becomes tangible.

#### Specifications

**Insight Types:**

**Type A — Email-Meeting Convergence:**
```
Condition: A person in today's calendar has sent unread email(s)
           since the last meeting with them.
Template: "{name} emailed you {count} time(s) since your last sync —
           might be worth discussing at {time}."
Action: "Open emails" → Email tab filtered to sender
Data: CalendarEvent.attendeeEmails ∩ GmailThread.senderEmails,
      filtered by date > lastNoteDate with same attendee
```

**Type B — Stale Commitments:**
```
Condition: A todo from a meeting is pending for > 7 days.
Template: "You committed to '{todo_title}' {days} days ago
           (from {meeting_title}). Still pending."
Action: "Mark done" checkbox inline + "View source" link
Data: TodoRepository.fetchPendingTodos() where sourceType == .meeting
      and createdAt < 7 days ago
```

**Type C — Recurring Meeting Delta:**
```
Condition: Today has a calendar event whose title matches a recent event
           (same title prefix, within last 14 days), and that prior event
           has a note with pending todos.
Template: "Last week's {meeting_title} had {count} action items —
           {pending} still open."
Action: "Review" → navigate to prior meeting note
Data: CalendarEvent title matching (levenshtein or prefix),
      NoteRepository linked by calendarEventId,
      TodoRepository linked by sourceId
```

**Type D — Cross-Team Topic Convergence:**
```
Condition: 3+ notes from last 30 days share the same tag but have
           different attendee sets.
Template: "You've discussed '{tag_name}' in {count} meetings with
           {group_count} different groups."
Action: "View all" → filtered notes view by tag
Data: Note.tags cross-referenced with Note.attendees for uniqueness
```

**Display:**

Each insight is a compact card:
```
┌─────────────────────────────────────────────────┐
│ 💡 Sarah emailed 3 times since your last sync    │
│    Might be worth discussing at 2pm today        │
│                                                  │
│    [Open emails]                          [✕]   │
└─────────────────────────────────────────────────┘
```

**Visual Design:**
- Card: Slightly warmer background than standard cards — `Theme.background` instead of `Theme.cardBackground` (subtle differentiation)
- Left accent: 3pt olive left border
- Icon: Relevant emoji or SF Symbol (lightbulb for insights)
- Body: `Theme.bodyFont(13)`, `Theme.textPrimary`
- Action: Text button in `Theme.olive`
- Dismiss: "X" button, stores dismissed insight ID in `UserDefaults("dismissedInsightIds")`

**Rules:**
- Maximum 3 insight cards shown at a time
- Priority order: A (most actionable) > B > C > D
- Refresh: Computed on `.onAppear`, cached for 30 minutes
- Dismissed insights don't reappear for 7 days (tracked by hash of type + key entities)
- If no insights qualify: Section hidden entirely

---

### 4.10 The Temporal Canvas

**Priority:** P3 (alternative view mode, not default)
**Effort:** Large (5-7 days)
**AI Required:** No

#### Description

An alternative view mode (toggle in toolbar) that replaces the card-based Home with a continuous vertical timeline representing the entire day, with calendar events as blocks, contextual gaps highlighted, and past events showing completion state.

#### Specifications

**Layout:**

```
                          ┌─────────┐
                          │ 8:00 AM │
                          └─────────┘
                               │
    ┌──────────────────────────┤──────────────────────┐
    │ Focus time (90 min)                              │
    │ 3 overdue to-dos could fit here                  │
    └──────────────────────────┤──────────────────────┘
                               │
                          ┌─────────┐
                          │ 9:30 AM │
                          └─────────┘
    ┌──────────────────────────┤──────────────────────┐
    │ 📅 1:1 with Sarah Chen                    30min  │
    │ Google Meet · 1 attendee                         │
    │ [Join] [Record]                                  │
    │                                                  │
    │ PREP: 2 unread emails, 1 overdue todo           │
    └──────────────────────────┤──────────────────────┘
                               │
                     ═══ NOW (10:05 AM) ═══  ← pulsing olive line
                               │
                          ┌─────────┐
                          │ 11:00 AM│
                          └─────────┘
    ┌──────────────────────────┤──────────────────────┐
    │ 📅 Product Review                         60min  │
    │ Zoom · Tom, Alex, James                          │
    │ [Join] [Record]                                  │
    └──────────────────────────┤──────────────────────┘
```

**Time Block Types:**

| Type | Visual | Content |
|------|--------|---------|
| Calendar event (future) | White card, olive left border | Title, duration, attendees, platform, Join + Record buttons, prep summary |
| Calendar event (past, with notes) | Dimmed card, green checkmark | Title, "Notes taken ✓", "{n} action items extracted" |
| Calendar event (past, no notes) | Dimmed card, amber indicator | Title, "No notes captured" |
| Focus gap (>30 min) | Subtle dashed border, cream background | Duration, suggested todos that could fit |
| Current time | Olive pulsing line spanning full width | "Now — {time}" label |

**Behavior:**
- Auto-scrolls to "now" indicator on appear
- Time range: 7am to 8pm (or first event to last event + 1 hour, whichever is wider)
- 30-minute increments with hour labels
- Past events: opacity 0.6
- Now line: `Theme.olive`, 2pt, with repeating pulse animation (opacity 0.5 → 1.0, 1.5s cycle)

**Toggle:**
- Toolbar button: calendar icon / list icon toggle
- State stored in `UserDefaults("homeViewMode")`: `.cards` (default) or `.timeline`
- Smooth transition animation between modes (300ms cross-fade)

---

## 5. Architecture

### 5.1 New Service: `NestHomeService`

A new `@Observable` service class orchestrating all Home data aggregation. Prevents `HomeContentView` from becoming a 2000-line view with inline queries.

**Location:** `TapMeeting/Services/NestHomeService.swift`

**Responsibilities:**
- Aggregate data from all existing services
- Compute greeting, momentum, rankings, insights
- Cache expensive computations with TTLs
- Provide a single `refresh()` async method

**Interface:**

```swift
@Observable
final class NestHomeService {
    // Injected (via AppState)
    private let calendarService: CalendarService
    private let gmailService: GmailService
    private let todoRepository: TodoRepository
    private let noteRepository: NoteRepository
    private let semanticChatService: SemanticChatService?
    private let aiProxy: AIProxyClient

    // Published state
    private(set) var greeting: GreetingModel
    private(set) var momentum: MomentumModel
    private(set) var peopleStrip: [PersonContext]
    private(set) var meetingDossiers: [MeetingDossier]
    private(set) var actionStream: [RankedTodo]
    private(set) var emailRadar: [ActionableEmail]
    private(set) var unfinishedBusiness: [UnfinishedBusinessItem]
    private(set) var insightCards: [InsightCard]
    private(set) var morningBriefing: StreamingBriefing?
    private(set) var isLoading: Bool

    // Lifecycle
    func refresh() async { ... }
    func dismissInsight(_ id: String) { ... }
    func dismissBriefing() { ... }
    func completeTodo(_ id: UUID) { ... }
}
```

**Initialization:** Created in `AppState.init()` alongside existing services. Passed to `HomeContentView` via `@Environment(NestHomeService.self)`.

### 5.2 New View Components

Each feature becomes a standalone SwiftUI view:

| Component | File | Depends On |
|-----------|------|-----------|
| `AdaptiveGreetingView` | `Views/Home/AdaptiveGreetingView.swift` | `NestHomeService.greeting` |
| `MomentumMeterView` | `Views/Home/MomentumMeterView.swift` | `NestHomeService.momentum` |
| `MorningBriefingCard` | `Views/Home/MorningBriefingCard.swift` | `NestHomeService.morningBriefing` |
| `MeetingDossierCard` | `Views/Home/MeetingDossierCard.swift` | `NestHomeService.meetingDossiers` |
| `PeopleStripView` | `Views/Home/PeopleStripView.swift` | `NestHomeService.peopleStrip` |
| `ActionStreamView` | `Views/Home/ActionStreamView.swift` | `NestHomeService.actionStream` |
| `EmailRadarView` | `Views/Home/EmailRadarView.swift` | `NestHomeService.emailRadar` |
| `UnfinishedBusinessView` | `Views/Home/UnfinishedBusinessView.swift` | `NestHomeService.unfinishedBusiness` |
| `InsightCardView` | `Views/Home/InsightCardView.swift` | `NestHomeService.insightCards` |
| `TemporalCanvasView` | `Views/Home/TemporalCanvasView.swift` | `NestHomeService` (all data) |

**HomeContentView** becomes a thin composition layer:

```swift
struct HomeContentView: View {
    @Environment(NestHomeService.self) var homeService

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                AdaptiveGreetingView()
                MomentumMeterView()

                if homeService.shouldShowPeopleStrip {
                    PeopleStripView()
                }
                if let briefing = homeService.morningBriefing {
                    MorningBriefingCard(briefing: briefing)
                }
                ForEach(homeService.meetingDossiers) { dossier in
                    MeetingDossierCard(dossier: dossier)
                }
                if !homeService.actionStream.isEmpty {
                    ActionStreamView()
                }
                if !homeService.emailRadar.isEmpty {
                    EmailRadarView()
                }
                if !homeService.unfinishedBusiness.isEmpty {
                    UnfinishedBusinessView()
                }
                ForEach(homeService.insightCards) { card in
                    InsightCardView(card: card)
                }
            }
        }
    }
}
```

### 5.3 Data Flow

```
CalendarService ──┐
GmailService ─────┤
TodoRepository ───┼──→ NestHomeService ──→ HomeContentView
NoteRepository ───┤         │                    │
SemanticChat ─────┘         │                    ├→ AdaptiveGreetingView
                            │                    ├→ MomentumMeterView
                       refresh()                 ├→ MeetingDossierCard
                       (on .onAppear             ├→ ActionStreamView
                        + 30s timer)             ├→ EmailRadarView
                                                 └→ ... etc
```

### 5.4 Performance Considerations

- **No AI on load:** Base rendering is pure local data. AI only fires for Morning Briefing (once/day) and AI Brief button (user-triggered).
- **Lazy computation:** Meeting dossiers only compute for events within 2 hours. People strip only builds if meetings exist today.
- **Caching:** Morning briefing cached 3 hours. Insight cards cached 30 minutes. People strip cached 10 minutes.
- **Background refresh:** 30-second timer (matching existing calendar polling) refreshes the full model. Diffable — only triggers view updates if data changed.
- **SwiftData queries:** All `fetchAllNotes()` and `fetchPendingTodos()` calls are already used elsewhere in the app, so query patterns are established and performant.

---

## 6. Phased Rollout

### Phase 1: Foundation (Week 1-2)
**Ship:** Adaptive Greeting (#1) + Action Stream (#6) + "New Meeting"/"New Note" cards (retained)

**Rationale:** The greeting transforms the emotional feel of the app instantly. The Action Stream replaces the need for users to manually check the Todos tab. Together they make Home feel intelligent immediately.

### Phase 2: Meeting Intelligence (Week 3-4)
**Ship:** Meeting Dossiers (#4) + Unfinished Business (#8)

**Rationale:** These are the highest-value features for the core use case (meetings). Dossiers make users prepared. Unfinished Business ensures meetings produce outcomes.

### Phase 3: Communication Layer (Week 5-6)
**Ship:** Email Radar (#7) + Morning Briefing (#3) + Momentum Meter (#2)

**Rationale:** Email Radar brings Gmail into the Home experience. Morning Briefing adds the AI wow-factor. Momentum Meter adds emotional engagement.

### Phase 4: Relationship & Insights (Week 7-8)
**Ship:** People Strip (#5) + Connection Web (#9)

**Rationale:** These are the "delightful" features that emerge from data density. They require the user to have built up history in Nest, so shipping later makes sense.

### Phase 5: Alternative Experience (Week 9+)
**Ship:** Temporal Canvas (#10)

**Rationale:** This is a power-user feature and alternative view mode. It requires all other components to be stable first.

---

## 7. Open Questions

1. **Pinned notes section:** Should it remain on the new Home, or is it superseded by the Action Stream and Dossiers? Recommendation: Remove, since pinned notes are accessible from sidebar.

2. **Recent notes section:** Should it remain? Recommendation: Replace with Unfinished Business (which shows recent meetings with richer context). Users who want a note list have the Meetings tab.

3. **"New Meeting" / "New Note" cards:** Should they remain as prominent top-of-page cards? Recommendation: Move to toolbar "+" button or make them smaller — the greeting + dossiers should own the top of the page.

4. **Refresh strategy:** 30-second timer vs. event-driven (push-based when new data arrives)? Recommendation: Start with 30s timer for simplicity. Migrate to event-driven if performance profiling warrants it.

5. **Empty states:** What does the Home look like for a brand new user with zero data? Recommendation: Show onboarding-style cards: "Connect Google Calendar to see your day" / "Record your first meeting to get started" / "Connect Gmail to see actionable emails."
