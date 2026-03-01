// Strava OAuth + API helpers for Nest.
// Token refresh follows the same pattern as gmail-helpers.ts.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";
const STRAVA_API = "https://www.strava.com/api/v3";
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  elev_high?: number;
  elev_low?: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  calories?: number;
  suffer_score?: number;
  average_temp?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  gear?: { name: string } | null;
  device_name?: string;
  athlete_count: number;
  kudos_count: number;
  pr_count: number;
  achievement_count?: number;
  comment_count?: number;
  description?: string;
  workout_type?: number;
  commute?: boolean;
  trainer?: boolean;
  has_heartrate?: boolean;
  map?: { summary_polyline?: string } | null;
  [key: string]: unknown;
}

// ── Token Exchange ───────────────────────────────────────────

export async function exchangeStravaCode(code: string): Promise<{
  tokens: StravaTokens;
  athlete: { id: number; firstname: string; lastname: string };
}> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    },
    athlete: {
      id: data.athlete.id,
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
    },
  };
}

// ── Token Refresh ────────────────────────────────────────────

export async function refreshStravaToken(
  refreshToken: string,
): Promise<StravaTokens> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
}

// ── Get Valid Access Token ───────────────────────────────────

export async function getStravaAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; athleteId: number }> {
  const { data: account, error } = await supabase
    .from("user_strava_accounts")
    .select("id, strava_athlete_id, refresh_token, access_token, token_expires_at")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !account) {
    throw new Error("No Strava account linked for this user");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.token_expires_at
    ? Math.floor(new Date(account.token_expires_at).getTime() / 1000)
    : 0;

  if (account.access_token && expiresAt > now + 300) {
    return { accessToken: account.access_token, athleteId: account.strava_athlete_id };
  }

  const tokens = await refreshStravaToken(account.refresh_token);

  await supabase
    .from("user_strava_accounts")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: new Date(tokens.expiresAt * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return { accessToken: tokens.accessToken, athleteId: account.strava_athlete_id };
}

// ── Fetch Activities (paginated list) ────────────────────────

export async function fetchStravaActivities(
  accessToken: string,
  opts: { after?: number; before?: number; page?: number; perPage?: number } = {},
): Promise<StravaActivity[]> {
  const params = new URLSearchParams();
  if (opts.after) params.set("after", String(opts.after));
  if (opts.before) params.set("before", String(opts.before));
  params.set("page", String(opts.page ?? 1));
  params.set("per_page", String(opts.perPage ?? 200));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 429) {
      console.warn("[strava] Rate limited, backing off");
      await sleep(15_000);
      const retry = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!retry.ok) throw new Error(`Strava activities fetch failed after retry (${retry.status})`);
      return retry.json();
    }
    throw new Error(`Strava activities fetch failed (${res.status})`);
  }

  return res.json();
}

// ── Fetch Single Activity Detail ─────────────────────────────

