import type { CookieSession } from "../session";
import { fetchGraphql } from "./client";
import { parseTweet, type Tweet } from "./timeline";

const GRAPH_CONVERSATION = "OZMbEnEa96AN8Pq6HyTWdw/ConversationTimeline";

export type ConversationThread = {
  tweets: Tweet[];
  hasMore: boolean;
};

export type Conversation = {
  tweet: Tweet;
  before: Tweet[];
  after: Tweet[];
  replies: ConversationThread[];
  related: ConversationThread[];
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
  const value = await fetchGraphql(GRAPH_CONVERSATION, variables, {}, session);
  try {
    return parseConversation(value, tweetId);
  } catch (error) {
    if (!cursor || !(error instanceof TweetNotFoundError)) throw error;
    // Reply pages can omit the focal post. Keep their replies and cursor,
    // fetching only the missing post from the initial conversation.
    const initial = await fetchConversation(tweetId, session);
    return parseConversation(value, tweetId, initial.tweet);
  }
}

export function parseConversation(value: unknown, tweetId: string, fallbackTweet?: Tweet): Conversation {
  const instructions = firstArray(value, [
    ["data", "timelineResponse", "instructions"],
    ["data", "timeline_response", "instructions"],
    ["data", "threaded_conversation_with_injections_v2", "instructions"],
  ]);
  let focal: Tweet | undefined = fallbackTweet;
  const before: Tweet[] = [];
  const after: Tweet[] = [];
  const replies: ConversationThread[] = [];
  const related: ConversationThread[] = [];
  let cursor: string | undefined;

  for (const instructionValue of instructions) {
    const instruction = optionalRecord(instructionValue);
    if (!instruction || typeName(instruction) !== "TimelineAddEntries") continue;
    for (const entryValue of optionalArray(instruction.entries) ?? []) {
      const entry = optionalRecord(entryValue);
      if (!entry) continue;
      const entryId = stringValue(entry.entryId) || stringValue(entry.entry_id);
      if (entryId.includes("promoted")) continue;

      if (entryId.startsWith("tweet-")) {
        const tweet = parseEntryTweet(entry);
        if (!tweet) continue;
        if (tweet.id === tweetId || entryId.endsWith(`-${tweetId}`)) focal = tweet;
        else before.push(tweet);
      } else if (entryId.startsWith("conversationthread")) {
        const thread = parseThread(entry);
        if (!thread.tweets.length) continue;
        if (thread.related) {
          related.push(thread);
        } else if (thread.self) {
          after.push(...thread.tweets);
        } else {
          replies.push(thread);
        }
      } else if (entryId.startsWith("tweetdetailrelatedtweets")) {
        const thread = parseThread(entry);
        if (thread.tweets.length) related.push(thread);
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
  hasMore: boolean;
} {
  const tweets: Tweet[] = [];
  let self = false;
  let related = false;
  let hasMore = false;
  const items = optionalArray(recordAt(entry, ["content", "items"])) ?? [];

  for (const itemValue of items) {
    const item = optionalRecord(itemValue);
    if (!item) continue;
    const entryId = stringValue(item.entryId) || stringValue(item.entry_id);
    if (entryId.includes("promoted")) continue;
    if (entryId.includes("cursor-showmore")) {
      hasMore = true;
      continue;
    }
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
  return { tweets, self, related, hasMore };
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
