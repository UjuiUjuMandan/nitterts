import { describe, expect, it } from "vitest";
import { renderSearchPage } from "../src/render/search";
import { filterSearchTimeline, parseSearchLists, parseSearchUsers, parseTimeline } from "../src/x/timeline";

const tweet = {
  __typename: "Tweet",
  rest_id: "100",
  legacy: {
    full_text: "hello #nim",
    created_at: "Wed Aug 26 12:00:00 +0000 2026",
    entities: { hashtags: [{ text: "nim", indices: [6, 10] }] },
  },
  core: {
    user_results: {
      result: {
        rest_id: "1",
        core: { screen_name: "alice", name: "Alice" },
        avatar: { image_url: "https://pbs.twimg.com/alice_normal.jpg" },
      },
    },
  },
};

const userResult = {
  __typename: "User",
  rest_id: "42",
  is_blue_verified: true,
  core: { screen_name: "alice", name: "Alice <Admin>", created_at: "Wed Aug 26 12:00:00 +0000 2026" },
  avatar: { image_url: "https://pbs.twimg.com/alice_normal.jpg" },
  banner: { image_url: "https://pbs.twimg.com/alice-banner.jpg" },
  location: { location: "" },
  website: { url: "" },
  profile_bio: {
    description: "visit https://t.co/x",
    entities: { description: { urls: [{ indices: [6, 20], url: "https://t.co/x", expanded_url: "https://example.com", display_url: "example.com" }] } },
  },
  relationship_counts: { followers: 10, following: 2 },
  tweet_counts: { tweets: 30, media_tweets: 4 },
  action_counts: { favorites_count: 5 },
  privacy: { protected: false },
};

