// profile-builder v4 — Maximum-depth user profiling
//
// Scans 6-12 months of Gmail across 30+ targeted query categories,
// 6 months of calendar, PDL enrichment, and web search to build the
// deepest possible psychological, professional, and personal profile.
//
// Input: { user_id: string }
// Output: { success: true, profile: UserProfile }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getGoogleAccessToken,
  getAllAccountTokens,
  getAllMicrosoftAccountTokens,
  listGmailMessages,
  getGmailMessage,
} from "../_shared/gmail-helpers.ts";
import type { AccountToken } from "../_shared/gmail-helpers.ts";
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
    job_in_context: string | null;
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
  housing: {
    situation: string | null;
    location_details: string | null;
    signals: string[];
  };
  family: {
    members: Array<{ name: string; relationship: string; context: string }>;
    family_structure: string | null;
    signals: string[];
  };
  life: {
    hobbies: string[];
    travel: string[];
    travel_style: string | null;
    upcoming_events: string[];
    personal_commitments: string[];
    side_projects: string[];
    sports_and_fitness: string[];
    subscriptions_and_memberships: string[];
    food_and_dining: string[];
    guilty_pleasures: string[];
    secrets_and_surprises: string[];
    pets: string[];
    health_and_wellness: string[];
    learning: string[];
  };
  fashion_and_style: {
    clothing_brands: string[];
    style_signals: string[];
    notable_fashion_purchases: string[];
  };
  financial: {
    spending_patterns: string[];
    notable_purchases: string[];
    subscriptions: string[];
    lifestyle_tier: string | null;
  };
  social: {
    inner_circle: Array<{ name: string; relationship: string; context: string }>;
    social_style: string | null;
    group_memberships: string[];
  };
  interests: string[];
  hidden_gems: string[];
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
  allMessages: EmailMessage[];
}> {
  const queries = [
    // ── Work & general (6 months) ──
    { q: "newer_than:30d from:me", max: 30 },
    { q: "newer_than:180d from:me", max: 30 },
    { q: "newer_than:14d -from:me", max: 30 },
    { q: "newer_than:60d is:important -from:me", max: 20 },
    { q: "newer_than:180d is:starred", max: 15 },

    // ── Travel & bookings (12 months) ──
    { q: "newer_than:365d (flight OR boarding pass OR itinerary OR e-ticket)", max: 20 },
    { q: "newer_than:365d (hotel OR airbnb OR booking.com OR agoda OR hostelworld OR vrbo)", max: 15 },
    { q: "newer_than:365d (qantas OR jetstar OR virgin OR emirates OR singapore airlines OR cathay OR united OR delta OR british airways OR lufthansa OR ANA OR JAL)", max: 15 },
    { q: "newer_than:365d (first class OR business class OR premium economy OR lounge access OR priority boarding OR seat upgrade)", max: 10 },
    { q: "newer_than:365d (loyalty OR frequent flyer OR points OR miles OR status OR platinum OR gold member)", max: 10 },

    // ── Spending & purchases (6 months) ──
    { q: "newer_than:180d (invoice OR receipt OR order confirmation OR payment received)", max: 25 },
    { q: "newer_than:180d (subscription OR membership OR renewal OR billing)", max: 20 },
    { q: "newer_than:365d (amazon OR ebay OR etsy OR shopify OR order shipped OR tracking number OR your order has shipped)", max: 20 },
    { q: "newer_than:180d (uber OR lyft OR doordash OR ubereats OR deliveroo OR menulog OR grubhub OR skip the dishes)", max: 15 },

    // ── Fashion & clothing (12 months) ──
    { q: "newer_than:365d (ASOS OR Zara OR Uniqlo OR H&M OR Nike OR Adidas OR Lululemon OR Patagonia OR North Face OR Country Road OR RM Williams OR MR PORTER OR SSENSE OR Farfetch OR NET-A-PORTER)", max: 10 },
    { q: "newer_than:365d (your order from OR order confirmation) (shirt OR pants OR shoes OR jacket OR dress OR sneakers OR boots OR suit OR tailored)", max: 10 },

    // ── Property & housing (12 months) ──
    { q: "newer_than:365d (rent OR lease OR tenancy OR landlord OR property manager OR real estate OR realestate.com OR domain.com.au OR rightmove OR zillow)", max: 10 },
    { q: "newer_than:365d (mortgage OR home loan OR settlement OR conveyancer OR strata OR body corporate OR rates notice OR council rates)", max: 10 },
    { q: "newer_than:365d (electricity OR gas OR water OR internet OR NBN OR broadband) (bill OR account OR statement)", max: 10 },
    { q: "newer_than:365d (insurance OR contents insurance OR home insurance OR renters insurance OR car insurance)", max: 10 },

    // ── Side projects & tech (12 months) ──
    { q: "newer_than:365d (github OR gitlab OR bitbucket OR vercel OR netlify OR heroku OR railway OR render OR fly.io)", max: 15 },
    { q: "newer_than:365d (aws OR digitalocean OR cloudflare OR stripe OR twilio OR sendgrid OR postmark OR infobip)", max: 10 },
    { q: "newer_than:365d (domain registration OR SSL OR hosting OR deploy OR production OR staging)", max: 10 },
    { q: "newer_than:365d (incorporation OR ABN OR ACN OR business registration OR company registration OR pty ltd OR LLC)", max: 5 },
    { q: "newer_than:365d (app store OR google play OR testflight OR beta invite OR product hunt OR launch)", max: 5 },

    // ── Sports, fitness, hobbies (12 months) ──
    { q: "newer_than:365d (strava OR garmin OR fitbit OR peloton OR zwift OR myfitnesspal OR nike run club)", max: 10 },
    { q: "newer_than:365d (gym OR crossfit OR F45 OR barry's OR orangetheory OR yoga OR pilates OR barre)", max: 10 },
    { q: "newer_than:365d (marathon OR half marathon OR parkrun OR triathlon OR ironman OR race registration OR race confirmation)", max: 10 },
    { q: "newer_than:365d (golf OR tennis OR cricket OR football OR soccer OR basketball OR rugby OR AFL OR surfing OR skiing OR snowboarding OR cycling OR swimming)", max: 10 },
    { q: "newer_than:365d (team registration OR fixture OR season OR grand final OR finals OR ladder OR comp)", max: 5 },

    // ── Entertainment & subscriptions (12 months) ──
    { q: "newer_than:365d (spotify OR netflix OR disney OR stan OR binge OR apple tv OR hulu OR HBO OR paramount OR youtube premium)", max: 10 },
    { q: "newer_than:365d (audible OR kindle OR blinkist OR medium OR substack)", max: 5 },
    { q: "newer_than:365d (steam OR playstation OR xbox OR nintendo OR epic games OR twitch)", max: 5 },
    { q: "newer_than:365d (eventbrite OR meetup OR tickets OR concert OR festival OR theatre OR show OR gig)", max: 10 },

    // ── Family & personal relationships (12 months) ──
    { q: "newer_than:365d (mum OR mom OR dad OR brother OR sister OR family OR parents OR grandma OR grandpa OR nan OR pop)", max: 10 },
    { q: "newer_than:365d (surprise OR secret OR don't tell OR shhh OR birthday party OR engagement OR proposal OR anniversary OR ring)", max: 5 },
    { q: "newer_than:365d (wedding OR registry OR bridal OR honeymoon OR engagement party)", max: 5 },
    { q: "newer_than:365d (baby OR nursery OR pregnancy OR maternity OR paternity)", max: 5 },

    // ── Health & wellness (6 months) ──
    { q: "newer_than:180d (doctor OR dentist OR physio OR therapist OR psychologist OR chiropractor OR osteopath OR optometrist)", max: 5 },
    { q: "newer_than:180d (prescription OR pharmacy OR chemist OR medication OR appointment confirmation)", max: 5 },

    // ── Pets (12 months) ──
    { q: "newer_than:365d (pet OR vet OR veterinary OR dog OR cat OR puppy OR kitten OR pet insurance OR pet food)", max: 5 },

    // ── Learning & education (12 months) ──
    { q: "newer_than:365d (course OR udemy OR coursera OR masterclass OR skillshare OR linkedin learning OR duolingo)", max: 10 },
    { q: "newer_than:365d (certification OR exam OR study OR tutorial OR bootcamp OR workshop)", max: 5 },

    // ── Community & volunteering (12 months) ──
    { q: "newer_than:365d (club OR association OR volunteer OR charity OR donation OR community OR rotary OR lions)", max: 10 },

    // ── Cars & transport (12 months) ──
    { q: "newer_than:365d (car service OR rego OR registration OR mechanic OR tyres OR MOT OR roadside assist OR RACV OR NRMA)", max: 5 },
    { q: "newer_than:365d (parking OR toll OR myki OR opal OR go card OR public transport)", max: 5 },
  ];

  const seenIds = new Set<string>();
  const allMessages: EmailMessage[] = [];

  // Run queries in parallel batches of 5 for speed
  const BATCH_SIZE = 5;
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ q, max }) => {
        const msgs = await listGmailMessages(accessToken, q, max);
        const results: EmailMessage[] = [];
        for (const msg of msgs) {
          if (seenIds.has(msg.id)) continue;
          seenIds.add(msg.id);
          try {
            const full = await getGmailMessage(accessToken, msg.id);
            results.push({
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
          } catch { /* skip individual message */ }
        }
        return results;
      }),
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") allMessages.push(...r.value);
    }
  }

  console.log(`[profile-builder] Scanned ${allMessages.length} unique emails across ${queries.length} queries`);

  const sentEmails = allMessages.filter((m) => m.is_sent);
  const receivedEmails = allMessages.filter((m) => !m.is_sent);

  // Count contacts
  const contactCounts = new Map<string, { name: string; email: string; count: number }>();
  const skipPatterns = /noreply|no-reply|mailer-daemon|calendar-notification|notifications@|updates@|marketing@|support@|info@|hello@|team@|billing@|donotreply|bounce/i;
  for (const msg of allMessages) {
    const addresses = [msg.from, msg.to, msg.cc].join(", ");
    const emailMatches = addresses.match(/[\w.-]+@[\w.-]+/g) ?? [];
    for (const email of emailMatches) {
      const lower = email.toLowerCase();
      if (lower === userEmail.toLowerCase()) continue;
      if (skipPatterns.test(lower)) continue;
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
    .slice(0, 30);

  return { topContacts, sentEmails, receivedEmails, allMessages };
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
  personalEvents: Array<{ title: string; date: string }>;
}> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);
  const threeMonthsAhead = new Date(now.getTime() + 90 * 86400000);

  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${sixMonthsAgo.toISOString()}&timeMax=${threeMonthsAhead.toISOString()}` +
      `&maxResults=500&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!resp.ok) {
      console.warn(`[profile-builder] Calendar API error: ${resp.status}`);
      return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [], personalEvents: [] };
    }

    const data = await resp.json();
    const events = data.items ?? [];

    const pastEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) < now);
    const futureEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) >= now);

    const weeks = Math.max(1, Math.round(pastEvents.length > 0 ? (now.getTime() - sixMonthsAgo.getTime()) / (7 * 86400000) : 1));
    const weeklyRate = pastEvents.length > 0 ? Math.round(pastEvents.length / weeks) : null;
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
      .slice(0, 15)
      .map(([title, count]) => `${title} (${count}x in 9 months)`);

    const attendeeCounts = new Map<string, number>();
    for (const e of events) {
      for (const a of e.attendees ?? []) {
        if (a.self || !a.email) continue;
        attendeeCounts.set(a.email, (attendeeCounts.get(a.email) ?? 0) + 1);
      }
    }
    const keyCollaborators = [...attendeeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([email]) => email);

    const mapEvent = (e: any) => ({
      title: e.summary ?? "(no title)",
      date: e.start?.dateTime ?? e.start?.date ?? "",
      attendees: (e.attendees ?? []).filter((a: any) => !a.self).map((a: any) => a.email).slice(0, 5),
    });

    const personalKeywords = /gym|workout|run|yoga|pilates|surf|golf|tennis|swim|basketball|football|cricket|dinner|lunch|drinks|birthday|anniversary|date night|movie|cinema|concert|festival|doctor|dentist|physio|vet|haircut|massage|meditation|class|lesson|training|game|match|practice|personal|family|mum|dad|brother|sister/i;
    const personalEvents = events
      .filter((e: any) => {
        const title = (e.summary ?? "").toLowerCase();
        const noAttendees = !e.attendees || e.attendees.length <= 1;
        return noAttendees || personalKeywords.test(title);
      })
      .map((e: any) => ({
        title: e.summary ?? "(no title)",
        date: e.start?.dateTime ?? e.start?.date ?? "",
      }));

    return {
      meetingFrequency,
      recurringMeetings,
      keyCollaborators,
      recentEvents: pastEvents.slice(-30).map(mapEvent),
      upcomingEvents: futureEvents.slice(0, 25).map(mapEvent),
      personalEvents,
    };
  } catch (e) {
    console.warn(`[profile-builder] Calendar scan failed:`, (e as Error).message);
    return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [], personalEvents: [] };
  }
}

