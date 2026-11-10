import { preferencesFromRequest } from "../preferences";
import type { CookieSession } from "../session";
import {
  assemblePool,
  loadDonatedSessions,
  loadOperatorSessions,
  newStewardToken,
  sessionCreatedAt,
  sessionLabel,
  stewardCookie,
  stewardTokenFromRequest,
} from "../session-pool";
import {
  getStewardSessions,
  MAX_SESSIONS_PER_STEWARD,
  putStewardSessions,
  type DonatedSession,
  type SessionVisibility,
} from "../session-store";
import { renderSessionSettingsPage, type PoolSessionView, type SessionSettingsView } from "../render/session-settings";
import { fetchProfile, XApiError } from "../x/client";
import { ProfileNotFoundError } from "../x/profile";
import { metricsSink } from "../x/metrics-sink";
import { sessionPoolDebug, type DebugReport } from "../x/rate-limit";
import { effectiveRequestUrl, readForm, validateMutation } from "./form";
import { settingsHtml } from "./settings";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const COOKIE_VALUE_PATTERN = /^[0-9a-f]{16,256}$/;
const LABEL_PATTERN = /^anon-[0-9a-f]{10}$/;
const DONATION_WINDOW_MS = 10 * 60_000;
const DONATION_MAX_ATTEMPTS = 5;

// Isolate-local, best-effort throttle: every donation attempt costs a live X
// request, so cap bursts per client IP. Ephemeral by design (isolates reset),
// which is fine for a dam, not a firewall.
const donationAttempts = new Map<string, number[]>();

export async function serveSessionSettingsPage(request: Request, env: Env): Promise<Response> {
  const view = await buildView(request, env);
  const params = effectiveRequestUrl(request).searchParams;
  const added = params.get("added");
  if (added && LABEL_PATTERN.test(added)) {
    view.notice = `Session ${added} verified and stored. It can take up to a minute before it serves other visitors.`;
  } else if (params.get("updated") === "visibility") {
    view.notice = "Visibility updated.";
  } else if (params.get("updated") === "revoked") {
    view.notice = "Session removed. Log it out on X too if you want the cookies invalidated.";
  }
  return settingsHtml(renderSessionSettingsPage(preferencesFromRequest(request), view));
}

export async function serveSessionSettingsUpdate(request: Request, env: Env): Promise<Response> {
  const rejected = validateMutation(request);
  if (rejected) return rejected;
  const params = await readForm(request);
  if (params instanceof Response) return params;
  const action = params.get("action");
  if (action === "donate") return donateSession(request, env, params);
  if (action === "visibility") return updateVisibility(request, env, params);
  if (action === "revoke") return revokeSession(request, env, params);
  return fail(request, env, "Unknown action.");
}

async function buildView(request: Request, env: Env): Promise<SessionSettingsView> {
  const steward = stewardTokenFromRequest(request);
  const donated = await loadDonatedSessions(env);
  const pool = assemblePool(await loadOperatorSessions(env), donated, steward);
  const debug = await sessionDebug(pool);
  const donationById = new Map(donated.map((session) => [session.id, session] as const));
  const entries: PoolSessionView[] = pool.map((session) => {
    const donation = donationById.get(session.id);
    const mine = donation !== undefined && donation.ownerToken === steward;
    const created = sessionCreatedAt(session);
    return {
      label: sessionLabel(env, session),
      source: donation ? (mine ? "you" : "donor") : "operator",
      visibility: donation?.visibility ?? "public",
      status: statusFrom(debug[session.id]),
      createdYear: created > 0 ? String(new Date(created * 1000).getUTCFullYear()) : "?",
      donatedAt: mine && donation ? new Date(donation.donatedAt).toISOString().slice(0, 10) : undefined,
    };
  });
  return {
    donationsEnabled: env.SESSION_STORE !== undefined,
    pool: entries,
    stewardCount: entries.filter((entry) => entry.source === "you").length,
  };
}

async function donateSession(request: Request, env: Env, params: URLSearchParams): Promise<Response> {
  const kv = env.SESSION_STORE;
  if (!kv) return fail(request, env, "Session donations are not enabled on this instance.");
  if (!allowedFields(params, ["action", "username", "auth_token", "ct0", "visibility"])) {
    return fail(request, env, "Invalid donation fields.");
  }
  const username = (params.get("username") ?? "").trim();
  const authToken = (params.get("auth_token") ?? "").trim().toLowerCase();
  const ct0 = (params.get("ct0") ?? "").trim().toLowerCase();
  const visibility: SessionVisibility = params.get("visibility") === "private" ? "private" : "public";
  if (!USERNAME_PATTERN.test(username)) return fail(request, env, "Invalid X username.", username);
  if (!COOKIE_VALUE_PATTERN.test(authToken) || !COOKIE_VALUE_PATTERN.test(ct0)) {
    return fail(request, env, "Invalid auth_token or ct0; copy the full cookie values from a logged-in x.com session.", username);
  }
  if (!allowDonationAttempt(request.headers.get("cf-connecting-ip") ?? "unknown")) {
    return fail(request, env, "Too many donation attempts; try again in a few minutes.", username);
  }

  const stewardToken = stewardTokenFromRequest(request);
  const token = stewardToken ?? newStewardToken();
  let sessions: DonatedSession[];
  try {
    sessions = await getStewardSessions(kv, token);
  } catch {
    return fail(request, env, "Session store is unavailable; try again shortly.", username);
  }

  // Verify the cookies live against X with the donor-supplied username; the
  // response also yields the account id, which donors cannot be trusted to
  // provide correctly.
  const candidate: CookieSession = { kind: "cookie", username, id: "donation-check", authToken, ct0 };
  let id: string;
  let canonicalUsername: string;
  try {
    const profile = await fetchProfile(username, candidate);
    if (profile.suspended) return fail(request, env, "That account is suspended on X.", username);
    if (!/^\d{1,19}$/.test(profile.id)) return fail(request, env, "X did not return a usable account id.", username);
    id = profile.id;
    canonicalUsername = profile.username || username;
  } catch (error) {
    return fail(request, env, donationErrorMessage(error), username);
  }

  const record: DonatedSession = {
    kind: "cookie",
    username: canonicalUsername,
    id,
    authToken,
    ct0,
    ownerToken: token,
    visibility,
    donatedAt: Date.now(),
  };
  const existing = sessions.findIndex((session) => session.id === id);
  if (existing < 0 && sessions.length >= MAX_SESSIONS_PER_STEWARD) {
    return fail(request, env, `This browser already donated the maximum of ${MAX_SESSIONS_PER_STEWARD} sessions.`, username);
  }
  if (existing >= 0) sessions[existing] = record;
  else sessions.push(record);
  try {
    await putStewardSessions(kv, token, sessions);
  } catch {
    return fail(request, env, "Session store is unavailable; try again shortly.", username);
  }
  const cookies = stewardToken ? [] : [stewardCookie(token, isSecure(request))];
  return redirect(`/settings/sessions?added=${sessionLabel(env, record)}`, cookies);
}

