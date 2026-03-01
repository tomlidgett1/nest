// timezone-resolver.ts — Structural timezone resolution for Nest.
//
// Three-layer timezone resolution:
//   1. Client override: payload.timezone from the client (most authoritative)
//   2. Context inference: scan recent messages for location signals (pre-LLM)
//   3. Database fallback: user_google_accounts.timezone (existing behavior)
//
// Also provides a mutable timezone holder so that update_user_timezone
// takes effect within the same request (not just the next one).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_TZ = "Australia/Sydney";

// ── City → IANA Timezone Mapping ─────────────────────────────
// Common cities that appear in user messages. Covers major travel destinations.
const CITY_TO_TZ: Record<string, string> = {
  // Japan
  tokyo: "Asia/Tokyo", osaka: "Asia/Tokyo", kyoto: "Asia/Tokyo",
  nagoya: "Asia/Tokyo", hiroshima: "Asia/Tokyo", fukuoka: "Asia/Tokyo",
  sapporo: "Asia/Tokyo", nara: "Asia/Tokyo", kobe: "Asia/Tokyo",
  yokohama: "Asia/Tokyo", sendai: "Asia/Tokyo", okinawa: "Asia/Tokyo",
  hakone: "Asia/Tokyo", kamakura: "Asia/Tokyo", kanazawa: "Asia/Tokyo",
  shinjuku: "Asia/Tokyo", shibuya: "Asia/Tokyo", ginza: "Asia/Tokyo",
  akihabara: "Asia/Tokyo", roppongi: "Asia/Tokyo", harajuku: "Asia/Tokyo",
  shinagawa: "Asia/Tokyo", ueno: "Asia/Tokyo", asakusa: "Asia/Tokyo",
  ikebukuro: "Asia/Tokyo", shimbashi: "Asia/Tokyo", "shin-osaka": "Asia/Tokyo",
  // Korea
  seoul: "Asia/Seoul", busan: "Asia/Seoul", incheon: "Asia/Seoul",
  jeju: "Asia/Seoul", gangnam: "Asia/Seoul",
  // China
  beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai", shenzhen: "Asia/Shanghai",
  guangzhou: "Asia/Shanghai", chengdu: "Asia/Shanghai", hangzhou: "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong", hongkong: "Asia/Hong_Kong",
  // Southeast Asia
  singapore: "Asia/Singapore", bangkok: "Asia/Bangkok",
  "kuala lumpur": "Asia/Kuala_Lumpur", kl: "Asia/Kuala_Lumpur",
  jakarta: "Asia/Jakarta", bali: "Asia/Makassar", denpasar: "Asia/Makassar",
  manila: "Asia/Manila", "ho chi minh": "Asia/Ho_Chi_Minh",
  hanoi: "Asia/Ho_Chi_Minh", saigon: "Asia/Ho_Chi_Minh",
  "phnom penh": "Asia/Phnom_Penh", "siem reap": "Asia/Phnom_Penh",
  phuket: "Asia/Bangkok", "chiang mai": "Asia/Bangkok",
  // India
  mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", bangalore: "Asia/Kolkata",
  "new delhi": "Asia/Kolkata", hyderabad: "Asia/Kolkata", chennai: "Asia/Kolkata",
  goa: "Asia/Kolkata", kolkata: "Asia/Kolkata",
  // Middle East
  dubai: "Asia/Dubai", "abu dhabi": "Asia/Dubai",
  doha: "Asia/Qatar", riyadh: "Asia/Riyadh",
  // Australia
  sydney: "Australia/Sydney", melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane", perth: "Australia/Perth",
  adelaide: "Australia/Adelaide", canberra: "Australia/Sydney",
  "gold coast": "Australia/Brisbane", hobart: "Australia/Hobart",
  darwin: "Australia/Darwin", cairns: "Australia/Brisbane",
  // New Zealand
  auckland: "Pacific/Auckland", wellington: "Pacific/Auckland",
  christchurch: "Pacific/Auckland", queenstown: "Pacific/Auckland",
  // Europe
  london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin",
  amsterdam: "Europe/Amsterdam", rome: "Europe/Rome", madrid: "Europe/Madrid",
  barcelona: "Europe/Madrid", lisbon: "Europe/Lisbon", vienna: "Europe/Vienna",
  prague: "Europe/Prague", zurich: "Europe/Zurich", geneva: "Europe/Zurich",
  munich: "Europe/Berlin", frankfurt: "Europe/Berlin", dublin: "Europe/Dublin",
  edinburgh: "Europe/London", manchester: "Europe/London",
  brussels: "Europe/Brussels", copenhagen: "Europe/Copenhagen",
  stockholm: "Europe/Stockholm", oslo: "Europe/Oslo", helsinki: "Europe/Helsinki",
  warsaw: "Europe/Warsaw", budapest: "Europe/Budapest",
  athens: "Europe/Athens", istanbul: "Europe/Istanbul",
  milan: "Europe/Rome", florence: "Europe/Rome", venice: "Europe/Rome",
  // Americas
  "new york": "America/New_York", nyc: "America/New_York",
  "los angeles": "America/Los_Angeles", la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles",
  chicago: "America/Chicago", miami: "America/New_York",
  boston: "America/New_York", seattle: "America/Los_Angeles",
  denver: "America/Denver", dallas: "America/Chicago",
  houston: "America/Chicago", atlanta: "America/New_York",
  washington: "America/New_York", dc: "America/New_York",
  toronto: "America/Toronto", vancouver: "America/Vancouver",
  montreal: "America/Toronto",
  "mexico city": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo", rio: "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires",
  lima: "America/Lima", bogota: "America/Bogota",
  santiago: "America/Santiago",
  // Pacific
  honolulu: "Pacific/Honolulu", hawaii: "Pacific/Honolulu",
  fiji: "Pacific/Fiji",
  // Africa
  cairo: "Africa/Cairo", johannesburg: "Africa/Johannesburg",
  "cape town": "Africa/Johannesburg", nairobi: "Africa/Nairobi",
  lagos: "Africa/Lagos", casablanca: "Africa/Casablanca",
};

