import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/x/sessions", () => ({
  withCookieSession: async (_jsonl: string, action: (session: object) => Promise<unknown>) => action({ kind: "cookie" }),
}));

vi.mock("../src/x/conversation", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/x/conversation")>(),
  fetchConversation: vi.fn(),
}));

import { onRequestGet } from "../functions/[username]/status/[id]";
import { fetchConversation, parseConversation } from "../src/x/conversation";

describe("status reply sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchConversation).mockResolvedValue(parseConversation({
      data: { timelineResponse: { instructions: [{ type: "TimelineAddEntries", entries: [
        { entryId: "tweet-2", content: { itemContent: { tweet_results: { result: {
          rest_id: "2", legacy: { full_text: "main" },
          core: { user_results: { result: { rest_id: "1", core: { screen_name: "alice", name: "Alice" } } } },
        } } } } },
        { entryId: "cursor-bottom-0", content: { value: "next" } },
      ] }] } },
    }, "2"));
  });

  it.each([
    ["", "Relevance"], ["&sort=Recency", "Recency"], ["&sort=likes", "Likes"], ["&sort=bad", "Relevance"],
  ])("passes normalized request sort %s to API and renderer", async (query, expected) => {
    const response = await onRequestGet({
      request: new Request(`https://nitter.test/alice/status/2?cursor=current${query}`),
      params: { username: "alice", id: "2" },
      env: { NITTER_SESSIONS: "unused" },
    } as Parameters<typeof onRequestGet>[0]);
    expect(response.status).toBe(200);
    const imagePolicy = response.headers.get("content-security-policy")!.split(";").find((directive) => directive.trim().startsWith("img-src"))!;
    expect(imagePolicy).toContain("https://pbs.twimg.com");
    expect(imagePolicy).toContain("https://abs.twimg.com");
    expect(imagePolicy).toContain("https://video.twimg.com");
    expect(imagePolicy).not.toMatch(/\shttps:(?:\s|$)/);
    expect(fetchConversation).toHaveBeenCalledWith("2", { kind: "cookie" }, "current", expected);
    expect(await response.text()).toContain(`class="reply-sort-option active" href="?sort=${expected}#r"`);
  });
});