describe("search", () => {
  it("parses SearchTimeline entries and cursor", () => {
    const timeline = parseTimeline({
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [{
                type: "TimelineAddEntries",
                entries: [
                  { entryId: "tweet-100", content: { itemContent: { tweet_results: { result: tweet } } } },
                  { entryId: "cursor-bottom-1", content: { value: "next-page" } },
                ],
              }],
            },
          },
        },
      },
    });
    expect(timeline.tweets[0]).toMatchObject({ id: "100", text: "hello #nim" });
    expect(timeline.tweets[0].links).toContainEqual({
      kind: "hashtag",
      start: 6,
      end: 10,
      display: "#nim",
      url: "/search?f=tweets&q=%23nim",
    });
    expect(timeline.cursor).toBe("next-page");
  });

  it("parses replacement cursors and filters escaped or protected authors", () => {
    const timeline = parseTimeline({
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [
                {
                  type: "TimelineAddEntries",
                  entries: [
                    { entryId: "tweet-100", content: { itemContent: { tweet_results: { result: tweet } } } },
                    {
                      entryId: "tweet-101",
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              ...tweet,
                              rest_id: "101",
                              core: {
                                user_results: {
                                  result: {
                                    ...tweet.core.user_results.result,
                                    core: { screen_name: "bob", name: "Bob" },
                                    privacy: { protected: true },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
                {
                  type: "TimelineReplaceEntry",
                  entry_id_to_replace: "cursor-bottom-old",
                  entry: { content: { value: "replacement-cursor" } },
                },
              ],
            },
          },
        },
      },
    });
    expect(timeline.cursor).toBe("replacement-cursor");
    expect(filterSearchTimeline(timeline).tweets.map((item) => item.id)).toEqual(["100"]);
    expect(filterSearchTimeline(timeline, "bob").tweets).toEqual([]);
    expect(filterSearchTimeline(timeline, "alice").tweets.map((item) => item.id)).toEqual(["100"]);
  });

  it("renders escaped query, tabs, tweets, and cursor", () => {
    const timeline = parseTimeline({
      data: {
        search: {
          timeline_response: {
            timeline: {
              instructions: [{
                entries: [
                  { entryId: "tweet-100", content: { itemContent: { tweet_results: { result: tweet } } } },
                  { entryId: "cursor-bottom-1", content: { value: "next-page" } },
                ],
              }],
            },
          },
        },
      },
    });
    const html = renderSearchPage({ query: '<script>alert("x")</script>', kind: "top" }, { timeline });
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain('class="tab-item active"><a href="/search?f=top');
    expect(html).toContain('class="timeline-item tweet"');
    expect(html).toContain('href="/search?f=tweets&amp;q=%23nim"');
    expect(html).toContain("cursor=next-page");
  });

  it("renders and preserves advanced search fields", () => {
    const html = renderSearchPage({
      query: "nim",
      kind: "tweets",
      since: "2026-01-01",
      until: "2026-08-27",
      minLikes: "10",
    });
    expect(html).toContain('id="search-panel-toggle" type="checkbox" checked');
    expect(html).toContain('name="since" value="2026-01-01"');
    expect(html).toContain('name="until" value="2026-08-27"');
    expect(html).toContain('name="min_faves" min="0" value="10"');
    expect(html).toContain("since=2026-01-01&amp;until=2026-08-27&amp;min_faves=10");
  });

  it("parses and renders user search entries", () => {
    const result = parseSearchUsers({
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [
                {
                  type: "TimelineAddEntries",
                  entries: [
                    { entryId: "user-42", content: { itemContent: { user_results: { result: userResult } } } },
                    { entryId: "user-42-copy", content: { itemContent: { user_results: { result: userResult } } } },
                    { entryId: "user-legacy", content: { itemContent: { user_results: { result: { rest_id: "44", legacy: { screen_name: "carol", name: "Carol", description: "Legacy", profile_image_url_https: "https://pbs.twimg.com/carol_normal.jpg" } } } } } },
                    { entryId: "user-module", content: { items: [{ item: { itemContent: { user_results: { result: { ...userResult, rest_id: "43", core: { ...userResult.core, screen_name: "bob", name: "Bob" } } } } } }] } },
                  ],
                },
                {
                  type: "TimelineReplaceEntry",
                  entry_id_to_replace: "cursor-bottom-old",
                  entry: { content: { value: "people-next" } },
                },
              ],
            },
          },
        },
      },
    });
    expect(result.users).toHaveLength(3);
    expect(result.users[0]).toMatchObject({ id: "42", username: "alice", name: "Alice <Admin>", avatar: "https://pbs.twimg.com/alice_bigger.jpg", blueVerified: true });
    expect(result.users[1]).toMatchObject({ id: "44", username: "carol", avatar: "https://pbs.twimg.com/carol_bigger.jpg" });
    expect(result.cursor).toBe("people-next");

    const html = renderSearchPage({ query: "alice", kind: "users" }, result);
    expect(html).toContain('class="tab-item active"><a href="/search?f=users');
    expect(html).toContain('class="tweet-body profile-result"');
    expect(html).toContain("Alice &lt;Admin&gt;");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("cursor=people-next");
    expect(html).not.toContain('id="search-panel-toggle"');
  });

  it("parses and renders list search modules", () => {
    const result = parseSearchLists({
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [{
                type: "TimelineAddEntries",
                entries: [
                  {
                    entryId: "list-search-0",
                    content: {
                      items: [{
                        entryId: "list-search-0-list-99",
                        item: {
                          itemContent: {
                            list: {
                              id_str: "99",
                              name: "Nim <News>",
                              description: "Updates <daily>",
                              member_count: 1234,
                              followers_context: "65 followers including @alice",
                              facepile_urls: ["https://pbs.twimg.com/alice_mini.jpg"],
                              custom_banner_media: { media_info: { original_img_url: "https://pbs.twimg.com/list-banner.jpg" } },
                              user_results: { result: userResult },
                            },
                          },
                        },
                      }],
                    },
                  },
                  { entryId: "cursor-bottom-1", content: { value: "lists-next" } },
                ],
              }],
            },
          },
        },
      },
    });
    expect(result.lists[0]).toMatchObject({ id: "99", name: "Nim <News>", members: 1234, followersContext: "65 followers including @alice" });
    expect(result.cursor).toBe("lists-next");

    const html = renderSearchPage({ query: "nim", kind: "lists" }, result);
    expect(html).not.toContain('href="/i/lists/99"');
    expect(html).toContain("Nim &lt;News&gt;");
    expect(html).toContain("1,234 members");
    expect(html).toContain('href="/alice">@alice</a>');
    expect(html).not.toContain("Updates <daily>");
    expect(html).toContain("cursor=lists-next");
  });
});
