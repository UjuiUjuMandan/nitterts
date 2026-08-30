import { describe, expect, it } from "vitest";
import { renderTimelineRss } from "../src/render/rss";

const profile = {
  id: "1",
  username: "alice",
  name: "Alice <&>",
  bio: "",
  bioLinks: [],
  avatar: "https://pbs.twimg.com/alice.jpg",
  banner: "",
  location: "",
  website: "",
  joinedAt: "Mon Dec 30 23:54:40 +0000 2013",
  followers: 1,
  following: 2,
  tweets: 3,
  media: 0,
  likes: 4,
  protected: false,
  blueVerified: false,
  verifiedType: "none",
  suspended: false,
};

const author = {
  id: "1",
  username: "alice",
  name: "Alice",
  avatar: "https://pbs.twimg.com/alice.jpg",
  blueVerified: false,
  verifiedType: "none",
};

function tweet(overrides = {}) {
  return {
    id: "2092329293158191570",
    conversationId: "2092329293158191570",
    text: "hello <rss> & friends",
    createdAt: "2026-08-25T17:45:00.000Z",
    author,
    replies: 0,
    retweets: 0,
    likes: 0,
    views: 0,
    replyTo: [],
    media: [{ kind: "photo", url: "https://pbs.twimg.com/media/x.jpg", preview: "", alt: "" }],
    links: [],
    pinned: false,
    ...overrides,
  };
}

describe("renderTimelineRss", () => {
  it("renders valid channel with escaped titles and CDATA descriptions", () => {
    const xml = renderTimelineRss(profile, { tweets: [tweet()] }, "https://nitter.example");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<title>Alice &lt;&amp;&gt; / @alice</title>");
    expect(xml).toContain("<atom:link href=\"https://nitter.example/alice/rss\"");
    expect(xml).toContain("https://nitter.example/pic/https%3A%2F%2Fpbs.twimg.com%2Falice.jpg");
    expect(xml).toContain("<guid isPermaLink=\"false\">2092329293158191570</guid>");
    expect(xml).toContain("Tue, 25 Aug 2026 17:45:00 GMT");
    expect(xml).toContain('<![CDATA[<p>hello &lt;rss&gt; &amp; friends</p>');
    expect(xml).not.toContain("<rss>");
  });

  it("uses permanent guid and prefix title for old pinned tweets", () => {
    const old = tweet({ id: "1176227853941268480", pinned: true, createdAt: "2019-09-23T12:00:00.000Z" });
    const xml = renderTimelineRss(profile, { tweets: [old] }, "https://nitter.example");
    expect(xml).toContain("<guid>https://nitter.example/alice/status/1176227853941268480</guid>");
    expect(xml).toContain("<title>Pinned: hello &lt;rss&gt; &amp; friends</title>");
  });

  it("escapes special characters and protects CDATA in tweet and quote text", () => {
    const hostile = tweet({ text: "a ]]> b", quote: tweet({ text: "q ]]> q" }) });
    const xml = renderTimelineRss(profile, { tweets: [hostile] }, "https://nitter.example");
    expect(xml).toContain("a ]]&gt; b");
    expect(xml).toContain("q ]]&gt; q");
  });
});