// Microsoft token helpers are imported from ../shared/gmail-helpers.ts
// (refreshMicrosoftAccessToken, getAllMicrosoftAccountTokens)

// ── Outlook Deep Scan (Microsoft Graph) ─────────────────────

async function deepScanOutlookEmails(
  accessToken: string,
  userEmail: string,
): Promise<{
  topContacts: Array<{ name: string; email: string; count: number }>;
  sentEmails: EmailMessage[];
  receivedEmails: EmailMessage[];
  allMessages: EmailMessage[];
}> {
  // Microsoft Graph uses $search or $filter for querying mail
  // We use a mix of folder-based and keyword-based queries to replicate Gmail scan coverage
  const searches = [
    // ── Work & general ──
    { folder: "sentitems", filter: "", top: 60, label: "sent" },
    { folder: "inbox", filter: "", top: 60, label: "inbox" },

    // ── Travel & bookings ──
    { folder: null, search: "flight OR boarding pass OR itinerary OR e-ticket", top: 20, label: "travel-flights" },
    { folder: null, search: "hotel OR airbnb OR booking.com OR vrbo", top: 15, label: "travel-hotels" },
    { folder: null, search: "first class OR business class OR lounge access OR seat upgrade", top: 10, label: "travel-class" },
    { folder: null, search: "loyalty OR frequent flyer OR points OR miles OR status", top: 10, label: "travel-loyalty" },

    // ── Spending & purchases ──
    { folder: null, search: "invoice OR receipt OR order confirmation OR payment received", top: 25, label: "purchases" },
    { folder: null, search: "subscription OR membership OR renewal OR billing", top: 20, label: "subscriptions" },
    { folder: null, search: "amazon OR ebay OR etsy OR order shipped OR tracking number", top: 20, label: "shopping" },
    { folder: null, search: "uber OR lyft OR doordash OR ubereats OR deliveroo OR grubhub", top: 15, label: "delivery" },

    // ── Fashion & clothing ──
    { folder: null, search: "ASOS OR Zara OR Uniqlo OR Nike OR Adidas OR Lululemon OR Patagonia", top: 10, label: "fashion" },

    // ── Property & housing ──
    { folder: null, search: "rent OR lease OR tenancy OR landlord OR property manager OR real estate OR zillow", top: 10, label: "housing" },
    { folder: null, search: "mortgage OR home loan OR settlement OR strata OR council rates", top: 10, label: "mortgage" },
    { folder: null, search: "electricity OR gas OR water OR internet OR broadband bill OR statement", top: 10, label: "utilities" },
    { folder: null, search: "insurance OR contents insurance OR home insurance OR car insurance", top: 10, label: "insurance" },

    // ── Side projects & tech ──
    { folder: null, search: "github OR gitlab OR vercel OR netlify OR heroku OR railway OR fly.io", top: 15, label: "tech" },
    { folder: null, search: "aws OR digitalocean OR cloudflare OR stripe OR twilio OR sendgrid", top: 10, label: "cloud" },
    { folder: null, search: "domain registration OR SSL OR hosting OR deploy OR production", top: 10, label: "hosting" },

    // ── Sports, fitness, hobbies ──
    { folder: null, search: "strava OR garmin OR fitbit OR peloton OR gym OR crossfit OR yoga", top: 10, label: "fitness" },
    { folder: null, search: "marathon OR half marathon OR parkrun OR triathlon OR race registration", top: 10, label: "races" },
    { folder: null, search: "golf OR tennis OR cricket OR football OR soccer OR basketball OR rugby OR surfing OR skiing", top: 10, label: "sports" },

    // ── Entertainment & subscriptions ──
    { folder: null, search: "spotify OR netflix OR disney OR apple tv OR hulu OR HBO OR youtube premium", top: 10, label: "streaming" },
    { folder: null, search: "eventbrite OR meetup OR tickets OR concert OR festival OR theatre", top: 10, label: "events" },

    // ── Family & personal ──
    { folder: null, search: "mum OR mom OR dad OR brother OR sister OR family OR parents", top: 10, label: "family" },
    { folder: null, search: "surprise OR secret OR birthday party OR engagement OR anniversary", top: 5, label: "secrets" },

    // ── Health & wellness ──
    { folder: null, search: "doctor OR dentist OR physio OR therapist OR appointment confirmation", top: 5, label: "health" },

    // ── Pets ──
    { folder: null, search: "pet OR vet OR veterinary OR dog OR cat OR pet insurance", top: 5, label: "pets" },

    // ── Learning & education ──
    { folder: null, search: "course OR udemy OR coursera OR masterclass OR certification OR bootcamp", top: 10, label: "learning" },

    // ── Community ──
    { folder: null, search: "club OR association OR volunteer OR charity OR donation OR community", top: 10, label: "community" },

    // ── Cars & transport ──
    { folder: null, search: "car service OR registration OR mechanic OR parking OR toll OR public transport", top: 5, label: "transport" },
  ];

  const seenIds = new Set<string>();
  const allMessages: EmailMessage[] = [];
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();

  const BATCH_SIZE = 5;
  for (let i = 0; i < searches.length; i += BATCH_SIZE) {
    const batch = searches.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (query) => {
        let url: string;
        if (query.folder) {
          // Folder-based: get recent messages from specific folder
          url = `https://graph.microsoft.com/v1.0/me/mailFolders/${query.folder}/messages?` +
            `$top=${query.top}&$orderby=receivedDateTime desc` +
            `&$filter=receivedDateTime ge ${sixMonthsAgo}` +
            `&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime`;
        } else {
          // Search-based: search across all folders
          url = `https://graph.microsoft.com/v1.0/me/messages?` +
            `$top=${query.top}&$search="${encodeURIComponent(query.search!)}"` +
            `&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime`;
        }

        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!resp.ok) {
          console.warn(`[profile-builder] Outlook query '${query.label}' failed: ${resp.status}`);
          return [];
        }

        const data = await resp.json();
        const messages = data.value ?? [];
        const results: EmailMessage[] = [];

        for (const msg of messages) {
          if (seenIds.has(msg.id)) continue;
          seenIds.add(msg.id);

          const fromAddr = msg.from?.emailAddress?.address ?? "";
          const fromName = msg.from?.emailAddress?.name ?? "";
          const fromStr = fromName ? `${fromName} <${fromAddr}>` : fromAddr;

          const toAddrs = (msg.toRecipients ?? [])
            .map((r: any) => r.emailAddress?.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress?.address ?? "")
            .join(", ");

          const ccAddrs = (msg.ccRecipients ?? [])
            .map((r: any) => r.emailAddress?.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress?.address ?? "")
            .join(", ");

          const isSent = fromAddr.toLowerCase() === userEmail.toLowerCase() ||
            query.folder === "sentitems";

          // Use bodyPreview (up to 255 chars) for snippet, body content for full
          const bodyContent = msg.body?.content ?? "";
          // Strip HTML tags for plain text
          const plainBody = bodyContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);

          results.push({
            from: fromStr,
            to: toAddrs,
            cc: ccAddrs,
            subject: msg.subject ?? "",
            snippet: msg.bodyPreview ?? "",
            body: plainBody || msg.bodyPreview || "",
            date: msg.receivedDateTime ?? msg.sentDateTime ?? "",
            is_sent: isSent,
            labels: [query.label],
          });
        }
        return results;
      }),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") allMessages.push(...r.value);
    }
  }

  console.log(`[profile-builder] Outlook scan: ${allMessages.length} unique emails across ${searches.length} queries`);

  const sentEmails = allMessages.filter((m) => m.is_sent);
  const receivedEmails = allMessages.filter((m) => !m.is_sent);

  // Count contacts
  const contactCounts = new Map<string, { name: string; email: string; count: number }>();
  const skipPatterns = /noreply|no-reply|mailer-daemon|notifications@|updates@|marketing@|support@|info@|hello@|team@|billing@|donotreply|bounce/i;
  for (const msg of allMessages) {
    const addresses = [msg.from, msg.to, msg.cc].join(", ");
    const emailMatches = addresses.match(/[\w.-]+@[\w.-]+/g) ?? [];
    for (const email of emailMatches) {
      const lower = email.toLowerCase();
      if (lower === userEmail.toLowerCase()) continue;
      if (skipPatterns.test(lower)) continue;
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
    .slice(0, 30);

  return { topContacts, sentEmails, receivedEmails, allMessages };
}

// ── Outlook Calendar Deep Scan (Microsoft Graph) ────────────

async function deepScanOutlookCalendar(
  accessToken: string,
): Promise<{
  meetingFrequency: string | null;
  recurringMeetings: string[];
  keyCollaborators: string[];
  recentEvents: Array<{ title: string; date: string; attendees: string[] }>;
  upcomingEvents: Array<{ title: string; date: string; attendees: string[] }>;
  personalEvents: Array<{ title: string; date: string }>;
}> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);
  const threeMonthsAhead = new Date(now.getTime() + 90 * 86400000);

  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?` +
      `startDateTime=${sixMonthsAgo.toISOString()}&endDateTime=${threeMonthsAhead.toISOString()}` +
      `&$top=500&$orderby=start/dateTime` +
      `&$select=subject,start,end,attendees,isAllDay,organizer`,
      { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } },
    );

    if (!resp.ok) {
      console.warn(`[profile-builder] Outlook Calendar API error: ${resp.status}`);
      return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [], personalEvents: [] };
    }

    const data = await resp.json();
    const events = data.value ?? [];

    const pastEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) < now);
    const futureEvents = events.filter((e: any) => new Date(e.start?.dateTime ?? e.start?.date) >= now);

    const weeks = Math.max(1, Math.round(pastEvents.length > 0 ? (now.getTime() - sixMonthsAgo.getTime()) / (7 * 86400000) : 1));
    const weeklyRate = pastEvents.length > 0 ? Math.round(pastEvents.length / weeks) : null;
    const meetingFrequency = weeklyRate
      ? weeklyRate > 20 ? "very heavy (20+ per week)"
      : weeklyRate > 10 ? "heavy (10-20 per week)"
      : weeklyRate > 5 ? "moderate (5-10 per week)"
      : "light (under 5 per week)"
      : null;

    const titleCounts = new Map<string, number>();
    for (const e of events) {
      const title = e.subject?.trim();
      if (title) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    }
    const recurringMeetings = [...titleCounts.entries()]
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([title, count]) => `${title} (${count}x in 9 months)`);

    const attendeeCounts = new Map<string, number>();
    for (const e of events) {
      for (const a of e.attendees ?? []) {
        const email = a.emailAddress?.address;
        if (!email) continue;
        attendeeCounts.set(email, (attendeeCounts.get(email) ?? 0) + 1);
      }
    }
    const keyCollaborators = [...attendeeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([email]) => email);

    const mapEvent = (e: any) => ({
      title: e.subject ?? "(no title)",
      date: e.start?.dateTime ?? "",
      attendees: (e.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean).slice(0, 5),
    });

    const personalKeywords = /gym|workout|run|yoga|pilates|surf|golf|tennis|swim|basketball|football|cricket|dinner|lunch|drinks|birthday|anniversary|date night|movie|cinema|concert|festival|doctor|dentist|physio|vet|haircut|massage|meditation|class|lesson|training|game|match|practice|personal|family|mum|dad|brother|sister/i;
    const personalEvents = events
      .filter((e: any) => {
        const title = (e.subject ?? "").toLowerCase();
        const noAttendees = !e.attendees || e.attendees.length <= 1;
        return noAttendees || personalKeywords.test(title);
      })
      .map((e: any) => ({
        title: e.subject ?? "(no title)",
        date: e.start?.dateTime ?? "",
      }));

    return {
      meetingFrequency,
      recurringMeetings,
      keyCollaborators,
      recentEvents: pastEvents.slice(-30).map(mapEvent),
      upcomingEvents: futureEvents.slice(0, 25).map(mapEvent),
      personalEvents,
    };
  } catch (e) {
    console.warn(`[profile-builder] Outlook calendar scan failed:`, (e as Error).message);
    return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [], personalEvents: [] };
  }
}

// ── Web Search ──────────────────────────────────────────────

async function searchWeb(query: string): Promise<string | null> {
  if (!tavilyApiKey) return null;
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: 3, search_depth: "basic" }),
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
    allMessages: EmailMessage[];
  },
  calendarData: {
    meetingFrequency: string | null;
    recurringMeetings: string[];
    keyCollaborators: string[];
    recentEvents: Array<{ title: string; date: string; attendees: string[] }>;
    upcomingEvents: Array<{ title: string; date: string; attendees: string[] }>;
    personalEvents: Array<{ title: string; date: string }>;
  },
  linkedinInfo: string | null,
): Promise<Record<string, any>> {
  if (!openaiApiKey) return {};

  const sentBodies = emailData.sentEmails
    .slice(0, 40)
    .map((m) => `[SENT ${m.date}] To: ${m.to}\nSubject: ${m.subject}\n${m.body}`)
    .join("\n---\n");

  const receivedSummary = emailData.receivedEmails
    .slice(0, 40)
    .map((m) => `[RECEIVED ${m.date}] From: ${m.from}\nSubject: ${m.subject}\n${m.snippet}`)
    .join("\n---\n");

  const calendarSummary = [
    ...calendarData.recentEvents.map((e) => `[PAST] ${e.date}: ${e.title} (${e.attendees.join(", ")})`),
    ...calendarData.upcomingEvents.map((e) => `[UPCOMING] ${e.date}: ${e.title} (${e.attendees.join(", ")})`),
  ].join("\n");

  const personalCalendarSummary = calendarData.personalEvents
    .map((e) => `${e.date}: ${e.title}`)
    .join("\n");

  const weeklyVolume = emailData.allMessages.filter((m) =>
    Date.now() - new Date(m.date).getTime() < 7 * 86400000,
  ).length;

  const context = [
    `User: ${name} (${email})`,
    pdlContext ? `\n── PROFESSIONAL PROFILE (PDL) ──\n${pdlContext}` : "",
    companyInfo ? `\n── COMPANY ──\n${companyInfo}` : "",
    linkedinInfo ? `\n── WEB/LINKEDIN ──\n${linkedinInfo}` : "",
    `\n── SENT EMAILS (their actual words, 6-12 months) ──\n${sentBodies || "(none found)"}`,
    `\n── RECEIVED EMAILS (6-12 months) ──\n${receivedSummary || "(none found)"}`,
    `\n── CALENDAR (9 months) ──\n${calendarSummary || "(none found)"}`,
    personalCalendarSummary ? `\n── PERSONAL CALENDAR EVENTS (non-work) ──\n${personalCalendarSummary}` : "",
    `\n── CONTACTS ──\n${emailData.topContacts.map((c) => `${c.name} <${c.email}> (${c.count} emails)`).join("\n")}`,
    `\n── STATS ──\nTotal emails scanned: ${emailData.allMessages.length}\nWeekly email volume: ~${weeklyVolume} emails/week\nMeeting load: ${calendarData.meetingFrequency ?? "unknown"}\nRecurring meetings: ${calendarData.recurringMeetings.join(", ") || "none detected"}`,
  ].filter(Boolean).join("\n");

  const MAX_CONTEXT_CHARS = 120_000;
  let finalContext = context;
  if (finalContext.length > MAX_CONTEXT_CHARS) {
    console.warn(`[profile-builder] Context too large (${finalContext.length} chars), truncating to ${MAX_CONTEXT_CHARS}`);
    finalContext = finalContext.slice(0, MAX_CONTEXT_CHARS) + "\n\n[... truncated for length]";
  }

  console.log(`[profile-builder] LLM context: ${finalContext.length} chars (original: ${context.length}), ${emailData.allMessages.length} emails, ${calendarData.recentEvents.length + calendarData.upcomingEvents.length} cal events`);

  const systemPrompt = `You are building the most comprehensive profile possible of a real person for their personal AI assistant. The assistant needs to know this person as well as a close friend would — their habits, quirks, relationships, ambitions, stresses, lifestyle, and the things they'd never expect an AI to notice.