// Country → timezone (for "I'm in Japan" style messages)
const COUNTRY_TO_TZ: Record<string, string> = {
  japan: "Asia/Tokyo",
  korea: "Asia/Seoul", "south korea": "Asia/Seoul",
  china: "Asia/Shanghai",
  thailand: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  singapore: "Asia/Singapore",
  malaysia: "Asia/Kuala_Lumpur",
  indonesia: "Asia/Jakarta",
  philippines: "Asia/Manila",
  india: "Asia/Kolkata",
  australia: "Australia/Sydney",
  "new zealand": "Pacific/Auckland",
  uk: "Europe/London", "united kingdom": "Europe/London", england: "Europe/London",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  italy: "Europe/Rome",
  spain: "Europe/Madrid",
  usa: "America/New_York", "united states": "America/New_York",
  canada: "America/Toronto",
  brazil: "America/Sao_Paulo",
  mexico: "America/Mexico_City",
  uae: "Asia/Dubai",
  taiwan: "Asia/Taipei",
  "hong kong": "Asia/Hong_Kong",
};

// Transit system keywords that imply a specific location
const TRANSIT_SIGNALS: Record<string, string> = {
  shinkansen: "Asia/Tokyo",
  nozomi: "Asia/Tokyo",
  hikari: "Asia/Tokyo",
  kodama: "Asia/Tokyo",
  yamanote: "Asia/Tokyo",
  "jr line": "Asia/Tokyo",
  "jr pass": "Asia/Tokyo",
  suica: "Asia/Tokyo",
  pasmo: "Asia/Tokyo",
  icoca: "Asia/Tokyo",
  tube: "Europe/London",
  underground: "Europe/London",
  eurostar: "Europe/London",
  tgv: "Europe/Paris",
  "u-bahn": "Europe/Berlin",
  "s-bahn": "Europe/Berlin",
  mrt: "Asia/Singapore",
  bts: "Asia/Bangkok",
  ktx: "Asia/Seoul",
  bart: "America/Los_Angeles",
  subway: "America/New_York",
};

