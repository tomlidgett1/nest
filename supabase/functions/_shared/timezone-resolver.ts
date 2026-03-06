// timezone-resolver.ts — Authoritative timezone resolution for Nest.
//
// Two-layer resolution (no inference):
//   1. Client override: payload.timezone from the device (most authoritative)
//   2. Database: user_google_accounts.timezone (canonical storage)
//   Fallback: DEFAULT_TZ
//
// Timezone is infrastructure, not intelligence. The model never determines
// timezone — it only receives the authoritative value.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const DEFAULT_TZ = "UTC";

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
 * Authoritative timezone resolution. Call at request start.
 *
 * Priority:
 *   1. Client-provided timezone (payload.timezone from device)
 *   2. Database timezone (user_google_accounts.timezone)
 *   3. Default: UTC
 *
 * If client timezone differs from DB, the DB is updated fire-and-forget.
 */
export async function resolveTimezone(opts: {
  dbTimezone: string;
  clientTimezone?: string;
  userId: string;
  supabase: SupabaseClient;
}): Promise<{ timezone: string; source: "client" | "database"; changed: boolean }> {
  const { dbTimezone, clientTimezone, userId, supabase } = opts;

  // Layer 1: Client device timezone override
  if (clientTimezone && clientTimezone.includes("/")) {
    try {
      new Date().toLocaleString("en-US", { timeZone: clientTimezone });
      if (clientTimezone !== dbTimezone) {
        console.log(`[timezone] Client override: ${dbTimezone} → ${clientTimezone}`);
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

  // Layer 2: Database value (authoritative)
  return { timezone: dbTimezone || DEFAULT_TZ, source: "database", changed: false };
}
