import { describe, expect, it } from "vitest";
import { renderSearchPage } from "../src/render/search";
import { filterSearchTimeline, parseTimeline } from "../src/x/timeline";

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
    const html = renderSearchPage({ query: '<script>alert("x")</script>', kind: "top" }, timeline);
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
});
