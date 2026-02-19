import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrichByIdentity, profileToContext } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";
import { linkConversationsToUser } from "../_shared/conversation-store.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SCOPES = [
  "email", "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
].join(" ");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // ── POST: link account ────────────────────────────────
  if (req.method === "POST") return handlePost(req);

  if (!token) return page("Nest", msgPage("No link provided", "Message Nest on iMessage to get started."));

  const { data: user } = await admin
    .from("imessage_users")
    .select("id, status, user_id")
    .eq("onboarding_token", token)
    .single();

  if (!user) return page("Nest", msgPage("Link expired", "Message Nest again for a new link."));

  // If active, check tokens are actually stored. If not, allow re-auth.
  if (user.status === "active" && user.user_id) {
    const { data: accounts } = await admin
      .from("user_google_accounts")
      .select("id")
      .eq("user_id", user.user_id)
      .limit(1);
    if (accounts && accounts.length > 0) {
      return page("Nest", donePage());
    }
    console.log(`[onboard] User ${user.user_id} is active but has no google accounts — allowing re-auth`);
  }

  // ── Callback after Google auth ────────────────────────
  if (url.searchParams.get("auth_callback") === "true") {
    await admin.from("imessage_users").update({ status: "onboarding" }).eq("id", user.id);
    return page("Nest", callbackPage(token));
  }

  // ── Welcome page → button sends to Google ─────────────
  await admin.from("imessage_users").update({ status: "onboarding" }).eq("id", user.id);
  const cb = `${supabaseUrl}/functions/v1/imessage-onboard?token=${token}&auth_callback=true`;
  const authUrl =
    `${supabaseUrl}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(cb)}` +
    `&scopes=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent`;

  return page("Nest", welcomePage(authUrl));
});

// ── POST handler ─────────────────────────────────────────

async function fetchGoogleProfile(accessToken: string): Promise<{ email: string; name: string; picture: string } | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.email ?? "", name: data.name ?? "", picture: data.picture ?? "" };
  } catch {
    return null;
  }
}