export async function fetchStravaActivityDetail(
  accessToken: string,
  activityId: number,
): Promise<StravaActivity> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Strava activity detail fetch failed (${res.status})`);
  }

  return res.json();
}

// ── Reverse Geocoding ────────────────────────────────────────

const geocodeCache = new Map<string, string>();

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

  // Try Google Maps Geocoding API first
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "OK" && data.results?.length) {
          let suburb = "";
          let city = "";
          let state = "";

          for (const result of data.results) {
            const components = result.address_components as Array<{
              long_name: string;
              short_name: string;
              types: string[];
            }>;
            for (const c of components) {
              if (!suburb && (c.types.includes("sublocality_level_1") || c.types.includes("sublocality") || c.types.includes("neighborhood"))) suburb = c.long_name;
              if (!city && c.types.includes("locality")) city = c.long_name;
              if (!state && c.types.includes("administrative_area_level_1")) state = c.short_name;
            }
            if (city) break;
          }

          const name = suburb && city && suburb !== city
            ? `${suburb}, ${city}`
            : city && state
              ? `${city}, ${state}`
              : city || suburb || null;

          if (name) {
            geocodeCache.set(cacheKey, name);
            return name;
          }
        }
      }
    } catch {
      // Fall through to Nominatim
    }
  }

  // Fallback: OpenStreetMap Nominatim (free, no key needed, 1 req/sec limit)
  try {
    await sleep(1100);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { "User-Agent": "NestApp/1.0" } },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const suburb = addr.suburb || addr.neighbourhood || addr.hamlet || "";
    const city = addr.city || addr.town || addr.village || "";
    const state = addr.state || "";

    const name = suburb && city && suburb !== city
      ? `${suburb}, ${city}`
      : city && state
        ? `${city}, ${state}`
        : city || suburb || null;

    if (name) geocodeCache.set(cacheKey, name);
    return name;
  } catch (e) {
    console.warn("[strava] Geocode failed:", (e as Error).message);
    return null;
  }
}

// ── Map API response to DB row ───────────────────────────────

export function activityToRow(
  userId: string,
  activity: StravaActivity,
  startLocationName?: string | null,
  endLocationName?: string | null,
): Record<string, unknown> {
  return {
    user_id: userId,
    strava_id: activity.id,
    name: activity.name,
    sport_type: activity.sport_type ?? activity.type,
    activity_type: activity.type,
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    timezone: activity.timezone,
    distance_metres: activity.distance ?? 0,
    moving_time_secs: activity.moving_time ?? 0,
    elapsed_time_secs: activity.elapsed_time ?? 0,
    total_elevation_gain_metres: activity.total_elevation_gain ?? 0,
    elev_high: activity.elev_high ?? null,
    elev_low: activity.elev_low ?? null,
    average_speed: activity.average_speed ?? null,
    max_speed: activity.max_speed ?? null,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    average_cadence: activity.average_cadence ?? null,
    average_watts: activity.average_watts ?? null,
    max_watts: activity.max_watts ?? null,
    weighted_average_watts: activity.weighted_average_watts ?? null,
    kilojoules: activity.kilojoules ?? null,
    calories: activity.calories ?? null,
    suffer_score: activity.suffer_score ?? null,
    average_temp: activity.average_temp ?? null,
    start_lat: activity.start_latlng?.[0] ?? null,
    start_lng: activity.start_latlng?.[1] ?? null,
    end_lat: activity.end_latlng?.[0] ?? null,
    end_lng: activity.end_latlng?.[1] ?? null,
    start_location_name: startLocationName ?? null,
    end_location_name: endLocationName ?? null,
    gear_name: activity.gear?.name ?? null,
    device_name: activity.device_name ?? null,
    athlete_count: activity.athlete_count ?? 1,
    kudos_count: activity.kudos_count ?? 0,
    pr_count: activity.pr_count ?? 0,
    achievement_count: activity.achievement_count ?? 0,
    comment_count: activity.comment_count ?? 0,
    description: activity.description ?? null,
    is_race: activity.workout_type === 1,
    is_commute: activity.commute ?? false,
    is_trainer: activity.trainer ?? false,
    has_heartrate: activity.has_heartrate ?? false,
    workout_type: activity.workout_type ?? null,
    map_polyline: activity.map?.summary_polyline ?? null,
    raw_json: activity,
    updated_at: new Date().toISOString(),
  };
}

// ── Build text summary for RAG embedding ─────────────────────

export function buildStravaActivitySummary(
  activity: StravaActivity,
  startLocation?: string | null,
  endLocation?: string | null,
): string {
  const distKm = ((activity.distance ?? 0) / 1000).toFixed(2);
  const movingMins = Math.round((activity.moving_time ?? 0) / 60);
  const elevM = Math.round(activity.total_elevation_gain ?? 0);
  const sportType = activity.sport_type ?? activity.type ?? "Activity";

  const date = new Date(activity.start_date_local ?? activity.start_date);
  const dateStr = date.toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    timeZone: "UTC",
  });

  const parts: string[] = [
    `${sportType}: ${activity.name}`,
    `Date: ${dateStr}`,
  ];

  if (startLocation) {
    parts.push(`Location: ${startLocation}`);
    if (endLocation && endLocation !== startLocation) {
      parts.push(`End location: ${endLocation}`);
    }
  }

  parts.push(`Distance: ${distKm} km`);
  parts.push(`Duration: ${movingMins} min`);

  if (elevM > 0) {
    parts.push(`Elevation gain: ${elevM} m`);
    if (activity.elev_high != null) parts.push(`Max elevation: ${Math.round(activity.elev_high)} m`);
  }

  if (activity.average_heartrate) {
    parts.push(`Avg HR: ${Math.round(activity.average_heartrate)} bpm`);
    if (activity.max_heartrate) parts.push(`Max HR: ${Math.round(activity.max_heartrate)} bpm`);
  }

  if (activity.average_speed) {
    const paceMinPerKm = 1000 / 60 / activity.average_speed;
    if (sportType.toLowerCase().includes("run") || sportType.toLowerCase().includes("walk")) {
      const paceMin = Math.floor(paceMinPerKm);
      const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
      parts.push(`Pace: ${paceMin}:${String(paceSec).padStart(2, "0")} /km`);
    } else {
      parts.push(`Avg Speed: ${(activity.average_speed * 3.6).toFixed(1)} km/h`);
    }
    parts.push(`Max Speed: ${(activity.max_speed * 3.6).toFixed(1)} km/h`);
  }

  if (activity.average_watts) {
    parts.push(`Avg Power: ${Math.round(activity.average_watts)} W`);
    if (activity.weighted_average_watts) parts.push(`Normalised Power: ${Math.round(activity.weighted_average_watts)} W`);
    if (activity.max_watts) parts.push(`Max Power: ${Math.round(activity.max_watts)} W`);
  }
  if (activity.kilojoules) parts.push(`Energy: ${Math.round(activity.kilojoules)} kJ`);
  if (activity.calories) parts.push(`Calories: ${Math.round(activity.calories)}`);
  if (activity.average_cadence) parts.push(`Avg Cadence: ${Math.round(activity.average_cadence)}`);
  if (activity.average_temp != null) parts.push(`Temperature: ${Math.round(activity.average_temp)}°C`);
  if (activity.suffer_score) parts.push(`Suffer Score: ${activity.suffer_score}`);
  if ((activity.athlete_count ?? 1) > 1) parts.push(`Group: ${activity.athlete_count} athletes`);
  if (activity.gear?.name) parts.push(`Gear: ${activity.gear.name}`);
  if (activity.device_name) parts.push(`Device: ${activity.device_name}`);
  if (activity.pr_count && activity.pr_count > 0) parts.push(`PRs: ${activity.pr_count}`);
  if (activity.achievement_count && activity.achievement_count > 0) parts.push(`Achievements: ${activity.achievement_count}`);
  if (activity.kudos_count && activity.kudos_count > 0) parts.push(`Kudos: ${activity.kudos_count}`);
  if (activity.commute) parts.push(`Commute: yes`);
  if (activity.trainer) parts.push(`Indoor trainer: yes`);
  if (activity.description) parts.push(`Notes: ${activity.description.slice(0, 500)}`);

  return parts.join("\n");
}

export function stravaContextHeader(
  activityName: string,
  sportType: string,
  dateStr: string,
): string {
  return `Strava ${sportType}: ${activityName} | Date: ${dateStr}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
