// hirafu-onboard — Web OAuth verification + account linking for Hirafu.
//
// POST: Links phone to user, stores OAuth tokens, triggers profile build,
//        sends welcome message via hirafu_outbound_messages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { linkConversationsToUser } from "../_shared/hirafu-conversation-store.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Look up hirafu user by token
    const { data: hirafuUser } = await supabase
      .from("hirafu_users")
      .select("id, phone_number, user_id, status")
      .eq("onboarding_token", token)
      .maybeSingle();

    if (!hirafuUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (hirafuUser.status === "active" && hirafuUser.user_id) {
      return new Response(JSON.stringify({ status: "already_active", user_id: hirafuUser.user_id }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      status: hirafuUser.status,
      phone: hirafuUser.phone_number,
      product: "hirafu",
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const {
      token,
      access_token: accessToken,
      provider_token: providerToken,
      provider_refresh_token: providerRefreshToken,
      provider = "google",
      user_id: authUserId,
    } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[hirafu-onboard] Processing verification for token ${token}`);

    // Look up hirafu user
    const { data: hirafuUser, error: lookupError } = await supabase
      .from("hirafu_users")
      .select("*")
      .eq("onboarding_token", token)
      .maybeSingle();

    if (lookupError || !hirafuUser) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!authUserId) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const userId = authUserId;

    // Get user info from Google token
    let googleEmail = "";
    let googleName = "";
    let googleAvatar = "";

    if (provider === "google" && providerToken) {
      try {
        const userInfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${providerToken}` },
        });
        if (userInfoResp.ok) {
          const userInfo = await userInfoResp.json();
          googleEmail = userInfo.email ?? "";
          googleName = userInfo.name ?? "";
          googleAvatar = userInfo.picture ?? "";
        }
      } catch (e) {
        console.error("[hirafu-onboard] Failed to fetch Google user info:", e);
      }
    }

    // Store Google account (reuses shared user_google_accounts table)
    if (provider === "google" && providerRefreshToken) {
      const { error: accountError } = await supabase
        .from("user_google_accounts")
        .upsert({
          user_id: userId,
          google_email: googleEmail,
          google_name: googleName,
          google_avatar_url: googleAvatar,
          refresh_token: providerRefreshToken,
          is_primary: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,google_email" });

      if (accountError) {
        console.error("[hirafu-onboard] Failed to store Google account:", accountError.message);
      }
    }

    // Store Microsoft account
    if (provider === "microsoft" && providerRefreshToken) {
      await supabase
        .from("user_microsoft_accounts")
        .upsert({
          user_id: userId,
          microsoft_email: googleEmail,
          refresh_token: providerRefreshToken,
          is_primary: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,microsoft_email" });
    }

    // Update hirafu_users to active
    await supabase
      .from("hirafu_users")
      .update({
        user_id: userId,
        status: "active",
        display_name: googleName || hirafuUser.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hirafuUser.id);

    // Link conversations
    await linkConversationsToUser(supabase, hirafuUser.phone_number, userId);

    // Send welcome message
    await supabase.from("hirafu_outbound_messages").insert({
      phone_number: hirafuUser.phone_number,
      content: `You're in.\n---\nI've got access to your ${provider === "google" ? "Google" : "Microsoft"} account now. Calendar, emails, the lot.\n---\nWhat do you need?`,
    });

    // Trigger profile build (fire-and-forget)
    const profileBuildUrl = `${supabaseUrl}/functions/v1/hirafu-profile-builder`;
    fetch(profileBuildUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, provider }),
    }).catch(e => console.error("[hirafu-onboard] Profile build trigger failed:", e));

    console.log(`[hirafu-onboard] Successfully verified ${hirafuUser.phone_number} → ${userId}`);

    return new Response(JSON.stringify({ success: true, uid: userId }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[hirafu-onboard] Error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
