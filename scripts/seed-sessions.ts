#!/usr/bin/env node
// Seeds the operator's X cookie sessions into the SESSION_STORE KV namespace
// (key "operator/sessions"), replacing the retired NITTER_SESSIONS secret.
//
//   node scripts/seed-sessions.ts                       # reads ./sessions.jsonl, remote KV
//   node scripts/seed-sessions.ts --file my.jsonl --local
//
// Input is the same NDJSON the secret used, one object per line:
//   {"kind":"cookie","username":"…","id":"…","auth_token":"…","ct0":"…"}

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CookieSession } from "../src/session.ts";
import { fetchProfile } from "../src/x/client.ts";
import { OPERATOR_KEY, operatorWire } from "../src/session-store.ts";

function parseArgs(argv: string[]): { file: string; local: boolean; namespaceId?: string } {
  const args: { file: string; local: boolean; namespaceId?: string } = { file: "sessions.jsonl", local: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i] === "--local") args.local = true;
    else if (argv[i] === "--namespace-id") args.namespaceId = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(1);
    }
  }
  return args;
}

function namespaceIdFromWranglerConfig(): string | undefined {
  let config: string;
  try {
    config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  } catch {
    return undefined;
  }
  // Strip // comments, then find the SESSION_STORE binding's id.
  const json = config.replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(json) as { kv_namespaces?: Array<{ binding: string; id: string }> };
  return parsed.kv_namespaces?.find((ns) => ns.binding === "SESSION_STORE")?.id;
}

const args = parseArgs(process.argv.slice(2));
const namespaceId = args.namespaceId ?? namespaceIdFromWranglerConfig();
if (!namespaceId) {
  console.error("No SESSION_STORE namespace id found in wrangler.jsonc; pass --namespace-id.");
  process.exit(1);
}

const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const TOKEN_PATTERN = /^[0-9a-fA-F]{16,256}$/;

let lines: string[];
try {
  lines = readFileSync(args.file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
} catch (error) {
  console.error((error as NodeJS.ErrnoException).code === "ENOENT"
    ? `File not found: ${args.file}`
    : (error as Error).message);
  process.exit(1);
}

const sessions: CookieSession[] = [];
let derived = 0;
for (const line of lines) {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.error(`Skipping line (not valid JSON): ${line.slice(0, 60)}…`);
    continue;
  }
  if (
    entry.kind !== "cookie" ||
    typeof entry.username !== "string" || !USERNAME_PATTERN.test(entry.username) ||
    typeof entry.auth_token !== "string" || !TOKEN_PATTERN.test(entry.auth_token) ||
    typeof entry.ct0 !== "string" || !TOKEN_PATTERN.test(entry.ct0)
  ) {
    console.error(`Skipping line (invalid fields): ${line.slice(0, 60)}…`);
    continue;
  }
  let id = typeof entry.id === "string" && /^\d{1,19}$/.test(entry.id) ? entry.id : undefined;
  if (!id) {
    // No account id: derive it live against X, like the donation flow does.
    const candidate: CookieSession = {
      kind: "cookie", username: entry.username, id: "seed-check",
      authToken: entry.auth_token.toLowerCase(), ct0: entry.ct0.toLowerCase(),
    };
    try {
      const profile = await fetchProfile(entry.username, candidate);
      id = /^\d{1,19}$/.test(profile.id) ? profile.id : undefined;
    } catch (error) {
      console.error(`Could not derive id for ${entry.username}: ${(error as Error).message}`);
    }
    derived++;
  }
  if (!id) {
    console.error(`Skipping ${entry.username}: no account id (log the session out on X if this recurs).`);
    continue;
  }
  if (sessions.some((session) => session.id === id)) {
    console.error(`Skipping duplicate session for id ${id} (${entry.username}).`);
    continue;
  }
  sessions.push({
    kind: "cookie",
    username: entry.username,
    id,
    authToken: entry.auth_token.toLowerCase(),
    ct0: entry.ct0.toLowerCase(),
  });
}

if (sessions.length === 0) {
  console.error("No usable sessions; nothing to seed.");
  process.exit(1);
}
console.log(`Parsed ${sessions.length} session(s) (${derived} id(s) derived from X).`);

const dir = mkdtempSync(join(tmpdir(), "nitterts-seed-"));
const payload = join(dir, "operator-sessions.json");
writeFileSync(payload, operatorWire(sessions));
try {
  execFileSync(
    "npx",
    [
      "wrangler", "kv", "key", "put",
      "--namespace-id", namespaceId,
      "--path", payload,
      ...(args.local ? ["--local"] : ["--remote"]),
      OPERATOR_KEY,
    ],
    { stdio: "inherit" },
  );
  console.log(`Seeded ${sessions.length} operator session(s) into ${OPERATOR_KEY}${args.local ? " (local)" : ""}.`);
} catch {
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}