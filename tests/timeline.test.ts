import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../src/preferences";
import { renderTweet } from "../src/render/profile";
import { parseTimeline } from "../src/x/timeline";

const wrapNote = (result: unknown) => ({
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [{ entryId: "tweet-310", content: { itemContent: { tweet_results: { result } } } }],
              },
            ],
          },
        },
      },
    },
  },
});

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

  it("strips legacy media placeholders but preserves overlapping external URLs", () => {
    const base = {
      __typename: "Tweet",
      rest_id: "403",
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
                instructions: [{
                  entries: [{ entryId: "tweet-403", content: { itemContent: { tweet_results: { result } } } }],
                }],
              },
            },
          },
        },
      },
    });
    const mediaOnly = {
      ...base,
      legacy: {
        full_text: "photo https://t.co/media",
        created_at: "Wed Aug 26 12:00:00 +0000 2026",
        extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/x.jpg", indices: [6, 24] }] },
      },
    };
    expect(parseTimeline(wrap(mediaOnly)).tweets[0].text).toBe("photo");

    const mediaWithoutIndices = {
      ...mediaOnly,
      rest_id: "405",
      legacy: {
        ...mediaOnly.legacy,
        extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/x.jpg" }] },
      },
    };
    expect(parseTimeline(wrap(mediaWithoutIndices)).tweets[0].text).toBe("photo");

    const linkedMedia = {
      ...base,
      rest_id: "404",
      details: { created_at_ms: 1748606400000, full_text: "visit https://t.co/shared" },
      media_entities: [{ indices: [6, 25] }],
      url_entities: [{ indices: [6, 25], expanded_url: "https://example.com", display_url: "example.com" }],
      legacy: { __typename: "LegacyTweet", lang: "en" },
    };
    const parsed = parseTimeline(wrap(linkedMedia)).tweets[0];
    expect(parsed.text).toBe("visit https://t.co/shared");
    expect(renderTweet(parsed)).toContain('href="https://example.com"');

    const mixedText = "pic https://t.co/media then https://t.co/link";
    const linkStart = mixedText.indexOf("https://t.co/link");
    const mediaInMiddle = {
      ...base,
      rest_id: "406",
      legacy: {
        full_text: mixedText,
        created_at: "Wed Aug 26 12:00:00 +0000 2026",
        entities: {
          urls: [{
            indices: [linkStart, mixedText.length],
            url: "https://t.co/link",
            expanded_url: "https://example.com/after",
            display_url: "example.com/after",
          }],
        },
        extended_entities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/x.jpg", indices: [4, 22] }],
        },
      },
    };
    const mixed = parseTimeline(wrap(mediaInMiddle)).tweets[0];
    expect(mixed.text).toBe("pic then https://t.co/link");
    expect(renderTweet(mixed)).toContain('href="https://example.com/after"');
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

  it("links note tweet hashtags from entity_set over truncated legacy entities", () => {
    const note = {
      __typename: "Tweet",
      rest_id: "310",
      legacy: {
        __typename: "LegacyTweet",
        lang: "en",
        full_text: "hello #world",
        entities: { hashtags: [{ text: "stale", indices: [6, 12] }] },
      },
      note_tweet: {
        note_tweet_results: {
          result: {
            text: "hello #world and more text beyond the legacy truncation point",
            entity_set: {
              hashtags: [{ text: "world", indices: [6, 12] }],
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
    const parsed = parseTimeline(wrapNote(note)).tweets[0];
    expect(renderTweet(parsed)).toContain('href="/search?f=tweets&amp;q=%23world"');
    expect(renderTweet(parsed)).not.toContain("stale");
  });

  it("links V2 details hashtag entities", () => {
    const tweet = {
      __typename: "Tweet",
      rest_id: "311",
      legacy: { __typename: "LegacyTweet", lang: "en", full_text: "hello #tag" },
      details: { hashtag_entities: [{ text: "tag", indices: [6, 10] }] },
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
    const parsed = parseTimeline(wrapNote(tweet)).tweets[0];
    expect(renderTweet(parsed)).toContain('href="/search?f=tweets&amp;q=%23tag"');
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

  it("selects HLS and MP4 variants and renders configured video and GIF playback", () => {
    const author = {
      rest_id: "1",
      core: { screen_name: "alice", name: "Alice" },
      avatar: { image_url: "https://pbs.twimg.com/alice_normal.jpg" },
    };
    const video = {
      __typename: "Tweet",
      rest_id: "400",
      legacy: { full_text: "video", created_at: "Wed Aug 26 12:00:00 +0000 2026", entities: {} },
      core: { user_results: { result: author } },
      birdwatch_pivot: {
        subtitle: {
          text: "Read details",
          entities: [{ from_index: 5, to_index: 12, ref: { url: "https://communitynotes.x.com/guide" } }],
        },
      },
      media_entities: [{ media_results: { result: { media_info: {
        __typename: "ApiVideo",
        preview_image: { original_img_url: "https://pbs.twimg.com/video.jpg" },
        alt_text: "demo video",
        variants: [
          { content_type: "application/x-mpegURL", url: "https://video.twimg.com/master.m3u8" },
          { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/low.mp4" },
          { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" },
        ],
      } } } }],
    };
    const gif = {
      __typename: "Tweet",
      rest_id: "401",
      legacy: {
        full_text: "gif",
        created_at: "Wed Aug 26 12:00:00 +0000 2026",
        entities: {},
        extended_entities: { media: [{
          type: "animated_gif",
          media_url_https: "https://pbs.twimg.com/gif.jpg",
          video_info: { variants: [{ content_type: "video/mp4", bitrate: 0, url: "https://video.twimg.com/gif.mp4" }] },
        }] },
      },
      core: { user_results: { result: author } },
    };
    const timeline = parseTimeline({ data: { search: { timeline_response: { timeline: { instructions: [{ entries: [
      { entryId: "tweet-400", content: { itemContent: { tweet_results: { result: video } } } },
      { entryId: "tweet-401", content: { itemContent: { tweet_results: { result: gif } } } },
    ] }] } } } } });
    expect(timeline.tweets[0]?.media[0]).toMatchObject({
      kind: "video",
      url: "https://video.twimg.com/high.mp4",
      hls: "https://video.twimg.com/master.m3u8",
      preview: "https://pbs.twimg.com/video.jpg",
    });
    expect(timeline.tweets[1]?.media[0]).toMatchObject({ kind: "gif", url: "https://video.twimg.com/gif.mp4" });
    const videoHtml = renderTweet(timeline.tweets[0]!, false, { ...DEFAULT_PREFERENCES, hlsPlayback: true });
    const directVideoHtml = renderTweet(timeline.tweets[0]!, false, { ...DEFAULT_PREFERENCES, proxyVideos: false });
    const gifHtml = renderTweet(timeline.tweets[1]!);
    expect(videoHtml).toContain('data-url="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fmaster.m3u8"');
    expect(videoHtml).toContain('onclick="playVideo(this)"');
    expect(videoHtml).toContain('class="community-note"');
    expect(videoHtml).toContain('href="https://communitynotes.x.com/guide"');
    expect(renderTweet(timeline.tweets[0]!, false, { ...DEFAULT_PREFERENCES, hideCommunityNotes: true })).not.toContain('class="community-note"');
    expect(directVideoHtml).toContain("<video controls playsinline");
    expect(directVideoHtml).toContain('src="https://video.twimg.com/high.mp4"');
    expect(gifHtml).toContain("<video autoplay muted loop playsinline");
  });
});