/**
 * Mutable timezone holder. Passed by reference through the request lifecycle
 * so that update_user_timezone can update it and subsequent tools use the
 * new timezone within the same request.
 */
export class TimezoneHolder {
  private _tz: string;
  private _onChange?: (newTz: string) => void;

  constructor(initialTz: string, onChange?: (newTz: string) => void) {
    this._tz = initialTz;
    this._onChange = onChange;
  }

  get tz(): string {
    return this._tz;
  }

  update(newTz: string): void {
    const old = this._tz;
    this._tz = newTz;
    if (old !== newTz) {
      console.log(`[timezone] Updated mid-request: ${old} → ${newTz}`);
      this._onChange?.(newTz);
    }
  }
}

/**
 * Scan recent chat messages for location/city signals that imply a timezone
 * different from the user's stored timezone. Returns the inferred timezone
 * if a mismatch is detected, or null if the stored timezone looks correct.
 *
 * This runs BEFORE the LLM — it's deterministic regex matching, not AI.
 */
export function inferTimezoneFromContext(
  recentMessages: Array<{ role: string; content: string }>,
  currentTimezone: string,
  learnings?: Array<{ category: string; content: string }> | null,
): string | null {
  // Scan the last 10 user messages (most recent first — recency weighted)
  const userMessages = recentMessages
    .filter(m => m.role === "user")
    .slice(-10)
    .reverse(); // most recent first

  // Also check learnings for location category
  const locationLearnings = (learnings ?? [])
    .filter(l => l.category === "location")
    .map(l => l.content);

  // Combine recent messages + location learnings into text to scan
  const textsToScan = [
    ...userMessages.map(m => m.content),
    ...locationLearnings,
  ];

  let inferredTz: string | null = null;
  let matchSource: string | null = null;

  for (const text of textsToScan) {
    const lower = text.toLowerCase();

    // Check explicit "I'm in [city/country]" patterns
    const locationPatterns = [
      /\b(?:i'?m|i am|we'?re|we are|currently|staying|landed|arrived|here) (?:in|at) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:just (?:got|landed|arrived) (?:in|at)) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:here in) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:currently in) ([a-z][a-z ]{1,20})\b/i,
    ];

    for (const pattern of locationPatterns) {
      const match = lower.match(pattern);
      if (match) {
        const place = match[1].trim();
        const tz = CITY_TO_TZ[place] ?? COUNTRY_TO_TZ[place];
        if (tz) {
          inferredTz = tz;
          matchSource = `explicit location: "${place}"`;
          break;
        }
      }
    }
    if (inferredTz) break;

    // Check transit system keywords
    for (const [keyword, tz] of Object.entries(TRANSIT_SIGNALS)) {
      if (lower.includes(keyword)) {
        inferredTz = tz;
        matchSource = `transit signal: "${keyword}"`;
        break;
      }
    }
    if (inferredTz) break;

    // Check for city names in transit/travel contexts
    // "train from X", "train to X", "flight to X", "weather in X", "next train X"
    const travelPatterns = [
      /\b(?:train|bus|tram|metro|subway|ferry|flight|fly|flying) (?:from|to|in) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:next train|next bus|next flight) (?:from|to|in)? ?([a-z][a-z ]{1,20})\b/i,
      /\b(?:weather|temperature|forecast) (?:in|at|for) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:restaurants?|hotels?|cafes?|bars?) (?:in|near|around) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:things to do|what to do|places) (?:in|around) ([a-z][a-z ]{1,20})\b/i,
      /\b(?:how (?:do i|to) get (?:to|from)) ([a-z][a-z ]{1,20})\b/i,
    ];

    for (const pattern of travelPatterns) {
      const match = lower.match(pattern);
      if (match) {
        const place = match[1].trim();
        const tz = CITY_TO_TZ[place] ?? COUNTRY_TO_TZ[place];
        if (tz) {
          inferredTz = tz;
          matchSource = `travel context: "${place}"`;
          break;
        }
      }
    }
    if (inferredTz) break;

    // Check for bare city/country mentions in recent messages (lower confidence)
    // Only match from the 3 most recent messages to avoid stale references
    if (textsToScan.indexOf(text) < 3) {
      for (const [city, tz] of Object.entries(CITY_TO_TZ)) {
        // Require word boundary to avoid false positives
        const cityRegex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
        if (cityRegex.test(lower)) {
          inferredTz = tz;
          matchSource = `city mention: "${city}"`;
          break;
        }
      }
    }
    if (inferredTz) break;

    // Check location learnings (e.g. "currently in Tokyo")
    if (locationLearnings.includes(text)) {
      for (const [city, tz] of Object.entries(CITY_TO_TZ)) {
        if (lower.includes(city)) {
          inferredTz = tz;
          matchSource = `learning: "${text}"`;
          break;
        }
      }
      if (!inferredTz) {
        for (const [country, tz] of Object.entries(COUNTRY_TO_TZ)) {
          if (lower.includes(country)) {
            inferredTz = tz;
            matchSource = `learning: "${text}"`;
            break;
          }
        }
      }
    }
    if (inferredTz) break;
  }

  // Only return if different from current timezone
  if (inferredTz && inferredTz !== currentTimezone) {
    console.log(`[timezone] Inferred ${inferredTz} from ${matchSource} (stored: ${currentTimezone})`);
    return inferredTz;
  }

  return null;
}

