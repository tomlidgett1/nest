// profile-builder v2 — Deep user profiling from Gmail, Calendar, PDL, and web.
//
// Scans sent emails (voice, frustrations, preferences), received emails (topics,
// contacts, travel bookings), calendar (patterns, collaborators), and web
// (company, LinkedIn) to build a rich psychological + professional profile.
//
// Input: { user_id: string }
// Output: { success: true, profile: UserProfile }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getGoogleAccessToken,
  listGmailMessages,
  getGmailMessage,
} from "../_shared/gmail-helpers.ts";
import { enrichByIdentity, profileToContext } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const tavilyApiKey = Deno.env.get("TAVILY_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ────────────────────────────────────────────────────

interface UserProfile {
  built_at: string;
  version: number;
  identity: {
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
    linkedin_url: string | null;
  };
  professional: {
    title: string | null;
    company: string | null;
    industry: string | null;
    company_domain: string | null;
    company_description: string | null;
    years_experience: number | null;
    headline: string | null;
    previous_roles: Array<{ title: string; company: string; duration: string }>;
  };
  communication: {
    top_contacts: Array<{ name: string; email: string; frequency: string; relationship: string }>;
    email_themes: string[];
    writing_style: string | null;
    typical_email_volume: string | null;
    tone_markers: string[];
    industry_jargon: string[];
  };
  schedule: {
    meeting_frequency: string | null;
    recurring_meetings: string[];
    typical_day_shape: string | null;
    key_collaborators: string[];
  };
  personality: {
    frustrations: string[];
    preferences: string[];
    values: string[];
    communication_style: string | null;
    decision_making: string | null;
  };
  life: {
    hobbies: string[];
    travel: string[];
    upcoming_events: string[];
    personal_commitments: string[];
  };
  interests: string[];
  summary: string;
}

interface EmailMessage {
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  is_sent: boolean;
  labels: string[];
}

// ── Gmail Deep Scan ─────────────────────────────────────────

async function deepScanEmails(
  accessToken: string,
  userEmail: string,
): Promise<{
  topContacts: Array<{ name: string; email: string; count: number }>;
  sentEmails: EmailMessage[];
  receivedEmails: EmailMessage[];
  travelEmails: EmailMessage[];
  allMessages: EmailMessage[];
}> {
  const queries = [
    { q: "newer_than:14d from:me", label: "sent 2 weeks", max: 25 },
    { q: "newer_than:30d from:me", label: "sent 30d", max: 15 },
    { q: "newer_than:7d -from:me", label: "received 7d", max: 25 },
    { q: "newer_than:30d is:important -from:me", label: "important 30d", max: 15 },
    { q: "newer_than:90d (flight OR booking OR itinerary OR hotel OR airbnb OR qantas OR jetstar OR virgin OR emirates)", label: "travel", max: 10 },
    { q: "newer_than:90d (invoice OR receipt OR subscription OR membership OR gym OR club)", label: "personal", max: 10 },
    { q: "newer_than:30d is:starred", label: "starred", max: 10 },
  ];

  const seenIds = new Set<string>();
  const allMessages: EmailMessage[] = [];

  for (const { q, max } of queries) {
    try {
      const msgs = await listGmailMessages(accessToken, q, max);
      for (const msg of msgs) {
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);
        try {
          const full = await getGmailMessage(accessToken, msg.id);
          allMessages.push({
            from: full.from,
            to: full.to,
            cc: full.cc ?? "",
            subject: full.subject,
            snippet: full.snippet,
            body: full.bodyPreview ?? full.snippet,
            date: full.date,
            is_sent: (full.from ?? "").toLowerCase().includes(userEmail.toLowerCase()),
            labels: full.labelIds ?? [],
          });
        } catch { /* skip */ }
      }
    } catch (e) {
      console.warn(`[profile-builder] Gmail query "${q}" failed:`, (e as Error).message);
    }
  }

  console.log(`[profile-builder] Scanned ${allMessages.length} unique emails`);

  // Categorise
  const sentEmails = allMessages.filter((m) => m.is_sent);
  const receivedEmails = allMessages.filter((m) => !m.is_sent);
  const travelKeywords = /flight|booking|itinerary|hotel|airbnb|qantas|jetstar|virgin|emirates|travel|trip|airport/i;
  const travelEmails = allMessages.filter((m) =>
    travelKeywords.test(m.subject) || travelKeywords.test(m.body),
  );

  // Count contacts
  const contactCounts = new Map<string, { name: string; email: string; count: number }>();
  for (const msg of allMessages) {
    const addresses = [msg.from, msg.to, msg.cc].join(", ");
    const emailMatches = addresses.match(/[\w.-]+@[\w.-]+/g) ?? [];
    for (const email of emailMatches) {
      const lower = email.toLowerCase();
      if (lower === userEmail.toLowerCase()) continue;
      if (lower.includes("noreply") || lower.includes("no-reply") || lower.includes("mailer-daemon") || lower.includes("calendar-notification")) continue;
      const existing = contactCounts.get(lower);
      if (existing) {
        existing.count++;
      } else {
        const nameMatch = addresses.match(new RegExp(`([^<,]+?)\\s*<${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`));
        contactCounts.set(lower, {
          name: nameMatch?.[1]?.trim() ?? lower.split("@")[0],
          email: lower,
          count: 1,
        });
      }
    }
  }

  const topContacts = [...contactCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { topContacts, sentEmails, receivedEmails, travelEmails, allMessages };
}

// ── Calendar Deep Scan ──────────────────────────────────────

async function deepScanCalendar(
  accessToken: string,
): Promise<{
  meetingFrequency: string | null;
  recurringMeetings: string[];
  keyCollaborators: string[];
  recentEvents: Array<{ title: string; date: string; attendees: string[] }>;
  upcomingEvents: Array<{ title: string; date: string; attendees: string[] }>;
}> {
  const now = new Date();
  const threeWeeksAgo = new Date(now.getTime() - 21 * 86400000);
  const threeWeeksAhead = new Date(now.getTime() + 21 * 86400000);

  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${threeWeeksAgo.toISOString()}&timeMax=${threeWeeksAhead.toISOString()}` +
      `&maxResults=150&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!resp.ok) {
      console.warn(`[profile-builder] Calendar API error: ${resp.status}`);
      return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [] };
    }

    const data = await resp.json();
    const events = data.items ?? [];

    const pastEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) < now);
    const futureEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) >= now);

    const weeklyRate = pastEvents.length > 0 ? Math.round(pastEvents.length / 3) : null;
    const meetingFrequency = weeklyRate
      ? weeklyRate > 20 ? "very heavy (20+ per week)"
      : weeklyRate > 10 ? "heavy (10-20 per week)"
      : weeklyRate > 5 ? "moderate (5-10 per week)"
      : "light (under 5 per week)"
      : null;

    const titleCounts = new Map<string, number>();
    for (const e of events) {
      const title = e.summary?.trim();
      if (title) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    }
    const recurringMeetings = [...titleCounts.entries()]
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([title, count]) => `${title} (${count}x in 6 weeks)`);

    const attendeeCounts = new Map<string, number>();
    for (const e of events) {
      for (const a of e.attendees ?? []) {
        if (a.self || !a.email) continue;
        attendeeCounts.set(a.email, (attendeeCounts.get(a.email) ?? 0) + 1);
      }
    }
    const keyCollaborators = [...attendeeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([email]) => email);

    const mapEvent = (e: any) => ({
      title: e.summary ?? "(no title)",
      date: e.start?.dateTime ?? e.start?.date ?? "",
      attendees: (e.attendees ?? []).filter((a: any) => !a.self).map((a: any) => a.email).slice(0, 5),
    });

    return {
      meetingFrequency,
      recurringMeetings,
      keyCollaborators,
      recentEvents: pastEvents.slice(-20).map(mapEvent),
      upcomingEvents: futureEvents.slice(0, 15).map(mapEvent),
    };
  } catch (e) {
    console.warn(`[profile-builder] Calendar scan failed:`, (e as Error).message);
    return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [] };
  }
}