You have access to 6-12 months of their email and calendar data. Your job is to be a forensic detective. Cross-reference everything. A receipt from ASOS + a calendar event "suit fitting" = they care about how they dress. An email to "kate@lidgett.net" + a booking CC'd to the same address = likely sibling or partner. A mortgage statement = they own property. Rent receipts = they rent. Utility bills reveal where they live. Flight class reveals lifestyle tier.

Return a JSON object with ALL of these keys (use empty arrays/null if no evidence, NEVER fabricate):

{
  "email_themes": ["5-10 specific work topics they deal with regularly"],
  "tone_markers": ["5-8 phrases/patterns that characterise how they write"],
  "industry_jargon": ["5-10 industry-specific terms or acronyms they use"],
  "frustrations": ["3-5 things that frustrate or stress them"],
  "preferences": ["3-5 things they clearly prefer or value"],
  "values": ["3-5 core values evident from behaviour"],
  "communication_style": "2-3 sentences on their communication personality",
  "decision_making": "1-2 sentences on how they make decisions",
  "writing_style": "One detailed sentence about their email writing style",
  "typical_day": "3-4 sentences painting their typical day (work + personal)",

  "job_in_context": "2-3 sentences analysing what their job title + company + behaviour reveals about them as a person. What does it say that someone with this background is also doing X, Y, Z on the side? What tensions or ambitions does this reveal? This should be insightful, not just restating their title.",

  "housing_situation": "What's their living situation? Own or rent? House or apartment? Evidence: mortgage emails = owns, rent/lease/tenancy emails = rents, strata/body corporate = apartment/unit, council rates = house. State clearly what the evidence suggests.",
  "housing_location": "Where exactly do they live? Look at utility bills, property emails, delivery addresses, council names. Be as specific as possible (suburb, city, country).",
  "housing_signals": ["specific evidence: 'mortgage statement from ANZ', 'rent payment to Ray White', 'electricity bill for 42 Smith St Ashburton', 'NBN connection at Richmond address'"],

  "family_members": [{"name": "person name", "relationship": "specific: 'brother', 'sister', 'mum', 'dad', 'partner', 'wife', 'husband', 'son', 'daughter'", "context": "evidence: 'shares @lidgett.net email domain', 'CC'd on family holiday booking', 'calendar event: Dinner with Mum'"}],
  "family_structure": "1-2 sentences: do they have siblings? Parents they're in touch with? Kids? Partner? What does the family picture look like?",
  "family_signals": ["specific evidence for each family connection detected"],

  "side_projects": ["EVERY side project, business, startup, freelance gig, or creative endeavour. Be exhaustive. Look for: domain registrations, hosting emails, business registration, app store emails, GitHub/Vercel/Stripe notifications, incorporation documents. Include the project name, what it appears to be, and evidence."],
  "sports_and_fitness": ["specific sports, fitness routines, races, teams. e.g. 'member of F45 Richmond', 'ran Melbourne Marathon Oct 2025 (3:42)', 'plays Thursday night basketball at MSAC'"],
  "subscriptions_and_memberships": ["EVERY subscription and membership detected. Streaming, fitness, software, coworking, clubs, professional associations. Include tier/plan if visible."],
  "food_and_dining": ["food delivery patterns, favourite restaurants/cuisines, dietary signals, cooking interests"],
  "guilty_pleasures": ["things they spend time/money on that they might not broadcast"],
  "secrets_and_surprises": ["anything being planned secretly: surprise parties, proposals, secret gifts, hidden purchases"],
  "pets": ["any pets detected: species, name if known, vet visits, pet insurance, pet food orders"],
  "health_and_wellness": ["health signals: regular appointments, prescriptions, fitness tracking, mental health, supplements"],
  "learning": ["courses, certifications, languages, skills they're actively learning"],

  "travel_history": ["EVERY trip detected in the last 12 months with dates, destinations, accommodation, and any details"],
  "travel_style": "How do they travel? First class or economy? Luxury hotels or hostels? Planned or spontaneous? Solo or group? Do they have airline loyalty status? What does their travel say about them?",

  "clothing_brands": ["every clothing/fashion brand detected from order confirmations, receipts, or shopping emails"],
  "style_signals": ["what their purchases say about their style: 'buys mostly streetwear', 'ordered a tailored suit', 'shops at luxury retailers', 'practical outdoor gear focus'"],
  "notable_fashion_purchases": ["specific clothing/accessory purchases with details and amounts if visible"],

  "notable_purchases": ["ALL significant purchases detected. Include amounts, dates, and what was bought. Everything from electronics to furniture to gifts to experiences."],
  "spending_patterns": ["overall spending behaviour analysis: frugal or generous? Categories they spend most on? Impulse buyer? Budget-conscious?"],
  "subscription_services": ["comprehensive list of every paid service/subscription with tier/plan if visible"],
  "lifestyle_tier": "Based on ALL evidence (travel class, hotel choices, clothing brands, spending patterns, car, housing), what lifestyle tier are they? e.g. 'budget-conscious professional', 'comfortable middle-class with occasional splurges', 'high-income with luxury tastes', 'frugal despite high income'. Be specific and evidence-based.",

  "inner_circle": [{"name": "person name", "relationship": "specific relationship", "context": "evidence from emails/calendar"}],
  "social_style": "1-2 sentences on their social life",
  "group_memberships": ["clubs, teams, associations, communities, alumni groups, coworking spaces"],

  "hobbies": ["comprehensive list of ALL hobbies and interests"],
  "upcoming_events": ["all notable upcoming events detected"],
  "personal_commitments": ["ongoing commitments: house hunting, wedding planning, study, family care, etc."],
  "interests": ["broader interests and passions inferred from all data"],

  "hidden_gems": ["5-8 of the most surprising, specific, 'wow how does it know that' insights. These should be things that would genuinely impress the user. Cross-reference data points. Be specific with names, dates, amounts, patterns."],

  "contact_relationships": [{"name": "name", "email": "email", "relationship": "specific description"}],
  "summary": "A rich 10-12 sentence profile summary. This should read like a character study written by someone who knows them well. Cover: who they are professionally, what they're building on the side, their personality and communication style, their family situation, where and how they live, how they spend their money, what they do for fun, what's currently on their mind, what stresses them, and what makes them tick. Be vivid, specific, and reference actual evidence. No generic filler."
}

