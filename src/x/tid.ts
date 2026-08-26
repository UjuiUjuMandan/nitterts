const PAIRS_URL =
  "https://raw.githubusercontent.com/fa0311/x-client-transaction-id-pair-dict/refs/heads/main/pair.json";
const KEYWORD = "obfiowerehiring";
const TIME_ORIGIN_SECONDS = 1_682_924_400;
const MAX_PAIRS_BYTES = 1024 * 1024;

export type TidPair = {
  animationKey: string;
  verification: string;
};

export async function fetchTidPair(): Promise<TidPair> {
  const response = await fetch(PAIRS_URL, {
    headers: { accept: "application/json" },
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  if (!response.ok) {
    if (response.body) await response.body.cancel();
    throw new Error(`TID pair request failed with ${response.status}`);
  }

  const pairs = JSON.parse(await readTextLimited(response, MAX_PAIRS_BYTES)) as unknown;
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error("TID pair response is empty");
  }

  const randomIndex = randomByte() % pairs.length;
  const pair = pairs[randomIndex];
  if (!isTidPair(pair)) {
    throw new Error("TID pair response has an invalid entry");
  }
  return pair;
}

export async function generateTransactionId(
  path: string,
  pair: TidPair,
  nowMs = Date.now(),
  mask = randomByte(),
): Promise<string> {
  const time = Math.floor(nowMs / 1000) - TIME_ORIGIN_SECONDS;
  const timeBytes = new Uint8Array(4);
  new DataView(timeBytes.buffer).setUint32(0, time, true);

  const data = `GET!${path}!${time}${KEYWORD}${pair.animationKey}`;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)),
  );
  const verification = decodeBase64(pair.verification);
  const payload = concatBytes(verification, timeBytes, hash.slice(0, 16), new Uint8Array([3]));
  const encoded = new Uint8Array(payload.length + 1);
  encoded[0] = mask;
  encoded.set(payload.map((byte) => byte ^ mask), 1);

  return encodeBase64(encoded).replace(/=+$/, "");
}

function randomByte(): number {
  return crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function isTidPair(value: unknown): value is TidPair {
  return (
    typeof value === "object" &&
    value !== null &&
    "animationKey" in value &&
    typeof value.animationKey === "string" &&
    "verification" in value &&
    typeof value.verification === "string"
  );
}

async function readTextLimited(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > limit) throw new Error("TID pair response is too large");
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel();
  }
}