// ── Web Search ──────────────────────────────────────────────

async function searchWeb(query: string): Promise<string | null> {
  if (!tavilyApiKey) return null;
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        max_results: 3,
        search_depth: "basic",
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.answer ?? data.results?.map((r: any) => r.content).join("\n").slice(0, 1000) ?? null;
    }
  } catch { /* fall through */ }
  return null;
}

function lookupCompanyDomain(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const personal = new Set([
    "gmail.com", "googlemail.com", "hotmail.com", "outlook.com",
    "yahoo.com", "icloud.com", "me.com", "live.com", "aol.com",
    "protonmail.com", "proton.me",
  ]);
  return personal.has(domain) ? null : domain;
}

// ── LLM Deep Synthesis ──────────────────────────────────────

async function synthesiseProfile(
  name: string,
  email: string,
  pdlContext: string | null,
  companyInfo: string | null,
  emailData: {
    topContacts: Array<{ name: string; email: string; count: number }>;
    sentEmails: EmailMessage[];
    receivedEmails: EmailMessage[];
    travelEmails: EmailMessage[];
    allMessages: EmailMessage[];
  },
  calendarData: {
    meetingFrequency: string | null;
    recurringMeetings: string[];
    keyCollaborators: string[];
    recentEvents: Array<{ title: string; date: string; attendees: string[] }>;
    upcomingEvents: Array<{ title: string; date: string; attendees: string[] }>;
  },
  linkedinInfo: string | null,
): Promise<Record<string, any>> {
  if (!openaiApiKey) return {};

  // Build rich context from actual email bodies
  const sentBodies = emailData.sentEmails
    .slice(0, 20)
    .map((m) => `[SENT ${m.date}] To: ${m.to}\nSubject: ${m.subject}\n${m.body}`)
    .join("\n---\n");

  const receivedSummary = emailData.receivedEmails
    .slice(0, 20)
    .map((m) => `[RECEIVED ${m.date}] From: ${m.from}\nSubject: ${m.subject}\n${m.snippet}`)
    .join("\n---\n");

  const travelSummary = emailData.travelEmails
    .map((m) => `[${m.date}] ${m.subject}\n${m.body}`)
    .join("\n---\n");

  const calendarSummary = [
    ...calendarData.recentEvents.map((e) => `[PAST] ${e.date} — ${e.title} (${e.attendees.join(", ")})`),
    ...calendarData.upcomingEvents.map((e) => `[UPCOMING] ${e.date} — ${e.title} (${e.attendees.join(", ")})`),
  ].join("\n");

  const weeklyVolume = emailData.allMessages.filter((m) => {
    return Date.now() - new Date(m.date).getTime() < 7 * 86400000;
  }).length;

  const context = [
    `User: ${name} (${email})`,
    pdlContext ? `\n── PROFESSIONAL PROFILE (PDL) ──\n${pdlContext}` : "",
    companyInfo ? `\n── COMPANY ──\n${companyInfo}` : "",
    linkedinInfo ? `\n── WEB/LINKEDIN ──\n${linkedinInfo}` : "",
    `\n── SENT EMAILS (their actual words) ──\n${sentBodies || "(none found)"}`,
    `\n── RECEIVED EMAILS ──\n${receivedSummary || "(none found)"}`,
    travelSummary ? `\n── TRAVEL/BOOKINGS ──\n${travelSummary}` : "",
    `\n── CALENDAR (6 weeks) ──\n${calendarSummary || "(none found)"}`,
    `\n── CONTACTS ──\n${emailData.topContacts.map((c) => `${c.name} <${c.email}> (${c.count} emails)`).join("\n")}`,
    `\n── STATS ──\nWeekly email volume: ~${weeklyVolume} emails/week\nMeeting load: ${calendarData.meetingFrequency ?? "unknown"}\nRecurring meetings: ${calendarData.recurringMeetings.join(", ") || "none detected"}`,
  ].filter(Boolean).join("\n");

  console.log(`[profile-builder] LLM context: ${context.length} chars, sent emails: ${emailData.sentEmails.length}, received: ${emailData.receivedEmails.length}`);

  const systemPrompt = `You are building a deep psychological and professional profile of a user for their AI assistant. The assistant will use this to anticipate needs, match communication style, and feel like it truly knows them.

Analyse EVERYTHING provided — especially their SENT emails (their actual voice) and calendar patterns.

Return a JSON object with these exact keys:

{
  "email_themes": ["5-10 specific work topics they deal with regularly"],
  "tone_markers": ["5-8 phrases/patterns that characterise how they write, e.g. 'starts emails with Hey', 'uses Australian slang', 'signs off with Cheers', 'uses emoji sparingly', 'tends to be direct and brief'"],
  "industry_jargon": ["5-10 industry-specific terms or acronyms they use regularly, e.g. 'WBR', 'CDS audit', 'fleet ops', 'SLA', 'NPS'"],
  "frustrations": ["3-5 things that seem to frustrate or stress them based on email tone, repeated issues, complaints, or things they chase up on"],
  "preferences": ["3-5 things they clearly prefer or value, e.g. 'prefers brief updates over long reports', 'likes to schedule things early', 'values punctuality'"],
  "values": ["3-5 core values evident from their behaviour, e.g. 'team player', 'detail-oriented', 'efficiency-focused'"],
  "communication_style": "2-3 sentences describing their overall communication personality. Are they formal or casual? Verbose or terse? Do they use humour? How do they handle conflict?",
  "decision_making": "1-2 sentences on how they seem to make decisions — fast/slow, data-driven/intuitive, collaborative/independent",
  "hobbies": ["any hobbies, sports, fitness activities, creative pursuits detected from emails, calendar, or subscriptions"],
  "travel": ["any trips, destinations, flights, or travel plans detected — include dates if available"],
  "upcoming_events": ["any notable upcoming personal or professional events — conferences, trips, deadlines, celebrations"],
  "personal_commitments": ["any personal life signals — wedding planning, family events, health appointments, etc."],
  "writing_style": "One detailed sentence about their writing style for emails specifically",
  "typical_day": "3-4 sentences painting a picture of what a typical day looks like for this person",
  "contact_relationships": [{"name": "contact name", "email": "email", "relationship": "brief description e.g. 'direct report', 'manager', 'external client', 'friend'"}],
  "summary": "A rich 5-7 sentence profile summary. Write it as if you're briefing someone who needs to deeply understand this person — their role, how they work, what drives them, what frustrates them, their personality, and what their life looks like outside work. Be specific, vivid, and human. No generic filler."
}

Be specific. Use actual evidence from the emails. Don't guess — if you can't determine something, omit it. But where evidence exists, go deep.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        max_tokens: 3000,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[profile-builder] OpenAI error ${resp.status}: ${errBody.slice(0, 500)}`);
      return {};
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    console.log(`[profile-builder] LLM response length: ${content.length} chars, finish_reason: ${data.choices?.[0]?.finish_reason}`);
    return JSON.parse(content);
  } catch (e) {
    console.error(`[profile-builder] Synthesis failed:`, (e as Error).message);
    return {};
  }
}

