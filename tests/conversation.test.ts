import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../src/preferences";
import { renderStatusPage } from "../src/render/status";
import { parseConversation } from "../src/x/conversation";

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

describe("parseConversation", () => {
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
    expect(conversation.replies.map((thread) => thread.map((item) => item.id))).toEqual([["4"]]);
    expect(conversation.related.map((thread) => thread.map((item) => item.id))).toEqual([["5"], ["6"]]);
    expect(conversation.cursor).toBe("next");

    const html = renderStatusPage(conversation);
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
