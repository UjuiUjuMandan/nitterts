import { describe, expect, it } from "vitest";
import { renderProfilePage } from "../src/render/profile";

describe("renderProfilePage", () => {
  it("escapes profile and tweet content and proxies images", () => {
    const html = renderProfilePage(
      {
        id: "1",
        username: "alice",
        name: "<script>alert(1)</script>",
        bio: "safe & sound",
        avatar: "https://pbs.twimg.com/alice.jpg",
        followers: 2,
        following: 3,
        tweets: 4,
        protected: false,
        blueVerified: false,
        suspended: false,
      },
      {
        tweets: [
          {
            id: "10",
            conversationId: "10",
            text: "<img src=x onerror=alert(1)>",
            createdAt: "2026-08-26T12:00:00.000Z",
            author: {
              id: "1",
              username: "alice",
              name: "Alice",
              avatar: "https://pbs.twimg.com/alice.jpg",
              blueVerified: false,
            },
            replies: 0,
            retweets: 0,
            likes: 0,
            views: 0,
            replyTo: [],
            media: [],
            pinned: false,
          },
        ],
      },
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("/media?url=https%3A%2F%2Fpbs.twimg.com%2Falice.jpg");

    const suspended = renderProfilePage(
      {
        id: "",
        username: "alice",
        name: "alice",
        bio: "",
        avatar: "",
        followers: 0,
        following: 0,
        tweets: 0,
        protected: false,
        blueVerified: false,
        suspended: true,
      },
      { tweets: [] },
    );
    expect(suspended).toContain("This account is suspended.");
    expect(suspended).not.toContain("No tweets found.");
  });
});
