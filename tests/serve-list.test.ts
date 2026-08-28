import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/x/sessions", () => ({
  withCookieSession: async (_jsonl: string, action: (session: object) => Promise<unknown>) => action({ kind: "cookie" }),
}));

vi.mock("../src/x/list", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/x/list")>(),
  fetchListBySlug: vi.fn(),
}));

import { serveListSlugRedirect } from "../src/serve/list";
import { fetchListBySlug } from "../src/x/list";

const list = {
  id: "99",
  name: "News",
  description: "",
  members: 1,
  banner: "",
  owner: {
    id: "1",
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
  },
};

describe("serveListSlugRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchListBySlug).mockResolvedValue(list);
  });

  it("redirects to the canonical ID while preserving cursor", async () => {
    const response = await serveListSlugRedirect(
      new Request("https://nitter.test/alice/lists/news?cursor=next-page"),
      { NITTER_SESSIONS: "unused" },
      "alice",
      "news",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://nitter.test/i/lists/99?cursor=next-page");
  });
});
