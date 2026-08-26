import { describe, expect, it } from "vitest";
import { renderTweet } from "../src/render/profile";
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
      url_entities: [
        { expanded_url: "https://nim.example", display_url: "nim.example", url: "https://t.co/x", indices: [7, 23] },
      ],
      mention_entities: [
        { screen_name: "bob", indices: [0, 4] },
      ],
    };    const timeline = parseTimeline({
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
    expect(timeline.tweets[0].links).toEqual([
      { kind: "mention", start: 0, end: 4, url: "/bob", display: "@bob" },
      { kind: "url", start: 7, end: 23, url: "https://nim.example", display: "nim.example" },
    ]);
  });

  it("strips media t.co placeholders from text", () => {
    const media = {
      __typename: "Tweet",
      rest_id: "400",
      legacy: { __typename: "LegacyTweet", lang: "en" },
      details: { created_at_ms: 1748606400000, full_text: "photo time https://t.co/abc" },
      media_entities: [{ indices: [11, 27] }],
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
                      { entryId: "tweet-400", content: { itemContent: { tweet_results: { result: media } } } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(timeline.tweets[0].text).toBe("photo time");
  });

  it("strips media t.co placeholders with astral emoji offsets", () => {
    const media = {
      __typename: "Tweet",
      rest_id: "401",
      legacy: { __typename: "LegacyTweet", lang: "en" },
      details: { created_at_ms: 1748606400000, full_text: "Martian 👽 🚀 https://t.co/BM2xp00JR2" },
      media_entities: [{ indices: [12, 35] }],
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
    const wrap = (result) => ({
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [{ entryId: "tweet-401", content: { itemContent: { tweet_results: { result } } } }],
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(parseTimeline(wrap(media)).tweets[0].text).toBe("Martian 👽 🚀");

    const linkTweet = {
      ...media,
      rest_id: "402",
      media_entities: [],
      url_entities: [
        { expanded_url: "https://example.com/x", display_url: "example.com/x", url: "https://t.co/BM2xp00JR2", indices: [12, 35] },
      ],
    };
    const parsed = parseTimeline(wrap(linkTweet)).tweets[0];
    expect(parsed.text).toBe("Martian 👽 🚀 https://t.co/BM2xp00JR2");
    expect(renderTweet(parsed)).toContain('href="https://example.com/x"');
    expect(renderTweet(parsed)).not.toContain("JR2<");
  });

  it("parses note tweet entity_set links", () => {
    const note = {
      __typename: "Tweet",
      rest_id: "300",
      legacy: { __typename: "LegacyTweet", lang: "en" },
      note_tweet: {
        note_tweet_results: {
          result: {
            text: "long text with a link inside",
            entity_set: {
              urls: [{ expanded_url: "https://note.example", url: "https://t.co/n", indices: [17, 22] }],
            },
          },
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
                      { entryId: "tweet-300", content: { itemContent: { tweet_results: { result: note } } } },
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
      id: "300",
      text: "long text with a link inside",
      links: [{ kind: "url", start: 17, end: 22, url: "https://note.example" }],
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
