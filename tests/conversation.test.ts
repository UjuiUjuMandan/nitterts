import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieSession } from "../src/session";
import { DEFAULT_PREFERENCES } from "../src/preferences";
import { renderStatusPage } from "../src/render/status";
import { fetchConversation, parseConversation, TweetNotFoundError } from "../src/x/conversation";
import { fetchGraphql } from "../src/x/client";

vi.mock("../src/x/client", () => ({ fetchGraphql: vi.fn() }));

function tweet(id: string, username: string, text: string) {
  return {
    __typename: "Tweet",
    rest_id: id,
    legacy: {
      conversation_id_str: "2",
      full_text: text,
      created_at: "Wed Aug 26 12:00:00 +0000 2026",
      reply_count: 1,
      retweet_count: 2,
      favorite_count: 3,
    },
    core: {
      user_results: {
        result: {
          rest_id: `user-${id}`,
          core: { screen_name: username, name: username.toUpperCase() },
          avatar: { image_url: `https://pbs.twimg.com/${username}_normal.jpg` },
        },
      },
    },
  };
}

function tweetEntry(id: string, username: string, text: string) {
  return {
    entryId: `tweet-${id}`,
    content: { itemContent: { tweet_results: { result: tweet(id, username, text) } } },
  };
}

function threadEntry(id: string, username: string, text: string, self = false, related = false) {
  return {
    entryId: `conversationthread-${id}`,
    content: {
      items: [
        {
          entryId: `tweet-${id}`,
          item: {
            itemContent: {
              tweet_results: { result: tweet(id, username, text) },
              ...(self ? { tweetDisplayType: "SelfThread" } : {}),
            },
            ...(related ? { client_event_info: { details: { conversation_details: { conversation_section: "RelatedTweet" } } } } : {}),
          },
        },
      ],
    },
  };
}

function response(entries: unknown[]) {
  return { data: { timelineResponse: { instructions: [{ type: "TimelineAddEntries", entries }] } } };
}

describe("fetchConversation pagination", () => {
  const session = {} as CookieSession;

  beforeEach(() => vi.resetAllMocks());

  it("loads the focal post separately when a reply page omits it", async () => {
    vi.mocked(fetchGraphql)
      .mockResolvedValueOnce(response([
        threadEntry("4", "bob", "next page reply"),
        { entryId: "cursor-bottom-0", content: { value: "next+cursor/=" } },
      ]))
      .mockResolvedValueOnce(response([
        tweetEntry("2", "alice", "main"),
        threadEntry("3", "carol", "first page reply"),
        { entryId: "cursor-bottom-0", content: { value: "old" } },
      ]));

    const conversation = await fetchConversation("2", session, "current");
    expect(conversation.tweet.id).toBe("2");
    expect(conversation.replies.map((thread) => thread.tweets.map((item) => item.id))).toEqual([["4"]]);
    expect(conversation.cursor).toBe("next+cursor/=");
    expect(fetchGraphql).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchGraphql).mock.calls[0][1]).toMatchObject({ postId: "2", cursor: "current" });
    expect(vi.mocked(fetchGraphql).mock.calls[1][1]).not.toHaveProperty("cursor");
    expect(renderStatusPage(conversation)).toContain("?cursor=next%2Bcursor%2F%3D#r");
  });

  it("does not refetch a focal post already included in a reply page", async () => {
    vi.mocked(fetchGraphql).mockResolvedValueOnce(response([tweetEntry("2", "alice", "main")]));
    expect((await fetchConversation("2", session, "current")).tweet.id).toBe("2");
    expect(fetchGraphql).toHaveBeenCalledTimes(1);
  });

  it("accepts an exhausted reply page without showing first-page replies again", async () => {
    vi.mocked(fetchGraphql)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([tweetEntry("2", "alice", "main"), threadEntry("3", "bob", "old")]));
    const conversation = await fetchConversation("2", session, "current");
    expect(conversation.replies).toEqual([]);
    expect(conversation.cursor).toBeUndefined();
    expect(renderStatusPage(conversation)).not.toContain("Load more");
  });

  it("still rejects a missing focal post on the first page", async () => {
    vi.mocked(fetchGraphql).mockResolvedValueOnce(response([]));
    await expect(fetchConversation("2", session)).rejects.toBeInstanceOf(TweetNotFoundError);
    expect(fetchGraphql).toHaveBeenCalledTimes(1);
  });

  it("still rejects pagination when the focal post no longer exists", async () => {
    vi.mocked(fetchGraphql).mockResolvedValue(response([]));
    await expect(fetchConversation("2", session, "current")).rejects.toBeInstanceOf(TweetNotFoundError);
    expect(fetchGraphql).toHaveBeenCalledTimes(2);
  });
});