/**
 * Full timezone resolution. Call this at request start in v2-chat-service.
 *
 * Priority:
 *   1. Client-provided timezone (payload.timezone)
 *   2. Context-inferred timezone (from recent messages/learnings)
 *   3. Database timezone (user_google_accounts.timezone)
 *   4. Default: Australia/Sydney
 *
 * If timezone changes (layers 1 or 2), the DB is updated fire-and-forget.
 */
export async function resolveTimezone(opts: {
  dbTimezone: string;
  clientTimezone?: string;
  recentMessages: Array<{ role: string; content: string }>;
  learnings?: Array<{ category: string; content: string }> | null;
  userId: string;
  supabase: SupabaseClient;
}): Promise<{ timezone: string; source: "client" | "inferred" | "database"; changed: boolean }> {
  const { dbTimezone, clientTimezone, recentMessages, learnings, userId, supabase } = opts;

  // Layer 1: Client override
  if (clientTimezone && clientTimezone.includes("/")) {
    try {
      new Date().toLocaleString("en-US", { timeZone: clientTimezone });
      if (clientTimezone !== dbTimezone) {
        console.log(`[timezone] Client override: ${dbTimezone} → ${clientTimezone}`);
        // Fire-and-forget DB update
        supabase
          .from("user_google_accounts")
          .update({ timezone: clientTimezone, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .then(() => console.log(`[timezone] DB updated to ${clientTimezone} (client override)`))
          .catch(() => {});
        return { timezone: clientTimezone, source: "client", changed: true };
      }
      return { timezone: clientTimezone, source: "client", changed: false };
    } catch {
      console.warn(`[timezone] Invalid client timezone: ${clientTimezone}, ignoring`);
    }
  }

  // Layer 2: Context inference
  const inferred = inferTimezoneFromContext(recentMessages, dbTimezone, learnings);
  if (inferred) {
    console.log(`[timezone] Context inference: ${dbTimezone} → ${inferred}`);
    // Fire-and-forget DB update
    supabase
      .from("user_google_accounts")
      .update({ timezone: inferred, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .then(() => console.log(`[timezone] DB updated to ${inferred} (context inference)`))
      .catch(() => {});
    return { timezone: inferred, source: "inferred", changed: true };
  }

  // Layer 3: Database value
  return { timezone: dbTimezone, source: "database", changed: false };
}
