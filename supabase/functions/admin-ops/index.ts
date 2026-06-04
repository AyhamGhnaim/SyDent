// ════════════════════════════════════════════════════════════════════════
// SyDent — admin-ops  (Supabase Edge Function)  · Phase E
// ════════════════════════════════════════════════════════════════════════
// PURPOSE
//   Single privileged backend for the platform admin console (admin.html).
//   Moves the Supabase service_role key OFF the browser and KEEPS it here,
//   server-side only (read from Deno.env, auto-injected by Supabase). The
//   admin's OWN session JWT authorizes each call; this function verifies the
//   caller is a platform admin before doing any privileged work.
//
//   This mirrors the Stripe / Microsoft Partner Center model: the publishable
//   key runs in the browser, the secret/service key never leaves the server,
//   and a backend endpoint gates (authenticate + authorize) then elevates.
//
// SECURITY MODEL  (fail-closed)
//   verify_jwt is intentionally set to OFF in the Dashboard for this function.
//   Reason: SyDent's client uses the NEW publishable key (sb_publishable_…),
//   and the platform-gateway verify_jwt step is built around the LEGACY
//   JWT-based anon/service keys — mixing the two is a known source of 401s.
//   So we do ALL auth inside this handler instead, which is unambiguous and
//   key-system-agnostic:
//     1. Extract the caller's session JWT from the Authorization header.
//     2. Validate it via admin.auth.getUser(jwt)  → returns the real user.
//     3. Confirm that user.id is in platform_admins (service-role read).
//   Any failure → 401/403, no privileged work. A request with no/invalid
//   token, or from a non-admin, can never reach the dispatch block.
//   NOTE: we never construct a client from SUPABASE_ANON_KEY (which may hold a
//   disabled legacy JWT after the key migration). Only the service-role client
//   is used; getUser(jwt) validates the caller's token independently.
//
// SECRETS
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided by Supabase
//   to every Edge Function. No manual secret is set for this function.
//
// DEPLOY  (no CLI / no Docker — single-operator workflow)
//   Dashboard → Edge Functions → Deploy a new function → name: admin-ops →
//   paste this file → uncheck "Verify JWT" → Deploy. This file is the repo
//   source-of-truth (the Dashboard editor has no versioning); re-paste from
//   here to redeploy. The endpoint is:
//     https://<project-ref>.functions.supabase.co/admin-ops
//   (called from admin.html via window.sb.functions.invoke('admin-ops', …),
//    which attaches the admin's Authorization JWT + the publishable apikey.)
//
// ACTIONS  (dispatched on body.action)
//   ping               → { ok, uid }                         (E0 smoke test)
//   tenant_activity    → { patients, appointments, employees, lastSignIn }
//   owner_names        → { map: { ownerId: name } }
//   count_active_staff → { count }                            (number | null)
//   ban_user           → { ok }    (PUT ban_duration 876600h ≈ permanent)
//   unban_user         → { ok }    (PUT ban_duration 'none')
//   delete_auth_user   → { ok }    (DELETE auth.users → cascades tenant data)
//
// COLUMN NOTES (SyDent schema — do not "fix" these):
//   patients.doctor_id     = owner's auth.users.id   (NOT owner_id)
//   appointments.doctor_id = owner's auth.users.id   (NOT owner_id)
//   clinic_employees.owner_id = owner's auth.users.id
//   The owner's doctors.id == auth.users.id (Phase 1 canonical design).
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  // CORS is browser-enforced UX, NOT the security boundary — the JWT +
  // platform_admins gate below is. '*' keeps the admin console working from
  // sydent.app and any Cloudflare preview origin without breakage.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "function_misconfigured" });
  }

  // Single privileged client (service role). Never persists a session.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1) Authenticate the caller from THEIR session JWT ───────────────
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "missing_token" });

  let callerId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data || !data.user) return json(401, { error: "invalid_token" });
    callerId = data.user.id;
  } catch (_e) {
    return json(401, { error: "invalid_token" });
  }

  // ── 2) Authorize: caller must be a platform admin (fail-closed) ─────
  try {
    const { data: pa, error: paErr } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    if (paErr) return json(500, { error: "auth_check_failed" });
    if (!pa) return json(403, { error: "not_platform_admin" });
  } catch (_e) {
    return json(500, { error: "auth_check_failed" });
  }

  // ── 3) Parse body + dispatch ────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    return json(400, { error: "invalid_json" });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const p = body as Record<string, any>;

  try {
    switch (action) {
      // ── E0 smoke test ──────────────────────────────────────────────
      case "ping":
        return json(200, { ok: true, uid: callerId, ts: new Date().toISOString() });

      // ── Reads (E1) ─────────────────────────────────────────────────
      // Bundles the 4 Customer-360 activity reads into ONE round-trip
      // (was 4 separate fetches client-side). Each part fails soft to null,
      // matching the previous client behaviour (callers fail-open).
      case "tenant_activity": {
        const uid = p.userId;
        if (!uid) return json(400, { error: "missing_userId" });
        const [pr, ar, er, ur] = await Promise.all([
          admin.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", uid),
          admin.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", uid),
          admin.from("clinic_employees").select("id", { count: "exact", head: true }).eq("owner_id", uid).eq("is_active", true),
          admin.auth.admin.getUserById(uid),
        ]);
        return json(200, {
          patients: pr.error ? null : (pr.count ?? null),
          appointments: ar.error ? null : (ar.count ?? null),
          employees: er.error ? null : (er.count ?? null),
          lastSignIn: (ur.error || !ur.data || !ur.data.user)
            ? null
            : (ur.data.user.last_sign_in_at || null),
        });
      }

      case "owner_names": {
        const ids = Array.isArray(p.userIds)
          ? p.userIds.filter((x: unknown) => typeof x === "string" && x)
          : [];
        if (!ids.length) return json(200, { map: {} });
        const { data, error } = await admin
          .from("clinic_employees")
          .select("owner_id,name")
          .eq("role", "owner")
          .in("owner_id", ids);
        const map: Record<string, string> = {};
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row && row.owner_id && row.name && String(row.name).trim()) {
              map[row.owner_id] = String(row.name).trim();
            }
          }
        }
        return json(200, { map });
      }

      case "count_active_staff": {
        const uid = p.ownerUserId;
        if (!uid) return json(400, { error: "missing_ownerUserId" });
        const { count, error } = await admin
          .from("clinic_employees")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", uid)
          .eq("is_active", true)
          .neq("role", "owner");
        return json(200, { count: error ? null : (count ?? null) });
      }

      // ── Writes (E2) — auth lifecycle ───────────────────────────────
      case "ban_user": {
        const uid = p.userId;
        if (!uid) return json(400, { error: "missing_userId" });
        const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: "876600h" });
        if (error) return json(502, { error: "ban_failed", detail: error.message });
        return json(200, { ok: true });
      }

      case "unban_user": {
        const uid = p.userId;
        if (!uid) return json(400, { error: "missing_userId" });
        const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: "none" });
        if (error) return json(502, { error: "unban_failed", detail: error.message });
        return json(200, { ok: true });
      }

      case "delete_auth_user": {
        const uid = p.userId;
        if (!uid) return json(400, { error: "missing_userId" });
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) return json(502, { error: "delete_failed", detail: error.message });
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: "unknown_action", action });
    }
  } catch (e) {
    return json(500, { error: "handler_exception", detail: (e as Error)?.message || "exception" });
  }
});