DETECTIVE RULES:
- Cross-reference EVERYTHING. Same surname in email addresses = likely family. Hotel booking + flight = trip. Recurring calendar event + no attendees = personal routine.
- Receipts are the most honest data source. People's spending reveals their true priorities.
- Look at email domains: shared family domains (e.g. multiple @lidgett.net addresses) reveal family members.
- Flight confirmations reveal travel class (economy, premium economy, business, first). Hotel bookings reveal budget preferences.
- Utility bills and property emails reveal housing situation (rent vs own) and exact location.
- Clothing brand order confirmations reveal style and lifestyle tier.
- Side projects are often hidden in plain sight: hosting notifications, domain emails, business registration, app store emails, payment processor notifications.
- Calendar events with no attendees or personal keywords are gold for understanding their real life.
- The GAP between their job title and their side activities is often the most interesting insight.
- NEVER fabricate. Empty array is better than a guess. But where evidence exists, go DEEP.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        max_completion_tokens: 10000,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalContext },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[profile-builder] OpenAI error ${resp.status}: ${errBody.slice(0, 500)}`);
      return {};
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
    const usage = data.usage ?? {};
    console.log(`[profile-builder] LLM: ${content.length} chars, finish=${finishReason}, tokens: in=${usage.prompt_tokens ?? "?"} out=${usage.completion_tokens ?? "?"}`);

    if (finishReason === "length") {
      console.warn(`[profile-builder] Response truncated at max_completion_tokens`);
    }

    try {
      const parsed = JSON.parse(content);
      console.log(`[profile-builder] Parsed ${Object.keys(parsed).length} keys`);
      return parsed;
    } catch (parseErr) {
      console.error(`[profile-builder] JSON parse failed: ${(parseErr as Error).message}. Start: ${content.slice(0, 300)}`);
      return {};
    }
  } catch (e) {
    console.error(`[profile-builder] Synthesis failed:`, (e as Error).message);
    return {};
  }
}

// ── Helpers ──────────────────────────────────────────────────

const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
};
const str = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v;
  if (Array.isArray(v)) return v.join("; ");
  return null;
};

// ── Main Handler ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const start = Date.now();

  let userId: string;
  let provider: string = "google";
  try {
    const body = await req.json();
    userId = body.user_id;
    provider = body.provider ?? "google";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!userId) return json({ error: "missing_user_id" }, 400);

  const isMicrosoft = provider === "azure" || provider === "microsoft";
  console.log(`[profile-builder] Starting v4 deep profile build for ${userId} (provider: ${provider})`);

  try {
    // Get account tokens based on provider
    const googleAccounts = await getAllAccountTokens(admin, userId).catch(() => [] as AccountToken[]);
    const microsoftAccounts = await getAllMicrosoftAccountTokens(admin, userId).catch(() => [] as AccountToken[]);
    const accounts = [...googleAccounts, ...microsoftAccounts];

    if (accounts.length === 0) {
      return json({ error: "no_accounts", detail: "User has no connected Google or Microsoft accounts" }, 400);
    }

    const { data: imsgUser } = await admin
      .from("imessage_users")
      .select("phone_number, pdl_profile, google_email, display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const primaryAcct = accounts.find((a) => a.isPrimary) ?? accounts[0];
    const email = primaryAcct.email;
    const name = imsgUser?.display_name ?? "Unknown";
    const phone = imsgUser?.phone_number ?? null;

    const companyDomains = accounts
      .map((a) => lookupCompanyDomain(a.email))
      .filter(Boolean) as string[];
    const companyDomain = companyDomains[0] ?? null;

    const googleEmails = new Set(googleAccounts.map((a) => a.email));
    console.log(`[profile-builder] User: ${name} | Google: ${googleAccounts.map((a) => a.email).join(", ") || "none"} | Microsoft: ${microsoftAccounts.map((a) => a.email).join(", ") || "none"}`);

    // Scan ALL connected accounts in parallel (using appropriate API per provider)
    const perAccountScans = await Promise.all(
      accounts.map(async (acct) => {
        const isGoogleAcct = googleEmails.has(acct.email);
        console.log(`[profile-builder] Scanning ${acct.email} (${isGoogleAcct ? "Google" : "Microsoft"})...`);
        const [emails, calendar] = await Promise.all([
          (isGoogleAcct
            ? deepScanEmails(acct.accessToken, acct.email)
            : deepScanOutlookEmails(acct.accessToken, acct.email)
          ).catch((e) => {
            console.warn(`[profile-builder] Email scan failed for ${acct.email}:`, (e as Error).message);
            return { topContacts: [], sentEmails: [], receivedEmails: [], allMessages: [] } as Awaited<ReturnType<typeof deepScanEmails>>;
          }),
          (isGoogleAcct
            ? deepScanCalendar(acct.accessToken)
            : deepScanOutlookCalendar(acct.accessToken)
          ).catch((e) => {
            console.warn(`[profile-builder] Calendar scan failed for ${acct.email}:`, (e as Error).message);
            return { meetingFrequency: null, recurringMeetings: [], keyCollaborators: [], recentEvents: [], upcomingEvents: [], personalEvents: [] } as Awaited<ReturnType<typeof deepScanCalendar>>;
          }),
        ]);
        return { acct, emails, calendar };
      }),
    );

    // Merge email data
    const mergedEmailData = {
      topContacts: [] as Array<{ name: string; email: string; count: number }>,
      sentEmails: [] as EmailMessage[],
      receivedEmails: [] as EmailMessage[],
      allMessages: [] as EmailMessage[],
    };

    const contactAgg = new Map<string, { name: string; email: string; count: number }>();
    for (const { emails } of perAccountScans) {
      mergedEmailData.sentEmails.push(...emails.sentEmails);
      mergedEmailData.receivedEmails.push(...emails.receivedEmails);
      mergedEmailData.allMessages.push(...emails.allMessages);
      for (const c of emails.topContacts) {
        const existing = contactAgg.get(c.email);
        if (existing) existing.count += c.count;
        else contactAgg.set(c.email, { ...c });
      }
    }
    mergedEmailData.topContacts = [...contactAgg.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // Merge calendar data
    const mergedCalendarData = {
      meetingFrequency: null as string | null,
      recurringMeetings: [] as string[],
      keyCollaborators: [] as string[],
      recentEvents: [] as Array<{ title: string; date: string; attendees: string[] }>,
      upcomingEvents: [] as Array<{ title: string; date: string; attendees: string[] }>,
      personalEvents: [] as Array<{ title: string; date: string }>,
    };

    const seenRecurring = new Set<string>();
    const collabCounts = new Map<string, number>();
    let totalWeeklyMeetings = 0;

    for (const { calendar } of perAccountScans) {
      mergedCalendarData.recentEvents.push(...calendar.recentEvents);
      mergedCalendarData.upcomingEvents.push(...calendar.upcomingEvents);
      mergedCalendarData.personalEvents.push(...calendar.personalEvents);
      for (const r of calendar.recurringMeetings) {
        if (!seenRecurring.has(r)) { seenRecurring.add(r); mergedCalendarData.recurringMeetings.push(r); }
      }
      for (const c of calendar.keyCollaborators) {
        collabCounts.set(c, (collabCounts.get(c) ?? 0) + 1);
      }
      if (calendar.meetingFrequency) {
        const match = calendar.meetingFrequency.match(/\d+/);
        if (match) totalWeeklyMeetings += parseInt(match[0], 10);
      }
    }

    mergedCalendarData.keyCollaborators = [...collabCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([e]) => e);
    mergedCalendarData.meetingFrequency = totalWeeklyMeetings > 20 ? "very heavy (20+ per week)"
      : totalWeeklyMeetings > 10 ? "heavy (10-20 per week)"
      : totalWeeklyMeetings > 5 ? "moderate (5-10 per week)"
      : totalWeeklyMeetings > 0 ? "light (under 5 per week)" : null;
    mergedCalendarData.recentEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    mergedCalendarData.upcomingEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const emailData = mergedEmailData;
    const calendarData = mergedCalendarData;

    console.log(`[profile-builder] Total: ${emailData.allMessages.length} emails (${emailData.sentEmails.length} sent), ${calendarData.recentEvents.length + calendarData.upcomingEvents.length} cal events (${calendarData.personalEvents.length} personal)`);

    // PDL + company info (parallel)
    const [pdlProfile, companyInfo] = await Promise.all([
      (async (): Promise<PDLProfile | null> => {
        const cached = imsgUser?.pdl_profile as PDLProfile | null;
        if (cached?.job_title) return cached;
        for (const acct of accounts) {
          const domain = lookupCompanyDomain(acct.email);
          if (domain) {
            const result = await enrichByIdentity({ email: acct.email, name, phone: phone ?? undefined });
            if (result?.job_title) return result;
          }
        }
        return enrichByIdentity({ email, name, phone: phone ?? undefined });
      })(),
      companyDomain
        ? searchWeb(`What does ${companyDomain} company do? Brief description of the business`)
        : Promise.resolve(null),
    ]);

    const webInfo = pdlProfile?.linkedin_url
      ? await searchWeb(`${name} ${pdlProfile.job_title ?? ""} ${pdlProfile.job_company_name ?? ""} professional background`)
      : name && companyDomain
      ? await searchWeb(`${name} ${companyDomain} professional background`)
      : null;

    // LLM synthesis
    const pdlContext = pdlProfile ? profileToContext(pdlProfile) : null;
    console.log(`[profile-builder] Starting LLM synthesis...`);
    const synthesisStart = Date.now();
    const s = await synthesiseProfile(name, email, pdlContext, companyInfo, emailData, calendarData, webInfo);
    console.log(`[profile-builder] LLM synthesis took ${Date.now() - synthesisStart}ms, ${Object.keys(s).length} keys`);

    // Build profile
    const profile: UserProfile = {
      built_at: new Date().toISOString(),
      version: 4,
      identity: {
        name, email, phone,
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
            duration: e.start_date && e.end_date ? `${e.start_date} – ${e.end_date}` : e.start_date ?? "unknown",
          })),
        job_in_context: str(s.job_in_context),
      },
      communication: {
        top_contacts: (Array.isArray(s.contact_relationships) ? s.contact_relationships : emailData.topContacts.slice(0, 10)).map((c: any) => ({
          name: c.name ?? "unknown", email: c.email ?? "",
          frequency: c.count ? (c.count > 10 ? "very frequent" : c.count > 5 ? "frequent" : "occasional") : "unknown",
          relationship: c.relationship ?? "unknown",
        })),
        email_themes: arr(s.email_themes),
        writing_style: str(s.writing_style),
        typical_email_volume: emailData.allMessages.length > 0
          ? (() => {
              const week = emailData.allMessages.filter((m) => Date.now() - new Date(m.date).getTime() < 7 * 86400000).length;
              return week > 50 ? "very high" : week > 20 ? "high" : week > 10 ? "moderate" : "low";
            })()
          : null,
        tone_markers: arr(s.tone_markers),
        industry_jargon: arr(s.industry_jargon),
      },
      schedule: {
        meeting_frequency: calendarData.meetingFrequency,
        recurring_meetings: calendarData.recurringMeetings,
        typical_day_shape: str(s.typical_day),
        key_collaborators: calendarData.keyCollaborators.slice(0, 10),
      },
      personality: {
        frustrations: arr(s.frustrations),
        preferences: arr(s.preferences),
        values: arr(s.values),
        communication_style: str(s.communication_style),
        decision_making: str(s.decision_making),
      },
      housing: {
        situation: str(s.housing_situation),
        location_details: str(s.housing_location),
        signals: arr(s.housing_signals),
      },
      family: {
        members: Array.isArray(s.family_members) ? s.family_members : [],
        family_structure: str(s.family_structure),
        signals: arr(s.family_signals),
      },
      life: {
        hobbies: arr(s.hobbies),
        travel: arr(s.travel_history),
        travel_style: str(s.travel_style),
        upcoming_events: arr(s.upcoming_events),
        personal_commitments: arr(s.personal_commitments),
        side_projects: arr(s.side_projects),
        sports_and_fitness: arr(s.sports_and_fitness),
        subscriptions_and_memberships: arr(s.subscriptions_and_memberships),
        food_and_dining: arr(s.food_and_dining),
        guilty_pleasures: arr(s.guilty_pleasures),
        secrets_and_surprises: arr(s.secrets_and_surprises),
        pets: arr(s.pets),
        health_and_wellness: arr(s.health_and_wellness),
        learning: arr(s.learning),
      },
      fashion_and_style: {
        clothing_brands: arr(s.clothing_brands),
        style_signals: arr(s.style_signals),
        notable_fashion_purchases: arr(s.notable_fashion_purchases),
      },
      financial: {
        spending_patterns: arr(s.spending_patterns),
        notable_purchases: arr(s.notable_purchases),
        subscriptions: arr(s.subscription_services),
        lifestyle_tier: str(s.lifestyle_tier),
      },
      social: {
        inner_circle: Array.isArray(s.inner_circle) ? s.inner_circle : [],
        social_style: str(s.social_style),
        group_memberships: arr(s.group_memberships),
      },
      interests: [...arr(s.hobbies), ...arr(s.interests)],
      hidden_gems: arr(s.hidden_gems),
      summary: str(s.summary) ?? "",
    };

    // Save
    const { error: updateErr } = await admin
      .from("imessage_users")
      .update({ user_profile: profile, profile_built_at: profile.built_at, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (updateErr) {
      console.error(`[profile-builder] DB update failed:`, updateErr.message);
      return json({ error: "db_update_failed", detail: updateErr.message }, 500);
    }

    const elapsed = Date.now() - start;
    console.log(`[profile-builder] ✓ Profile v4 built for ${name} in ${elapsed}ms | ${emailData.allMessages.length} emails | ${Object.keys(s).length} synthesis keys`);

    return json({ success: true, profile, elapsed_ms: elapsed });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[profile-builder] Failed:`, msg);
    return json({ error: "build_failed", detail: msg }, 500);
  }
});