// ── Main Handler ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const start = Date.now();

  let userId: string;
  try {
    const body = await req.json();
    userId = body.user_id;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!userId) return json({ error: "missing_user_id" }, 400);

  console.log(`[profile-builder] Starting deep profile build for ${userId}`);

  try {
    const accessToken = await getGoogleAccessToken(admin, userId);

    const { data: imsgUser } = await admin
      .from("imessage_users")
      .select("phone_number, pdl_profile, google_email, display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: googleAcct } = await admin
      .from("user_google_accounts")
      .select("google_email, google_name")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    const email = googleAcct?.google_email ?? imsgUser?.google_email ?? "";
    const name = googleAcct?.google_name ?? imsgUser?.display_name ?? "Unknown";
    const phone = imsgUser?.phone_number ?? null;
    const companyDomain = lookupCompanyDomain(email);

    console.log(`[profile-builder] User: ${name} <${email}>`);

    // Run all scans in parallel
    const [emailData, calendarData, pdlProfile, companyInfo] = await Promise.all([
      deepScanEmails(accessToken, email),
      deepScanCalendar(accessToken),
      (async (): Promise<PDLProfile | null> => {
        const cached = imsgUser?.pdl_profile as PDLProfile | null;
        if (cached?.job_title) return cached;
        return enrichByIdentity({ email, name, phone: phone ?? undefined });
      })(),
      companyDomain
        ? searchWeb(`What does ${companyDomain} company do? Brief description of the business`)
        : Promise.resolve(null),
    ]);

    // LinkedIn/web lookup needs PDL result (sequential)
    const webInfo = pdlProfile?.linkedin_url
      ? await searchWeb(`${name} ${pdlProfile.job_title ?? ""} ${pdlProfile.job_company_name ?? ""} professional background`)
      : name && companyDomain
      ? await searchWeb(`${name} ${companyDomain} professional background`)
      : null;

    console.log(`[profile-builder] Scanned: ${emailData.allMessages.length} emails (${emailData.sentEmails.length} sent), ${calendarData.recentEvents.length + calendarData.upcomingEvents.length} calendar events`);

    // Deep LLM synthesis
    const pdlContext = pdlProfile ? profileToContext(pdlProfile) : null;
    const synthesis = await synthesiseProfile(
      name, email, pdlContext, companyInfo,
      emailData, calendarData, webInfo,
    );

    // Build profile
    const profile: UserProfile = {
      built_at: new Date().toISOString(),
      version: 2,
      identity: {
        name,
        email,
        phone,
        location: pdlProfile?.location_name ?? null,
        linkedin_url: pdlProfile?.linkedin_url ?? null,
      },
      professional: {
        title: pdlProfile?.job_title ?? null,
        company: pdlProfile?.job_company_name ?? null,
        industry: pdlProfile?.job_company_industry ?? null,
        company_domain: companyDomain,
        company_description: companyInfo?.slice(0, 500) ?? null,
        years_experience: pdlProfile?.inferred_years_experience ?? null,
        headline: pdlProfile?.headline ?? null,
        previous_roles: (pdlProfile?.experience ?? [])
          .filter((e) => !e.is_primary && e.title && e.company_name)
          .slice(0, 5)
          .map((e) => ({
            title: e.title!,
            company: e.company_name!,
            duration: e.start_date && e.end_date
              ? `${e.start_date} – ${e.end_date}`
              : e.start_date ?? "unknown",
          })),
      },
      communication: {
        top_contacts: (synthesis.contact_relationships ?? emailData.topContacts.slice(0, 10)).map((c: any) => ({
          name: c.name,
          email: c.email,
          frequency: c.count ? (c.count > 10 ? "very frequent" : c.count > 5 ? "frequent" : "occasional") : "unknown",
          relationship: c.relationship ?? "unknown",
        })),
        email_themes: synthesis.email_themes ?? [],
        writing_style: synthesis.writing_style ?? null,
        typical_email_volume: emailData.allMessages.length > 0
          ? (() => {
              const week = emailData.allMessages.filter((m) => Date.now() - new Date(m.date).getTime() < 7 * 86400000).length;
              return week > 50 ? "very high" : week > 20 ? "high" : week > 10 ? "moderate" : "low";
            })()
          : null,
        tone_markers: synthesis.tone_markers ?? [],
        industry_jargon: synthesis.industry_jargon ?? [],
      },
      schedule: {
        meeting_frequency: calendarData.meetingFrequency,
        recurring_meetings: calendarData.recurringMeetings,
        typical_day_shape: synthesis.typical_day ?? null,
        key_collaborators: calendarData.keyCollaborators.slice(0, 10),
      },
      personality: {
        frustrations: synthesis.frustrations ?? [],
        preferences: synthesis.preferences ?? [],
        values: synthesis.values ?? [],
        communication_style: synthesis.communication_style ?? null,
        decision_making: synthesis.decision_making ?? null,
      },
      life: {
        hobbies: synthesis.hobbies ?? [],
        travel: synthesis.travel ?? [],
        upcoming_events: synthesis.upcoming_events ?? [],
        personal_commitments: synthesis.personal_commitments ?? [],
      },
      interests: [...(synthesis.hobbies ?? []), ...(synthesis.interests ?? [])],
      summary: synthesis.summary ?? "",
    };

    // Save
    const { error: updateErr } = await admin
      .from("imessage_users")
      .update({
        user_profile: profile,
        profile_built_at: profile.built_at,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateErr) {
      console.error(`[profile-builder] DB update failed:`, updateErr.message);
      return json({ error: "db_update_failed", detail: updateErr.message }, 500);
    }

    const elapsed = Date.now() - start;
    console.log(`[profile-builder] ✓ Deep profile built for ${name} in ${elapsed}ms`);
    console.log(`[profile-builder] Summary: ${(synthesis.summary ?? "").slice(0, 300)}`);
    console.log(`[profile-builder] Frustrations: ${(synthesis.frustrations ?? []).join(", ")}`);
    console.log(`[profile-builder] Jargon: ${(synthesis.industry_jargon ?? []).join(", ")}`);

    return json({ success: true, profile, elapsed_ms: elapsed });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[profile-builder] Failed:`, msg);
    return json({ error: "build_failed", detail: msg }, 500);
  }
});
