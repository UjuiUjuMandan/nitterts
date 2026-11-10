import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/x/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/x/client")>(),
  fetchAccountInfo: vi.fn(),
}));

import { fetchAccountInfo, XApiError } from "../src/x/client";
import { parseAccountInfo } from "../src/x/profile";
import { fetchOptionalAccountInfo } from "../src/serve/account-info";
import { resetMetricsSink } from "../src/x/metrics-sink";
import { resetRateLimitTracking } from "../src/x/rate-limit";

const sessions = [{ kind: "cookie" as const, username: "operator", id: "1", authToken: "secret", ct0: "csrf" }];
const request = new Request("https://nitter.test/eluthel1");
const info = { ...parseAccountInfo(undefined), username: "eluthel1", basedIn: "Japan" };

describe("on-demand account info cache", () => {
  let entries: Map<string, Response>;
  let match: ReturnType<typeof vi.fn>;
  let put: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMetricsSink();
    resetRateLimitTracking();
    entries = new Map();
    match = vi.fn(async (key: Request) => entries.get(key.url)?.clone());
    put = vi.fn(async (key: Request, response: Response) => { entries.set(key.url, response.clone()); });
    vi.stubGlobal("caches", { default: { match, put } });
    vi.mocked(fetchAccountInfo).mockResolvedValue(info);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("never fetches about info on a cold profile/search view", async () => {
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request)).toBeUndefined();
    expect(fetchAccountInfo).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("fetches on /about, then reuses cached info case-insensitively without another X call", async () => {
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", new Request("https://nitter.test/eluthel1/about"), true)).toEqual(info);
    expect(await fetchOptionalAccountInfo(sessions, "ELUTHEL1", request)).toEqual(info);
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request, true)).toEqual(info);
    expect(fetchAccountInfo).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    const [key, response] = put.mock.calls[0]!;
    expect(key.headers.has("cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(JSON.stringify(await response.clone().json())).not.toContain("secret");
  });

  it("cold reads stay cache-only after eviction", async () => {
    await fetchOptionalAccountInfo(sessions, "eluthel1", request, true);
    entries.clear();
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request)).toBeUndefined();
    expect(fetchAccountInfo).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed or empty X responses", async () => {
    vi.mocked(fetchAccountInfo).mockRejectedValueOnce(new XApiError(429, "limited"));
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request, true)).toBeUndefined();
    vi.mocked(fetchAccountInfo).mockResolvedValueOnce(parseAccountInfo(undefined));
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request, true)).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it("cache outages do not trigger unsolicited X requests or hide fresh /about data", async () => {
    match.mockRejectedValue(new Error("cache unavailable"));
    put.mockRejectedValue(new Error("cache unavailable"));
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request)).toBeUndefined();
    expect(fetchAccountInfo).not.toHaveBeenCalled();
    expect(await fetchOptionalAccountInfo(sessions, "eluthel1", request, true)).toEqual(info);
  });
});
