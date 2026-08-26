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
        bioLinks: [{ kind: "url", start: 11, end: 16, url: "https://sound.example", display: "sound.example" }],
        avatar: "https://pbs.twimg.com/alice.jpg",
        banner: "https://pbs.twimg.com/banner.jpg",
        location: "The Internet",
        website: "https://alice.example",
        joinedAt: "Mon Dec 30 23:54:40 +0000 2013",
        followers: 2,
        following: 3,
        tweets: 4,
        media: 6,
        likes: 5,
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
            links: [
              { kind: "url", start: 0, end: 5, url: "https://nim-lang.org/docs", display: "nim-lang.org/docs" },
              { kind: "mention", start: 6, end: 12, url: "/alice", display: "" },
              { kind: "url", start: 13, end: 18, url: "javascript:alert(1)", display: "evil" },
            ],
            pinned: false,
          },
        ],
      },
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("/media?url=https%3A%2F%2Fpbs.twimg.com%2Falice.jpg");
    expect(html).toContain('class="profile-tabs"');
    expect(html).toContain('class="profile-card-avatar"');
    expect(html).toContain('class="timeline-item tweet"');
    expect(html).toContain('class="tweet-body"');
    expect(html).toContain('class="tweet-link" href="/alice/status/10"');
    expect(html).toContain("| nitter</title>");
    expect(html).toContain('href="/alice/with_replies"');
    expect(html).toContain('href="/alice/media"');
    expect(html).toContain('class="profile-banner"');
    expect(html).toContain('class="profile-location"');
    expect(html).toContain('class="profile-website"');
    expect(html).toContain('class="profile-joindate"');
    expect(html).toContain("Dec 2013");
    expect(html).toContain(">Likes<");
    expect(html).toContain('href="https://nim-lang.org/docs"');
    expect(html).toContain('href="/alice"');
    expect(html).not.toContain('href="javascript:');

    const withRail = renderProfilePage(
      {
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
        media: 2,
        likes: 0,
        protected: false,
        blueVerified: false,
        suspended: false,
      },
      { tweets: [] },
      "tweets",
      [{ url: "https://pbs.twimg.com/media/a.jpg", tweetId: "10" }],
    );
    expect(withRail).toContain('class="photo-rail-card"');
    expect(withRail).toContain("2 Photos and videos");
    expect(withRail).toContain("/alice/status/10#m");
    expect(withRail).toContain("%2Fmedia%2Fa.jpg%3Athumb");

    const verified = renderProfilePage(
      {
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
        blueVerified: true,
        verifiedType: "business",
        suspended: false,
      },
      { tweets: [] },
    );
    expect(verified).toContain("verified-icon business");
    expect(verified).toContain("icon-circle");

    const replies = renderProfilePage(
      {
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
        suspended: false,
      },
      { tweets: [] },
      "replies",
    );
    expect(replies).toContain('class="tab-item wide active"');

    const suspended = renderProfilePage(
      {
        id: "",
        username: "alice",
        name: "alice",
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
        suspended: true,
      },
      { tweets: [] },
    );
    expect(suspended).toContain("This account is suspended.");
    expect(suspended).not.toContain("No tweets found.");
  });
});
