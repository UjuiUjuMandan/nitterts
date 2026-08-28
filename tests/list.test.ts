import { describe, expect, it } from "vitest";
import { renderListPage } from "../src/render/list";
import { renderListRss } from "../src/render/rss";
import { ListNotFoundError, parseList, parseListMembers } from "../src/x/list";
import { parseTimeline } from "../src/x/timeline";

const user = {
  rest_id: "1",
  core: { screen_name: "alice", name: "Alice", created_at: "Mon Dec 30 23:54:40 +0000 2013" },
  avatar: { image_url: "https://pbs.twimg.com/alice_normal.jpg" },
  banner: { image_url: "" },
  location: { location: "" },
  website: { url: "" },
  profile_bio: { description: "hello", entities: { description: {} } },
  relationship_counts: { followers: 10, following: 5 },
  tweet_counts: { tweets: 20, media_tweets: 2 },
  action_counts: { favorites_count: 3 },
  privacy: { protected: false },
};

const tweet = {
  __typename: "Tweet",
  rest_id: "100",
  legacy: {
    full_text: "list post",
    created_at: "Wed Aug 26 12:00:00 +0000 2026",
    conversation_id_str: "100",
    entities: {},
  },
  core: { user_result: { result: user } },
};

describe("lists", () => {
  it("parses list metadata and rejects missing lists", () => {
    const list = parseList({ data: { list: {
      id_str: "99",
      name: "News <Today>",
      description: "Daily & nightly",
      member_count: 12,
      custom_banner_media: { media_info: { original_img_url: "https://pbs.twimg.com/list.jpg" } },
      user_results: { result: user },
    } } });
    expect(list).toMatchObject({ id: "99", name: "News <Today>", members: 12, owner: { username: "alice" } });
    expect(() => parseList({ data: { list: null } })).toThrow(ListNotFoundError);
  });

  it("parses list timelines, members, and cursors", () => {
    const timeline = parseTimeline({ data: { list: { timeline_response: { timeline: { instructions: [{
      type: "TimelineAddEntries",
      entries: [
        { entryId: "tweet-100", content: { content: { tweetResult: { result: tweet } } } },
        { entryId: "cursor-bottom-1", content: { value: "tweet-next" } },
      ],
    }] } } } } });
    expect(timeline.tweets[0]).toMatchObject({ id: "100", text: "list post" });
    expect(timeline.cursor).toBe("tweet-next");

    const members = parseListMembers({ data: { list: { members_timeline: { timeline: { instructions: [{
      entries: [
        { entryId: "user-1", content: { itemContent: { user_results: { result: user } } } },
        { entryId: "cursor-bottom-1", content: { cursorType: "Bottom", value: "member-next" } },
      ],
    }] } } } } });
    expect(members.users[0]).toMatchObject({ id: "1", username: "alice", avatar: "https://pbs.twimg.com/alice_bigger.jpg" });
    expect(members.cursor).toBe("member-next");
  });

  it("renders escaped tweet/member pages and list RSS", () => {
    const list = parseList({ data: { list: {
      id_str: "99",
      name: "News <Today>",
      description: "Daily & nightly",
      member_count: 12,
      user_results: { result: user },
    } } });
    const timeline = parseTimeline({ data: { list: { timeline_response: { timeline: { instructions: [{ entries: [
      { entryId: "tweet-100", content: { content: { tweetResult: { result: tweet } } } },
    ] }] } } } } });
    const tweetsHtml = renderListPage(list, "tweets", { ...timeline, cursor: "next" });
    const membersHtml = renderListPage(list, "members", undefined, { users: [list.owner] });
    expect(tweetsHtml).toContain("News &lt;Today&gt;");
    expect(tweetsHtml).not.toContain("Daily & nightly");
    expect(tweetsHtml).toContain('class="tab-item active"><a href="/i/lists/99">Tweets</a>');
    expect(tweetsHtml).toContain("cursor=next");
    expect(membersHtml).toContain('class="tab-item active"><a href="/i/lists/99/members">Members</a>');
    expect(membersHtml).toContain('class="tweet-body profile-result"');

    const rss = renderListRss(list, timeline, "https://nitter.example");
    expect(rss).toContain("<title>News &lt;Today&gt; / @alice</title>");
    expect(rss).toContain('href="https://nitter.example/i/lists/99/rss"');
    expect(rss).toContain("<description>News &lt;Today&gt; by @alice</description>");
  });
});
