import { describe, expect, it } from "vitest";
import { parseTimeline } from "../src/x/timeline";

describe("parseTimeline", () => {
  it("parses numeric created_at_ms from modern tweet details", () => {
    const modern = {
      __typename: "Tweet",
      rest_id: "200",
      legacy: { __typename: "LegacyTweet", lang: "en" },
      details: { created_at_ms: 1748606400000, full_text: "modern" },
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
    const timeline = parseTimeline({
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [
                      {
                        entryId: "tweet-200",
                        content: { itemContent: { tweet_results: { result: modern } } },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(timeline.tweets[0]).toMatchObject({
      id: "200",
      text: "modern",
      createdAt: new Date(1748606400000).toISOString(),
    });
  });

  it("parses tweet entries, pins, media, and the bottom cursor", () => {
    const tweet = {
      __typename: "Tweet",
      rest_id: "100",
      legacy: {
        conversation_id_str: "100",
        full_text: "hello timeline",
        created_at: "Wed Aug 26 12:00:00 +0000 2026",
        reply_count: 2,
        retweet_count: 3,
        favorite_count: 4,
        extended_entities: {
          media: [
            {
              type: "photo",
              media_url_https: "https://pbs.twimg.com/media/test.jpg",
              ext_alt_text: "test image",
            },
          ],
        },
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
      views: { count: "5" },
    };
    const entry = {
      entryId: "tweet-100",
      content: { itemContent: { tweet_results: { result: tweet } } },
    };
    const timeline = parseTimeline({
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [
                      entry,
                      { entryId: "cursor-bottom-1", content: { value: "next-page" } },
                    ],
                  },
                  { type: "TimelinePinEntry", entry },
                ],
              },
            },
          },
        },
      },
    });

    expect(timeline.cursor).toBe("next-page");
    expect(timeline.pinned).toMatchObject({ id: "100", pinned: true });
    expect(timeline.tweets[0]).toMatchObject({
      id: "100",
      text: "hello timeline",
      author: { username: "alice", avatar: "https://pbs.twimg.com/alice.jpg" },
      replies: 2,
      retweets: 3,
      likes: 4,
      views: 5,
      media: [{ kind: "photo", url: "https://pbs.twimg.com/media/test.jpg" }],
    });
  });
});