async function updateVisibility(request: Request, env: Env, params: URLSearchParams): Promise<Response> {
  const kv = env.SESSION_STORE;
  if (!kv) return fail(request, env, "Session donations are not enabled on this instance.");
  if (!allowedFields(params, ["action", "session", "visibility"])) return fail(request, env, "Invalid fields.");
  const stewardToken = stewardTokenFromRequest(request);
  if (!stewardToken) return fail(request, env, "No donated sessions in this browser.");
  const visibility: SessionVisibility = params.get("visibility") === "private" ? "private" : "public";
  try {
    const sessions = await getStewardSessions(kv, stewardToken);
    const target = sessions.find((session) => sessionLabel(env, session) === params.get("session"));
    if (!target) return fail(request, env, "Session not found in this browser.");
    if (target.visibility !== visibility) {
      target.visibility = visibility;
      await putStewardSessions(kv, stewardToken, sessions);
    }
  } catch {
    return fail(request, env, "Session store is unavailable; try again shortly.");
  }
  return redirect("/settings/sessions?updated=visibility");
}

async function revokeSession(request: Request, env: Env, params: URLSearchParams): Promise<Response> {
  const kv = env.SESSION_STORE;
  if (!kv) return fail(request, env, "Session donations are not enabled on this instance.");
  if (!allowedFields(params, ["action", "session"])) return fail(request, env, "Invalid fields.");
  const stewardToken = stewardTokenFromRequest(request);
  if (!stewardToken) return fail(request, env, "No donated sessions in this browser.");
  try {
    const sessions = await getStewardSessions(kv, stewardToken);
    const kept = sessions.filter((session) => sessionLabel(env, session) !== params.get("session"));
    if (kept.length === sessions.length) return fail(request, env, "Session not found in this browser.");
    await putStewardSessions(kv, stewardToken, kept);
  } catch {
    return fail(request, env, "Session store is unavailable; try again shortly.");
  }
  return redirect("/settings/sessions?updated=revoked");
}

async function fail(
  request: Request,
  env: Env,
  message: string,
  prefillUsername?: string,
): Promise<Response> {
  const view = await buildView(request, env);
  return settingsHtml(
    renderSessionSettingsPage(preferencesFromRequest(request), {
      ...view,
      error: message,
      prefillUsername: prefillUsername === undefined ? undefined : prefillUsername.slice(0, 15),
    }),
    400,
  );
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store", vary: "Cookie" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function isSecure(request: Request): boolean {
  return effectiveRequestUrl(request).protocol === "https:";
}

function allowedFields(params: URLSearchParams, allowed: string[]): boolean {
  const set = new Set(allowed);
  for (const key of params.keys()) {
    if (!set.has(key) || params.getAll(key).length !== 1) return false;
  }
  return true;
}

function donationErrorMessage(error: unknown): string {
  if (error instanceof ProfileNotFoundError) return "That username does not exist on X.";
  if (error instanceof XApiError) {
    if (error.status === 401 || error.status === 403) {
      return "X rejected these cookies. Log in to x.com, copy fresh auth_token and ct0 values, and try again.";
    }
    if (error.status === 429) return "X is rate-limiting the verification request; try again in a few minutes.";
    return `Unable to verify this session with X (status ${error.status}).`;
  }
  return "Unable to verify this session with X.";
}

async function sessionDebug(sessions: CookieSession[]): Promise<DebugReport> {
  const sink = metricsSink();
  if (!sink) return sessionPoolDebug(sessions);
  try {
    return await sink.getDebug(sessions.map((session) => session.id));
  } catch {
    return sessionPoolDebug(sessions);
  }
}

function statusFrom(entry: DebugReport[string] | undefined): PoolSessionView["status"] {
  if (!entry) return "idle";
  if (entry.limited) return "limited";
  if (entry.pending > 0) return "busy";
  if (Object.keys(entry.apis).length > 0) return "ready";
  return "idle";
}

function allowDonationAttempt(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - DONATION_WINDOW_MS;
  if (donationAttempts.size > 1000) {
    for (const [key, times] of donationAttempts) {
      const fresh = times.filter((time) => time > cutoff);
      if (fresh.length === 0) donationAttempts.delete(key);
      else donationAttempts.set(key, fresh);
    }
  }
  const recent = (donationAttempts.get(ip) ?? []).filter((time) => time > cutoff);
  if (recent.length >= DONATION_MAX_ATTEMPTS) {
    donationAttempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  donationAttempts.set(ip, recent);
  return true;
}