async function handlePost(req: Request) {
  try {
    const body = await req.json();
    const token: string | undefined = body.token;
    const access_token: string | undefined = body.access_token;
    const provider_token: string | undefined = body.provider_token;
    const provider_refresh_token: string | undefined = body.provider_refresh_token;
    const user_id: string | undefined = body.user_id;

    if (!access_token) return json({ error: "missing fields" }, 400);

    let uid = user_id;
    if (!uid) {
      const { data: { user }, error } = await admin.auth.getUser(access_token);
      if (error || !user) return json({ error: "bad_token" }, 401);
      uid = user.id;
    }

    // Link phone number: try token lookup first, then fallback to user's own row
    let imessageRowId: string | null = null;
    let phoneLinked = false;
    if (token) {
      const { data: u } = await admin.from("imessage_users").select("id, phone_number").eq("onboarding_token", token).single();
      if (u) {
        await admin.from("imessage_users").update({ user_id: uid, status: "active", updated_at: new Date().toISOString() }).eq("id", u.id);
        console.log(`[onboard] Linked ${u.phone_number} → ${uid}`);
        imessageRowId = u.id;
        phoneLinked = true;
      } else {
        console.warn(`[onboard] Token ${token.slice(0, 8)}... not found in imessage_users (row may not exist yet)`);
      }
    }

    // Fallback: if token lookup failed, check if this user_id already has a linked row
    // IMPORTANT: Never grab an arbitrary unlinked row — that can cross-link users.
    if (!phoneLinked) {
      const { data: ownedRow } = await admin
        .from("imessage_users")
        .select("id, phone_number")
        .eq("user_id", uid)
        .in("status", ["pending", "onboarding"])
        .maybeSingle();

      if (ownedRow) {
        await admin.from("imessage_users").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", ownedRow.id);
        console.log(`[onboard] Fallback activated own row ${ownedRow.phone_number} → ${uid}`);
        imessageRowId = ownedRow.id;
        phoneLinked = true;
      } else {
        console.warn(`[onboard] No token match and no owned row for ${uid} — skipping phone link`);
      }
    }

    // Last resort: if user already has a linked phone but it's not active, activate it
    if (!phoneLinked) {
      const { data: existing } = await admin
        .from("imessage_users")
        .select("id, phone_number, status")
        .eq("user_id", uid)
        .neq("status", "active")
        .maybeSingle();

      if (existing) {
        await admin.from("imessage_users").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", existing.id);
        console.log(`[onboard] Activated existing link ${existing.phone_number} → ${uid}`);
        imessageRowId = existing.id;
      }
    }

    // If we still don't have the row id, look it up by user_id (already linked from a prior attempt)
    if (!imessageRowId) {
      const { data: linked } = await admin.from("imessage_users").select("id").eq("user_id", uid).maybeSingle();
      if (linked) imessageRowId = linked.id;
    }

    // Legacy single-token table (keep for backwards compat)
    if (provider_refresh_token) {
      await admin.from("google_oauth_tokens").upsert(
        { user_id: uid, refresh_token: provider_refresh_token, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }

    // Resolve Google profile: try provider_token → Supabase getUser → admin getUserById
    let profile: { email: string; name: string; picture: string } | null = null;

    if (provider_token) {
      profile = await fetchGoogleProfile(provider_token);
    }

    if (!profile) {
      try {
        const { data: { user } } = await admin.auth.getUser(access_token);
        if (user?.user_metadata?.email || user?.email) {
          profile = {
            email: user.user_metadata?.email ?? user.email ?? "",
            name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
            picture: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? "",
          };
        }
      } catch { /* fall through */ }
    }

    if (!profile && uid) {
      try {
        const { data: { user: adminUser } } = await admin.auth.admin.getUserById(uid);
        if (adminUser) {
          profile = {
            email: adminUser.email ?? "",
            name: adminUser.user_metadata?.full_name ?? adminUser.user_metadata?.name ?? "",
            picture: adminUser.user_metadata?.avatar_url ?? "",
          };
        }
      } catch { /* fall through */ }
    }

    console.log(`[onboard] Profile resolved: email=${profile?.email ?? "NONE"}, name=${profile?.name ?? "NONE"}`);

    // Guard: check if this Google email is already linked to a different user
    if (profile?.email) {
      const { data: existingAccount } = await admin
        .from("user_google_accounts")
        .select("user_id, google_email, is_primary")
        .eq("google_email", profile.email)
        .neq("user_id", uid)
        .maybeSingle();

      if (existingAccount) {
        const { data: primaryAccount } = await admin
          .from("user_google_accounts")
          .select("google_email")
          .eq("user_id", existingAccount.user_id)
          .eq("is_primary", true)
          .maybeSingle();

        console.log(`[onboard] Email conflict: ${profile.email} already belongs to user ${existingAccount.user_id}`);

        return json({
          error: "email_conflict",
          detail: "This Google account is already linked to another Nest account.",
          hint: primaryAccount?.google_email
            ? `Sign in with ${maskEmail(primaryAccount.google_email)} instead.`
            : "Sign in with the account you originally used.",
        }, 409);
      }
    }

    // Resolve refresh token: POST body → legacy google_oauth_tokens table
    let refreshToken = provider_refresh_token;
    if (!refreshToken) {
      const { data: legacy } = await admin
        .from("google_oauth_tokens")
        .select("refresh_token")
        .eq("user_id", uid)
        .maybeSingle();
      if (legacy?.refresh_token) {
        refreshToken = legacy.refresh_token;
        console.log(`[onboard] Using refresh token from legacy table for ${uid}`);
      }
    }

    if (!refreshToken) {
      console.error(`[onboard] No Google refresh token for ${uid}. Aborting — user must re-authenticate.`);
      return json({
        error: "missing_refresh_token",
        detail: "Google did not provide a refresh token. Please try signing in again.",
        hint: "Make sure you grant all permissions when Google asks.",
      }, 400);
    }

    if (!profile?.email) {
      console.error(`[onboard] No Google email resolved for ${uid}. Aborting.`);
      return json({
        error: "missing_profile",
        detail: "Could not determine your Google email. Please try again.",
      }, 400);
    }

    await admin.from("user_google_accounts").upsert(
      {
        user_id: uid,
        google_email: profile.email,
        google_name: profile.name,
        google_avatar_url: profile.picture,
        refresh_token: refreshToken,
        is_primary: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_email" },
    );
    console.log(`[onboard] Stored account ${profile.email} in user_google_accounts`);

    if (imessageRowId && (profile?.name || profile?.email)) {
      const patch: Record<string, string> = { updated_at: new Date().toISOString() };
      if (profile.name) patch.display_name = profile.name;
      if (profile.email) patch.google_email = profile.email;
      const { error: patchErr } = await admin.from("imessage_users").update(patch).eq("id", imessageRowId);
      if (patchErr) {
        console.error(`[onboard] Failed to patch imessage_users row ${imessageRowId}:`, patchErr.message);
      } else {
        console.log(`[onboard] Updated imessage_users: name="${profile.name ?? "-"}", email="${profile.email ?? "-"}" for row ${imessageRowId}`);
      }
    }

    // Migrate pre-signup conversations to the new user_id
    if (imessageRowId) {
      const { data: phoneRow } = await admin
        .from("imessage_users")
        .select("phone_number")
        .eq("id", imessageRowId)
        .single();
      if (phoneRow?.phone_number) {
        linkConversationsToUser(admin, phoneRow.phone_number, uid!)
          .catch((e: unknown) => console.error("[onboard] Conversation link failed:", e));
      }
    }

    console.log(`[onboard] Account created for ${uid}${token ? " (iMessage)" : " (direct)"}`);
    // Ingestion is triggered automatically by the DB trigger on user_google_accounts INSERT
    // (via pg_net → ingest-pipeline). No fire-and-forget needed here.

    // ── PDL enrichment + auto-welcome + profile build ─────────
    // Must await welcome — Deno edge functions terminate after response.
    // Profile builder runs in parallel (non-blocking for the welcome).
    const profileBuildPromise = triggerProfileBuild(uid!);

    try {
      await sendPostSignupWelcome(uid!, profile, imessageRowId);
    } catch (e) {
      console.error("[onboard] Post-signup welcome failed:", e);
    }

    // Wait for profile build to finish (best-effort, don't block response too long)
    try {
      await Promise.race([
        profileBuildPromise,
        new Promise((resolve) => setTimeout(resolve, 25000)),
      ]);
    } catch (e) {
      console.error("[onboard] Profile build failed (non-blocking):", e);
    }

    return json({ success: true, uid }, 200);
  } catch (e) {
    console.error("[onboard]", e);
    return json({ error: "internal" }, 500);
  }
}


// ── Post-signup welcome ──────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPostSignupWelcome(
  uid: string,
  googleProfile: { email: string; name: string; picture: string } | null,
  imessageRowId: string | null,
) {
  // Resolve phone number
  let phoneNumber: string | null = null;
  if (imessageRowId) {
    const { data } = await admin
      .from("imessage_users")
      .select("phone_number")
      .eq("id", imessageRowId)
      .single();
    phoneNumber = data?.phone_number ?? null;
  }
  if (!phoneNumber) {
    const { data } = await admin
      .from("imessage_users")
      .select("phone_number")
      .eq("user_id", uid)
      .maybeSingle();
    phoneNumber = data?.phone_number ?? null;
  }
  if (!phoneNumber) {
    console.log("[onboard] No phone number found, skipping welcome message");
    return;
  }

  // Fetch ALL connected Google accounts for this user
  const { data: allAccounts } = await admin
    .from("user_google_accounts")
    .select("google_email, google_name")
    .eq("user_id", uid);

  const accounts = allAccounts ?? [];
  const displayName = googleProfile?.name || accounts[0]?.google_name || "there";

  // Try each email, prioritising work emails over personal ones
  const sorted = [...accounts].sort((a, b) => {
    const aPersonal = a.google_email?.match(/@(gmail|hotmail|outlook|yahoo|icloud)\./i) ? 1 : 0;
    const bPersonal = b.google_email?.match(/@(gmail|hotmail|outlook|yahoo|icloud)\./i) ? 1 : 0;
    return aPersonal - bPersonal;
  });

  let bestProfile: PDLProfile | null = null;
  for (const acct of sorted) {
    console.log(`[onboard] Trying PDL with ${acct.google_email}`);
    const profile = await enrichByIdentity({
      email: acct.google_email ?? undefined,
      name: displayName,
      phone: phoneNumber,
    });
    if (profile && profile.job_title) {
      bestProfile = profile;
      break;
    }
  }

  // Cache the profile
  const updatePayload: Record<string, unknown> = {
    pdl_identity_enriched: true,
    updated_at: new Date().toISOString(),
  };
  if (bestProfile) {
    updatePayload.pdl_profile = bestProfile;
    updatePayload.display_name = bestProfile.full_name ?? displayName;
  }
  await admin
    .from("imessage_users")
    .update(updatePayload)
    .eq("user_id", uid);

  if (!bestProfile) {
    console.log("[onboard] No PDL job data found, skipping personalised welcome");
    // Send a more engaging generic welcome
    // Add 4 second delay before sending
    await delay(4000);
    await admin.from("outbound_imessages").insert({
      phone_number: phoneNumber,
      content: `alright, you made it in.\nyou and me—let’s shake things up.\ngo on, hit me with your first question`,
    });
    return;
  }

  const pdlContext = profileToContext(bestProfile);
  console.log(`[onboard] PDL match: ${bestProfile.full_name} | ${bestProfile.job_title} @ ${bestProfile.job_company_name}`);

  // Generate a personalised welcome message via LLM
  const welcomeMessage = await generateWelcome(displayName, pdlContext);
  console.log(`[onboard] Welcome message: ${welcomeMessage.slice(0, 100)}`);

  // Queue for iMessage delivery after a 4 second delay
  await delay(4000);
  await admin.from("outbound_imessages").insert({
    phone_number: phoneNumber,
    content: welcomeMessage,
  });

  console.log(`[onboard] Queued welcome iMessage for ${phoneNumber.slice(0, 6)}***`);
}

async function generateWelcome(name: string, pdlContext: string): Promise<string> {
  if (!openaiKey) {
    return `welcome back ${name.split(" ")[0].toLowerCase()}\nnow the real fun starts`;
  }

  const systemPrompt = `You are Nest, a sharp, witty AI assistant that lives in iMessage. The user just connected their Google account and you're about to send them their first real message.

You have detailed intel on this person (see PROFILE INTEL). Your message should show you've done your homework while they were setting up. Be cheeky, confident, slightly cocky. The goal is to make them think "how does this thing know who I am?"

Rules:
- 2-3 short lines max (each line becomes a separate iMessage bubble)
- Each line under 60 characters
- Reference their SPECIFIC job title, company, industry, or career history
- Make a light, witty observation about their work. Gentle roast of the role or industry
- Don't explain how you know. Just drop it like you've always known
- Don't introduce yourself or say "I'm Nest"
- Don't ask questions like "want me to show you what I can do?"
- Don't use emojis
- End with something that implies you're ready to work, not a sales pitch
- Australian English (analyse, organise, colour)
- Never use em dashes

Examples of tone (adapt to their ACTUAL data):
"well well well. Sarah Chen, Head of Compliance at a Big Four firm. I bet you're fun at parties"
"ah, James Mitchell. VP of Sales with 47 meetings this week and prep for exactly zero of them"
"12 years in fintech and still going. that's either dedication or Stockholm syndrome"

PROFILE INTEL:
${pdlContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 150,
        temperature: 0.9,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the welcome message." },
        ],
      }),
    });

    if (!resp.ok) {
      console.error(`[onboard] OpenAI error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return `welcome back ${name.split(" ")[0].toLowerCase()}\nnow the real fun starts`;
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) return text;
  } catch (e) {
    console.error("[onboard] Welcome generation failed:", e);
  }

  return `welcome back ${name.split(" ")[0].toLowerCase()}\nnow the real fun starts`;
}

