// hirafu-timezone.ts — Authoritative timezone resolution for Hirafu.
//
// Two-layer resolution (no inference):
//   1. Client override: payload.timezone from the device
//   2. Database: user_google_accounts.timezone
//   Fallback: DEFAULT_TZ
//
// The model never determines timezone — it only receives the authoritative value.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const DEFAULT_TZ = "UTC";

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
      console.log(`[hirafu-tz] Updated mid-request: ${old} → ${newTz}`);
      this._onChange?.(newTz);
    }
  }
}

export async function resolveTimezone(opts: {
  dbTimezone: string;
  clientTimezone?: string;
  userId: string;
  supabase: SupabaseClient;
}): Promise<{ timezone: string; source: "client" | "database"; changed: boolean }> {
  const { dbTimezone, clientTimezone, userId, supabase } = opts;

  if (clientTimezone && clientTimezone.includes("/")) {
    try {
      new Date().toLocaleString("en-US", { timeZone: clientTimezone });
      if (clientTimezone !== dbTimezone) {
        console.log(`[hirafu-tz] Client override: ${dbTimezone} → ${clientTimezone}`);
        supabase
          .from("user_google_accounts")
          .update({ timezone: clientTimezone, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .then(() => console.log(`[hirafu-tz] DB updated to ${clientTimezone}`))
          .catch(() => {});
        return { timezone: clientTimezone, source: "client", changed: true };
      }
      return { timezone: clientTimezone, source: "client", changed: false };
    } catch {
      console.warn(`[hirafu-tz] Invalid client timezone: ${clientTimezone}, ignoring`);
    }
  }

  return { timezone: dbTimezone || DEFAULT_TZ, source: "database", changed: false };
}
