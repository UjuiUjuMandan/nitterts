export type CookieSession = {
  kind: "cookie";
  username: string;
  id: string;
  authToken: string;
  ct0: string;
};

export function parseSessions(jsonl: string): CookieSession[] {
  const sessions = jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseSession(line, index + 1));

  if (sessions.length === 0) {
    throw new Error("NITTER_SESSIONS contains no cookie sessions");
  }

  return sessions;
}

function parseSession(line: string, lineNumber: number): CookieSession {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`NITTER_SESSIONS line ${lineNumber} is not valid JSON`);
  }

  if (!isRecord(value) || value.kind !== "cookie") {
    throw new Error(`NITTER_SESSIONS line ${lineNumber} is not a cookie session`);
  }

  const username = requireString(value, "username", lineNumber);
  const id = requireString(value, "id", lineNumber);
  const authToken = requireString(value, "auth_token", lineNumber);
  const ct0 = requireString(value, "ct0", lineNumber);

  return { kind: "cookie", username, id, authToken, ct0 };
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  lineNumber: number,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`NITTER_SESSIONS line ${lineNumber} has invalid ${key}`);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
