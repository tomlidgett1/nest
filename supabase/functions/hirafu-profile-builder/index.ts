// hirafu-profile-builder — Deep user profile building for Hirafu.
//
// Builds a comprehensive profile from Gmail, Calendar, PDL, and web search.
// Stores in hirafu_users.user_profile.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getGoogleAccessToken,
  getAllAccountTokens,
  fetchCalendarTimezone,
} from "../_shared/gmail-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_QUERY_CATEGORIES = [
  "from:me subject:re:", "label:sent", "subject:booking OR reservation OR confirmation",
  "subject:receipt OR invoice OR order", "subject:flight OR boarding pass OR itinerary",
  "subject:hotel OR airbnb OR accommodation", "subject:subscription OR membership",
  "subject:interview OR offer OR application", "from:linkedin.com",
  "subject:meeting OR agenda OR minutes", "subject:project OR sprint OR standup",
  "subject:birthday OR anniversary", "from:uber OR lyft OR grab",
  "subject:gym OR fitness OR workout", "subject:mortgage OR rent OR lease",
  "subject:insurance", "subject:school OR university OR course",
];

const SYNTHESIS_PROMPT = `You are building the most comprehensive profile possible of a real person for their personal AI assistant. The assistant needs to know this person as well as a close friend would.

You have access to their email and calendar data. Cross-reference everything. A receipt from ASOS + a calendar event "suit fitting" = they care about how they dress. An email to "kate@example.com" + a booking CC'd to the same address = likely sibling or partner.

Return a JSON object with these keys (use empty arrays/null if no evidence, NEVER fabricate):

{
  "identity": { "full_name": "", "primary_email": "", "phone": "" },
  "professional": {
    "current_role": "", "company": "", "industry": "",
    "email_themes": ["5-10 work topics"], "tone_markers": ["how they write"]
  },
  "communication": {
    "email_style": "", "formality_level": 1-5, "response_speed": "",
    "sign_off_patterns": [], "greeting_patterns": []
  },
  "schedule": {
    "typical_day": "", "meeting_frequency": "", "travel_frequency": "",
    "time_zone_patterns": ""
  },
  "personality": {
    "interests": [], "values": [], "decision_style": "",
    "stress_indicators": [], "energy_patterns": ""
  },
  "life": {
    "housing_situation": "", "family_members": [{"name": "", "relationship": "", "context": ""}],
    "side_projects": [], "travel_history": [], "social_patterns": ""
  },
  "hidden_gems": ["5-8 surprising, specific insights"],
  "summary": "Rich 10-12 sentence profile summary"
}

RULES:
- Cross-reference EVERYTHING. Same surname = likely family. Hotel + flight = trip.
- Receipts are the most honest data source.
- NEVER fabricate. Empty is better than a guess.
- Return ONLY valid JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { user_id: userId, provider = "google" } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[hirafu-profile] Building profile for ${userId} (${provider})`);

    // Get access token
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(supabase, userId);
    } catch (e) {
      console.error("[hirafu-profile] Failed to get access token:", e);
      return new Response(JSON.stringify({ error: "Failed to authenticate with Google" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Fetch timezone
    try {
      const tz = await fetchCalendarTimezone(accessToken);
      if (tz) {
        await supabase
          .from("user_google_accounts")
          .update({ timezone: tz })
          .eq("user_id", userId);
      }
    } catch { /* non-critical */ }

    // Fetch emails across categories (parallel, capped)
    const emailPromises = GMAIL_QUERY_CATEGORIES.map(async (query) => {
      try {
        const listResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!listResp.ok) return [];
        const listData = await listResp.json();
        const messages = listData.messages ?? [];

        const details = await Promise.all(
          messages.slice(0, 3).map(async (msg: any) => {
            const detailResp = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!detailResp.ok) return null;
            const detail = await detailResp.json();
            const headers = detail.payload?.headers ?? [];
            return {
              from: headers.find((h: any) => h.name === "From")?.value ?? "",
              to: headers.find((h: any) => h.name === "To")?.value ?? "",
              subject: headers.find((h: any) => h.name === "Subject")?.value ?? "",
              date: headers.find((h: any) => h.name === "Date")?.value ?? "",
              snippet: detail.snippet ?? "",
            };
          })
        );

        return details.filter(Boolean);
      } catch {
        return [];
      }
    });

    // Fetch calendar events (6 months past, 3 months future)
    const now = new Date();
    const calStart = new Date(now.getTime() - 180 * 86400000).toISOString();
    const calEnd = new Date(now.getTime() + 90 * 86400000).toISOString();

    const calendarPromise = fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${calStart}&timeMax=${calEnd}&maxResults=200&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }));

    const [emailResults, calendarData] = await Promise.all([
      Promise.all(emailPromises),
      calendarPromise,
    ]);

    // Build context for synthesis
    const emailContext = emailResults
      .flat()
      .filter(Boolean)
      .slice(0, 80)
      .map((e: any) => `From: ${e.from} | To: ${e.to} | Subject: ${e.subject} | Date: ${e.date} | ${e.snippet}`)
      .join("\n");

    const calendarContext = (calendarData.items ?? [])
      .slice(0, 100)
      .map((e: any) => {
        const start = e.start?.dateTime ?? e.start?.date ?? "";
        const attendees = (e.attendees ?? []).map((a: any) => a.email).join(", ");
        return `${start} | ${e.summary ?? "No title"} | ${e.location ?? ""} | Attendees: ${attendees}`;
      })
      .join("\n");

    const contextForLLM = `EMAILS:\n${emailContext.slice(0, 60000)}\n\nCALENDAR:\n${calendarContext.slice(0, 30000)}`;

    // Synthesise profile
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        instructions: SYNTHESIS_PROMPT,
        input: [{ role: "user", content: contextForLLM }],
        max_output_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error("[hirafu-profile] OpenAI synthesis error:", resp.status);
      return new Response(JSON.stringify({ error: "Profile synthesis failed" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
    const raw = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    let profile: any;
    try {
      profile = JSON.parse(cleaned);
    } catch {
      console.error("[hirafu-profile] Failed to parse profile JSON");
      return new Response(JSON.stringify({ error: "Profile parsing failed" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Store profile
    await supabase
      .from("hirafu_users")
      .update({
        user_profile: profile,
        profile_built_at: new Date().toISOString(),
        display_name: profile.identity?.full_name || undefined,
      })
      .eq("user_id", userId);

    console.log(`[hirafu-profile] Profile built for ${userId}: ${profile.summary?.slice(0, 100)}`);

    return new Response(JSON.stringify({ success: true, summary: profile.summary }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[hirafu-profile] Error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