async function triggerProfileBuild(userId: string): Promise<void> {
  const url = `${supabaseUrl}/functions/v1/profile-builder`;
  console.log(`[onboard] Triggering profile-builder for ${userId}`);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (resp.ok) {
      const data = await resp.json();
      console.log(`[onboard] Profile built in ${data.elapsed_ms}ms`);
    } else {
      console.error(`[onboard] Profile builder returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.error(`[onboard] Profile builder call failed:`, (e as Error).message);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ── HTML helper ──────────────────────────────────────────

function page(title: string, body: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      background: #FAFAF7;
      color: #1a1a1a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      padding-bottom: env(safe-area-inset-bottom, 24px);
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      width: 100%;
      max-width: 360px;
      text-align: center;
    }
    .icon {
      width: 80px; height: 80px;
      background: #EDE8DF;
      border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 32px;
    }
    .icon span {
      font-size: 36px; font-weight: 800; color: #1a1a1a;
      letter-spacing: -1px;
    }
    h1 {
      font-size: 28px; font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 10px;
    }
    .sub {
      font-size: 16px; color: rgba(0,0,0,0.45);
      line-height: 1.5; margin-bottom: 48px;
    }
    .btn {
      display: block; width: 100%;
      padding: 16px 24px;
      background: #EDE8DF; color: #1a1a1a;
      font-size: 17px; font-weight: 600;
      text-align: center; text-decoration: none;
      border: none; border-radius: 14px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active { opacity: 0.85; transform: scale(0.98); }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(0,0,0,0.08);
      border-top-color: #1a1a1a;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-bottom: 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .green { color: #34d399; }
    .dim { color: rgba(0,0,0,0.35); font-size: 14px; margin-top: 16px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
    },
  });
}

// ── Page fragments ───────────────────────────────────────

function welcomePage(authUrl: string) {
  return `
    <div class="icon"><span>N</span></div>
    <h1>Welcome to Nest</h1>
    <p class="sub">Your AI assistant, right in iMessage.</p>
    <a href="${authUrl}" class="btn">Create Account</a>
  `;
}

function callbackPage(token: string) {
  return `
    <div id="v-load">
      <div class="spinner"></div>
      <h1>Connecting...</h1>
      <p class="sub">Finishing sign-in</p>
    </div>
    <div id="v-done" hidden>
      <div class="icon"><span>N</span></div>
      <h1 class="green">You're in</h1>
      <p class="sub">Head back to iMessage and message Nest.</p>
      <a href="sms:" class="btn">Open Messages</a>
    </div>
    <div id="v-err" hidden>
      <h1 id="e-title">Something went wrong</h1>
      <p class="sub" id="e-msg">Try again.</p>
    </div>
    <script>
    (async function(){
      var h = new URLSearchParams(location.hash.slice(1));
      var at = h.get("access_token");
      if (!at) { show("v-err"); return; }
      try {
        var r = await fetch("${supabaseUrl}/functions/v1/imessage-onboard", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            token: "${token}",
            access_token: at,
            provider_token: h.get("provider_token") || "",
            provider_refresh_token: h.get("provider_refresh_token") || ""
          })
        });
        var d = await r.json();
        if (d.success) { show("v-done"); }
        else if (d.error === "email_conflict") {
          document.getElementById("e-title").textContent = "Account already exists";
          err(d.hint || d.detail || "This email is linked to another account.");
        }
        else { err(d.detail || d.error); }
      } catch(e) { err(e.message); }
      function show(id) {
        document.getElementById("v-load").hidden = true;
        document.getElementById(id).hidden = false;
      }
      function err(m) {
        document.getElementById("e-msg").textContent = m || "Try again.";
        show("v-err");
      }
    })();
    </script>
  `;
}

function donePage() {
  return `
    <div class="icon"><span>N</span></div>
    <h1 class="green">Already connected</h1>
    <p class="sub">You're all set. Go back to iMessage.</p>
    <a href="sms:" class="btn">Open Messages</a>
  `;
}

function msgPage(title: string, sub: string) {
  return `
    <div class="icon"><span>N</span></div>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
  `;
}