describe("parseConversation", () => {
  it.each(["entryId", "entry_id"])("preserves thread continuation markers using %s", (idKey) => {
    const thread = threadEntry("3", "bob", "first reply");
    const last = threadEntry("4", "alice", "Not sure. I went to public schools.");
    const conversation = parseConversation(response([
      tweetEntry("2", "alice", "main"),
      {
        ...thread,
        content: {
          items: [
            ...thread.content.items,
            ...last.content.items,
            { [idKey]: "conversationthread-3-cursor-showmore-0", item: { content: { value: "thread-cursor" } } },
          ],
        },
      },
      threadEntry("5", "carol", "complete thread"),
    ]), "2");

    expect(conversation.replies[0].hasMore).toBe(true);
    expect(conversation.replies[0].tweets.map((item) => item.id)).toEqual(["3", "4"]);
    expect(conversation.replies[1].hasMore).toBe(false);
    // Thread continuation must not become the whole conversation's next page.
    expect(conversation.cursor).toBeUndefined();
    const html = renderStatusPage(conversation);
    expect(html).toContain('<div class="timeline-item more-replies"><a class="more-replies-text" href="/alice/status/4#m">more replies</a></div>');
    expect(html.match(/class="more-replies-text"/g)).toHaveLength(1);
    const threads = html.split('<div class="reply thread thread-line">');
    expect(threads[1]).not.toContain("thread-last");
    expect(threads[2]).toContain("thread-last");
    expect(renderStatusPage(conversation, { ...DEFAULT_PREFERENCES, hideReplies: true }))
      .not.toContain("more-replies-text");
  });

  it("separates ancestors, focal post, self-thread posts, and replies", () => {
    const conversation = parseConversation(
      {
        data: {
          timelineResponse: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  tweetEntry("1", "parent", "before"),
                  tweetEntry("2", "alice", "<main>"),
                  threadEntry("3", "alice", "after", true),
                  threadEntry("4", "bob", "reply"),
                  {
                    ...threadEntry("5", "carol", "related", false, true),
                    entryId: "tweetdetailrelatedtweets-5",
                  },
                  threadEntry("6", "dave", "related too", false, true),
                  { entryId: "cursor-bottom-0", content: { value: "next" } },
                ],
              },
            ],
          },
        },
      },
      "2",
    );

    expect(conversation.tweet).toMatchObject({ id: "2", text: "<main>" });
    expect(conversation.before.map((item) => item.id)).toEqual(["1"]);
    expect(conversation.after.map((item) => item.id)).toEqual(["3"]);
    expect(conversation.replies.map((thread) => thread.tweets.map((item) => item.id))).toEqual([["4"]]);
    expect(conversation.related.map((thread) => thread.tweets.map((item) => item.id))).toEqual([["5"], ["6"]]);
    expect(conversation.cursor).toBe("next");

    const paginatedHtml = renderStatusPage(conversation, DEFAULT_PREFERENCES, "current");
    expect(paginatedHtml).toContain('<div class="timeline-item show-more"><a href="/alice/status/2#r">Load newest</a></div>');
    expect(paginatedHtml.indexOf("Load newest")).toBeLessThan(paginatedHtml.indexOf('class="reply-sort"'));
    expect(renderStatusPage({ ...conversation, replies: [], cursor: undefined }, DEFAULT_PREFERENCES, "last"))
      .toContain('href="/alice/status/2#r">Load newest</a>');
    expect(renderStatusPage(conversation, { ...DEFAULT_PREFERENCES, hideReplies: true }, "current"))
      .not.toContain("Load newest");

    const html = renderStatusPage(conversation);
    expect(html).not.toContain("Load newest");
    expect(html).not.toContain("more-replies-text");
    expect(html).toContain('class="conversation"');
    expect(html).toContain('class="reply thread thread-line"');
    expect(html).toContain('/alice/status/2?cursor=next#r');
    expect(html).toContain('class="main-tweet thread-line"');
    expect(html).toContain('class="replies"');
    expect(html).toContain("&lt;main&gt;");
    expect(html).not.toContain("<main></main>");
    expect(html).not.toContain("related-tweets");

    const withRelated = renderStatusPage(conversation, { ...DEFAULT_PREFERENCES, hideRelated: false });
    expect(withRelated).toContain('class="related-tweets"');
    expect(withRelated).toContain("Related tweets");
    expect(withRelated).toContain("related too");
  });
});
