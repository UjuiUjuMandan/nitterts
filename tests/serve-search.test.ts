import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/x/sessions", () => ({
  withCookieSession: async (_jsonl: string, action: (session: object) => Promise<unknown>) => action({ kind: "cookie" }),
}));

vi.mock("../src/x/timeline", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/x/timeline")>(),
  fetchUserSearch: vi.fn(),
  fetchListSearch: vi.fn(),
  fetchSearchTimeline: vi.fn(),
  fetchProfileTimeline: vi.fn(),
}));

vi.mock("../src/x/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/x/client")>(),
  fetchProfile: vi.fn(),
}));

vi.mock("../src/serve/account-info", () => ({ fetchOptionalAccountInfo: vi.fn().mockResolvedValue(undefined) }));

import { serveSearchPage } from "../src/serve/search";
import { fetchProfile } from "../src/x/client";
import { fetchListSearch, fetchSearchTimeline, fetchUserSearch } from "../src/x/timeline";

const env = { NITTER_SESSIONS: "unused" } as Env;
const profile = {
  id: "42",
  username: "alice",
  name: "Alice",
  bio: "",
  bioLinks: [],
  avatar: "",
  banner: "",
  location: "",
  website: "",
  joinedAt: "",
  followers: 0,
  following: 0,
  tweets: 0,
  media: 0,
  likes: 0,
  protected: false,
  blueVerified: false,
  verifiedType: "none" as const,
  suspended: false,
};

describe("serveSearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUserSearch).mockResolvedValue({ users: [] });
    vi.mocked(fetchListSearch).mockResolvedValue({ lists: [] });
    vi.mocked(fetchSearchTimeline).mockResolvedValue({ tweets: [] });
    vi.mocked(fetchProfile).mockResolvedValue(profile);
  });

  it("dispatches X-compatible user and list aliases with cursors", async () => {
    const users = await serveSearchPage(new Request("https://nitter.test/search?f=user&q=alice&cursor=users-cursor"), env);
    const lists = await serveSearchPage(new Request("https://nitter.test/search?f=list&q=nim&cursor=lists-cursor"), env);

    expect(users.status).toBe(200);
    expect(lists.status).toBe(200);
    expect(fetchUserSearch).toHaveBeenCalledWith("alice", { kind: "cookie" }, "users-cursor");
    expect(fetchListSearch).toHaveBeenCalledWith("nim", { kind: "cookie" }, "lists-cursor");
    expect(await users.text()).toContain('name="f" value="users"');
    expect(await lists.text()).toContain('name="f" value="lists"');
  });

  it("does not send empty directory searches upstream", async () => {
    const response = await serveSearchPage(new Request("https://nitter.test/search?f=users&since=2026-01-01"), env);

    expect(response.status).toBe(200);
    expect(fetchUserSearch).not.toHaveBeenCalled();
  });

  it("falls back to tweet search for profile-scoped directory kinds", async () => {
    const response = await serveSearchPage(
      new Request("https://nitter.test/alice/search?f=users&q=hello&cursor=profile-cursor"),
      env,
      "alice",
    );

    expect(response.status).toBe(200);
    expect(fetchUserSearch).not.toHaveBeenCalled();
    expect(fetchSearchTimeline).toHaveBeenCalledWith(
      "from:alice hello include:nativeretweets",
      "tweets",
      { kind: "cookie" },
      "profile-cursor",
    );
  });

  it("forwards filter and exclude toggles into the upstream query", async () => {
    const response = await serveSearchPage(
      new Request("https://nitter.test/search?f=tweets&q=nim&f-media=on&f-quote=on&e-replies=on&e-nativeretweets=on&f-bogus=on&f-media=1"),
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchSearchTimeline).toHaveBeenCalledWith(
      "filter:media filter:quote -filter:replies nim",
      "tweets",
      { kind: "cookie" },
      undefined,
    );
    expect(await response.text()).toContain("f-media=on&amp;f-quote=on&amp;e-replies=on&amp;e-nativeretweets=on");
  });

  it("searches with toggles alone and omits the retweet include when excluded", async () => {
    const response = await serveSearchPage(new Request("https://nitter.test/search?f=tweets&q=&f-media=on&e-nativeretweets=on"), env);

    expect(response.status).toBe(200);
    expect(fetchSearchTimeline).toHaveBeenCalledWith(
      "filter:media",
      "tweets",
      { kind: "cookie" },
      undefined,
    );

    const elided = await serveSearchPage(new Request("https://nitter.test/search?f=tweets&q=&e-nativeretweets=on"), env);
    expect(elided.status).toBe(200);
    expect(fetchSearchTimeline).toHaveBeenCalledTimes(1);
    expect(await elided.text()).toContain("No results found.");
  });
});
