import type { CookieSession } from "../session";
import { fetchGraphql } from "./client";
import { parseTweet, type Tweet } from "./timeline";

const GRAPH_CONVERSATION = "OZMbEnEa96AN8Pq6HyTWdw/ConversationTimeline";

export type Conversation = {
  tweet: Tweet;
  before: Tweet[];
  after: Tweet[];
  replies: Tweet[][];
  related: Tweet[][];
  cursor?: string;
};

export async function fetchConversation(
  tweetId: string,
  session: CookieSession,
  cursor?: string,
): Promise<Conversation> {
  const variables: Record<string, unknown> = {
    postId: tweetId,
    ranking_mode: "Relevance",
    includeHasBirdwatchNotes: false,
    includePromotedContent: false,
    withBirdwatchNotes: true,
    withVoice: false,
    withV2Timeline: true,
  };
  if (cursor) variables.cursor = cursor;
  return parseConversation(await fetchGraphql(GRAPH_CONVERSATION, variables, {}, session), tweetId);
}

export function parseConversation(value: unknown, tweetId: string): Conversation {
  const instructions = firstArray(value, [
    ["data", "timelineResponse", "instructions"],
    ["data", "timeline_response", "instructions"],
    ["data", "threaded_conversation_with_injections_v2", "instructions"],
  ]);
  let focal: Tweet | undefined;
  const before: Tweet[] = [];
  const after: Tweet[] = [];
  const replies: Tweet[][] = [];
  const related: Tweet[][] = [];
  let cursor: string | undefined;

  for (const instructionValue of instructions) {
    const instruction = optionalRecord(instructionValue);
    if (!instruction || typeName(instruction) !== "TimelineAddEntries") continue;
    for (const entryValue of optionalArray(instruction.entries) ?? []) {
      const entry = optionalRecord(entryValue);
      if (!entry) continue;
      const entryId = stringValue(entry.entryId) || stringValue(entry.entry_id);

      if (entryId.startsWith("tweet-")) {
        const tweet = parseEntryTweet(entry);
        if (!tweet) continue;
        if (tweet.id === tweetId || entryId.endsWith(`-${tweetId}`)) focal = tweet;
        else before.push(tweet);
      } else if (entryId.startsWith("conversationthread")) {
        const thread = parseThread(entry);
        if (!thread.tweets.length) continue;
        if (thread.related) {
          related.push(thread.tweets);
        } else if (thread.self) {
          after.push(...thread.tweets);
        } else {
          replies.push(thread.tweets);
        }
      } else if (entryId.startsWith("tweetdetailrelatedtweets")) {
        const thread = parseThread(entry);
        if (thread.tweets.length) related.push(thread.tweets);
      } else if (entryId.startsWith("cursor-bottom")) {
        cursor = firstString(entry, [
          ["content", "value"],
          ["content", "content", "value"],
          ["content", "itemContent", "value"],
        ]);
      }
    }
  }

  if (!focal) throw new TweetNotFoundError();
  return { tweet: focal, before, after, replies, related, cursor: cursor || undefined };
}

export class TweetNotFoundError extends Error {
  constructor() {
    super("Tweet not found");
    this.name = "TweetNotFoundError";
  }
}

function parseThread(entry: Record<string, unknown>): {
  tweets: Tweet[];
  self: boolean;
  related: boolean;
} {
  const tweets: Tweet[] = [];
  let self = false;
  let related = false;
  const items = optionalArray(recordAt(entry, ["content", "items"])) ?? [];

  for (const itemValue of items) {
    const item = optionalRecord(itemValue);
    if (!item) continue;
    if (!related) {
      related = firstString(item, [
        ["item", "client_event_info", "details", "conversation_details", "conversation_section"],
        ["item", "clientEventInfo", "details", "conversationDetails", "conversationSection"],
      ]) === "RelatedTweet";
    }
    const tweet = parseItemTweet(item);
    if (tweet) tweets.push(tweet);
    self ||= firstString(item, [
      ["item", "content", "tweet_display_type"],
      ["item", "itemContent", "tweetDisplayType"],
    ]) === "SelfThread";
  }
  return { tweets, self, related };
}

function parseEntryTweet(entry: Record<string, unknown>): Tweet | undefined {
  return parseTweetAt(entry, [
    ["content", "content", "tweet_results", "result"],
    ["content", "itemContent", "tweet_results", "result"],
    ["content", "content", "tweetResult", "result"],
  ]);
}

function parseItemTweet(item: Record<string, unknown>): Tweet | undefined {
  return parseTweetAt(item, [
    ["item", "content", "tweet_results", "result"],
    ["item", "itemContent", "tweet_results", "result"],
    ["item", "content", "tweetResult", "result"],
  ]);
}

function parseTweetAt(value: unknown, paths: string[][]): Tweet | undefined {
  for (const path of paths) {
    const result = optionalRecord(recordAt(value, path));
    if (result) return parseTweet(result);
  }
  return undefined;
}

function firstArray(value: unknown, paths: string[][]): unknown[] {
  for (const path of paths) {
    const result = optionalArray(recordAt(value, path));
    if (result) return result;
  }
  return [];
}

function firstString(value: unknown, paths: string[][]): string {
  for (const path of paths) {
    const result = stringValue(recordAt(value, path));
    if (result) return result;
  }
  return "";
}

function recordAt(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    const record = optionalRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function typeName(value: Record<string, unknown>): string {
  return stringValue(value.__typename) || stringValue(value.type);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
