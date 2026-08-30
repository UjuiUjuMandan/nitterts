import { describe, expect, it } from "vitest";
import { formatDate, renderProfilePage, renderTweet } from "../src/render/profile";

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
    expect(html).toContain("/pic/https%3A%2F%2Fpbs.twimg.com%2Falice.jpg");
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
    expect(withRail).toContain("pic/media%2Fa.jpg%3Athumb");

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

  it("renders original profile metadata and tweet context details", () => {
    const html = renderProfilePage(
      {
        id: "1",
        username: "alice",
        name: "Alice",
        bio: "",
        bioLinks: [],
        avatar: "",
        banner: "",
        location: "",
        basedIn: "United States",
        website: "",
        joinedAt: "Tue Jun 02 20:12:29 +0000 2009",
        followers: 0,
        following: 0,
        tweets: 1,
        media: 0,
        likes: 0,
        protected: false,
        blueVerified: false,
        verifiedType: "none",
        suspended: false,
      },
      {
        tweets: [{
          id: "10",
          conversationId: "10",
          text: "hello",
          createdAt: "2026-08-27T12:00:00.000Z",
          author: {
            id: "1",
            username: "alice",
            name: "Alice",
            avatar: "",
            blueVerified: false,
            verifiedType: "none",
          },
          replies: 0,
          retweets: 0,
          likes: 0,
          views: 0,
          replyTo: [],
          media: [],
          links: [],
          pinned: true,
          quote: {
            id: "11",
            conversationId: "11",
            text: "quoted",
            createdAt: "2025-11-23T12:00:00.000Z",
            author: {
              id: "2",
              username: "bob",
              name: "Bob",
              avatar: "https://pbs.twimg.com/bob.jpg",
              blueVerified: false,
              verifiedType: "none",
            },
            replies: 0,
            retweets: 0,
            likes: 0,
            views: 0,
            replyTo: [],
            media: [],
            links: [],
            pinned: false,
          },
        }],
      },
    );
    expect(html).toContain('<span class="icon-location"></span><span>Based in United States</span>');
    expect(html).toContain('href="/alice/about"');
    expect(html).toContain('<span class="icon-calendar"></span> Joined June 2009');
    expect(html).toContain('class="icon-pin"');
    expect(html).toContain('class="avatar round mini"');
    expect(html).toContain(">23 Nov 2025</a>");

    const main = renderTweet({
      id: "12",
      conversationId: "12",
      text: "main",
      createdAt: "2026-08-27T12:00:00.000Z",
      author: { id: "1", username: "alice", name: "Alice", avatar: "", blueVerified: false, verifiedType: "none" },
      replies: 1,
      retweets: 2,
      likes: 3,
      views: 4,
      replyTo: [],
      media: [],
      links: [],
      pinned: false,
    }, true);
    expect(main.indexOf("tweet-published")).toBeLessThan(main.indexOf("tweet-stats"));
  });

  it("formats recent tweet timestamps relatively", () => {
    const now = new Date("2026-08-27T15:00:00.000Z");
    expect(formatDate("2026-08-27T13:00:00.000Z", now)).toBe("2h");
    expect(formatDate("2026-08-27T14:58:00.000Z", now)).toBe("2m");
    expect(formatDate("2026-08-26T15:00:00.000Z", now)).toBe("Aug 26");
    expect(formatDate("2025-11-23T15:00:00.000Z", now)).toBe("23 Nov 2025");
  });
});
