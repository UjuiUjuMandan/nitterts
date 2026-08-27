import type { CookieSession } from "../session";
import { fetchGraphql } from "./client";

const GRAPH_USER_TWEETS = "LE3eTyeqhBh2g-fX85O2eQ/UserWithProfileTweetsQueryV2";
const GRAPH_USER_REPLIES = "qUpkZU6eN8MbtQb7rC_pYg/UserTweetsAndReplies";
const GRAPH_USER_MEDIA = "WK111rbR0vM0ZX4lyZCYjw/MediaTimelineV2";
const GRAPH_SEARCH = "hyPfJYJ_XAtDYoslQc-Rgg/SearchTimeline";
const FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
};

export type ProfileTab = "tweets" | "replies" | "media";

export type VerifiedType = "none" | "blue" | "business" | "government";

export type TweetAuthor = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  blueVerified: boolean;
  verifiedType: VerifiedType;
  protected?: boolean;
};

export type TweetMedia = {
  kind: "photo" | "video" | "gif";
  url: string;
  preview: string;
  alt: string;
};

export type TweetLink = {
  kind: "url" | "mention" | "hashtag" | "cashtag";
  start: number;
  end: number;
  display: string;
  url: string;
};

export type Tweet = {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
  author: TweetAuthor;
  replies: number;
  retweets: number;
  likes: number;
  views: number;
  replyTo: string[];
  media: TweetMedia[];
  links: TweetLink[];
  retweet?: Tweet;
  quote?: Tweet;
  pinned: boolean;
};

export type Timeline = {
  tweets: Tweet[];
  pinned?: Tweet;
  cursor?: string;
};

export type SearchKind = "top" | "tweets" | "media";

export type PhotoRailItem = {
  url: string;
  tweetId: string;
};

export function photoRail(timeline: Timeline, limit = 16): PhotoRailItem[] {
  const items: PhotoRailItem[] = [];
  const seen = new Set<string>();
  for (const tweet of timeline.tweets) {
    for (const medium of tweet.media) {
      const url = medium.kind === "photo" ? medium.url : medium.preview;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({ url, tweetId: tweet.id });
      if (items.length >= limit) return items;
    }
  }
  return items;
}

export async function fetchProfileTimeline(
  tab: ProfileTab,
  userId: string,
  session: CookieSession,
  cursor?: string,
): Promise<Timeline> {
  const operation =
    tab === "replies" ? GRAPH_USER_REPLIES : tab === "media" ? GRAPH_USER_MEDIA : GRAPH_USER_TWEETS;
  const variables: Record<string, unknown> =
    tab === "replies"
      ? {
          userId,
          count: 20,
          includePromotedContent: false,
          withCommunity: true,
          withVoice: true,
          ...(cursor ? { cursor } : {}),
        }
      : { rest_id: userId, count: tab === "media" ? 100 : 20, ...(cursor ? { cursor } : {}) };

  return parseTimeline(
    await fetchGraphql(operation, variables, FIELD_TOGGLES, session),
  );
}

export async function fetchSearchTimeline(
  query: string,
  kind: SearchKind,
  session: CookieSession,
  cursor?: string,
): Promise<Timeline> {
  const variables: Record<string, unknown> = {
    rawQuery: query,
    count: 20,
    querySource: "typed_query",
    product: kind === "top" ? "Top" : kind === "media" ? "Media" : "Latest",
    withGrokTranslatedBio: true,
    withQuickPromoteEligibilityTweetFields: false,
    ...(cursor ? { cursor } : {}),
  };
  const timeline = filterSearchTimeline(
    parseTimeline(await fetchGraphql(GRAPH_SEARCH, variables, FIELD_TOGGLES, session)),
  );
  if (cursor && timeline.cursor?.slice(0, 64) === cursor.slice(0, 64)) {
    return { tweets: [] };
  }
  return timeline;
}

export function filterSearchTimeline(timeline: Timeline, username?: string): Timeline {
  const expected = username?.toLowerCase();
  const tweets = timeline.tweets.flatMap((tweet) => {
    if (expected && tweet.author.username.toLowerCase() !== expected) return [];
    const safe = sanitizeTweet(tweet);
    return safe ? [safe] : [];
  });
  const pinned = timeline.pinned && (!expected || timeline.pinned.author.username.toLowerCase() === expected)
    ? sanitizeTweet(timeline.pinned)
    : undefined;
  return { ...timeline, tweets, ...(pinned ? { pinned } : { pinned: undefined }) };
}

export function parseTimeline(value: unknown): Timeline {
  const instructions = firstArray(value, [
    ["data", "user", "result", "timeline", "timeline", "instructions"],
    ["data", "user_result", "result", "timeline_response", "timeline", "instructions"],
    ["data", "search", "timeline_response", "timeline", "instructions"],
    ["data", "search_by_raw_query", "search_timeline", "timeline", "instructions"],
  ]);
  const timeline: Timeline = { tweets: [] };
  const seen = new Set<string>();

  for (const instructionValue of instructions) {
    const instruction = optionalRecord(instructionValue);
    if (!instruction) continue;

    const entries = optionalArray(instruction.entries);
    if (entries) {
      for (const entry of entries) {
        const record = optionalRecord(entry);
        if (!record) continue;
        const entryId = stringValue(record.entryId) || stringValue(record.entry_id);
        if (entryId.startsWith("cursor-bottom")) {
          timeline.cursor = stringValue(recordAt(record, ["content", "value"]));
          continue;
        }
        for (const tweet of extractTweets(record)) addTweet(timeline.tweets, seen, tweet);
      }
    }

    const moduleItems = optionalArray(instruction.moduleItems);
    if (moduleItems) {
      for (const item of moduleItems) {
        const record = optionalRecord(item);
        if (!record) continue;
        for (const tweet of extractTweetsFromItem(record)) addTweet(timeline.tweets, seen, tweet);
      }
    }

    if (typeName(instruction) === "TimelineReplaceEntry") {
      const replacedId = stringValue(instruction.entry_id_to_replace) || stringValue(instruction.entryIdToReplace);
      const entry = optionalRecord(instruction.entry);
      if (replacedId.startsWith("cursor-bottom") && entry) {
        timeline.cursor = stringValue(recordAt(entry, ["content", "value"]));
      }
    }

    if (typeName(instruction) === "TimelinePinEntry") {
      const entry = optionalRecord(instruction.entry);
      const pinned = entry ? extractTweets(entry)[0] : undefined;
      if (pinned) timeline.pinned = { ...pinned, pinned: true };
    }
  }

  return timeline;
}

function sanitizeTweet(tweet: Tweet): Tweet | undefined {
  if (tweet.author.protected) return undefined;
  const retweet = tweet.retweet ? sanitizeTweet(tweet.retweet) : undefined;
  if (tweet.retweet && !retweet) return undefined;
  const quote = tweet.quote ? sanitizeTweet(tweet.quote) : undefined;
  return { ...tweet, retweet, quote };
}

function extractTweets(entry: Record<string, unknown>): Tweet[] {
  const direct = firstRecord(entry, [
    ["content", "content", "tweet_results", "result"],
    ["content", "itemContent", "tweet_results", "result"],
    ["content", "item_content", "tweet_results", "result"],
    ["content", "content", "tweetResult", "result"],
  ]);
  if (direct) {
    const tweet = parseTweet(direct);
    return tweet ? [tweet] : [];
  }

  const items = firstArray(entry, [["content", "items"]]);
  return items.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? extractTweetsFromItem(record) : [];
  });
}

function extractTweetsFromItem(item: Record<string, unknown>): Tweet[] {
  const result = firstRecord(item, [
    ["item", "itemContent", "tweet_results", "result"],
    ["item", "item_content", "tweet_results", "result"],
    ["item", "content", "tweet_results", "result"],
    ["item", "content", "tweetResult", "result"],
  ]);
  const tweet = result ? parseTweet(result) : undefined;
  return tweet ? [tweet] : [];
}

export function parseTweet(value: Record<string, unknown>, depth = 0): Tweet | undefined {
  if (depth > 2) return undefined;
  if (typeName(value) === "TweetWithVisibilityResults") {
    const inner = optionalRecord(value.tweet);
    return inner ? parseTweet(inner, depth + 1) : undefined;
  }
  if (["TweetUnavailable", "TweetTombstone", "TweetPreviewDisplay"].includes(typeName(value))) {
    return undefined;
  }

  const legacy = optionalRecord(value.legacy);
  const details = optionalRecord(value.details);
  const id = stringValue(value.rest_id) || stringValue(legacy?.id_str);
  if (!id) return undefined;

  const core = optionalRecord(value.core);
  const authorResult = core
    ? firstRecord(core, [
        ["user_results", "result"],
        ["user_result", "result"],
      ]) ?? core
    : undefined;
  const author = parseAuthor(authorResult);
  const counts = optionalRecord(value.counts);
  const noteText = stringValue(
    recordAt(value, ["note_tweet", "note_tweet_results", "result", "text"]),
  );
  const createdAtMs = numberValue(details?.created_at_ms, Number(stringValue(details?.created_at_ms)) || undefined);
  const createdAt = createdAtMs
    ? new Date(createdAtMs).toISOString()
    : stringValue(legacy?.created_at);

  const rawText = noteText || stringValue(details?.full_text) || stringValue(legacy?.full_text);
  const mediaRanges = (optionalArray(value.media_entities) ?? [])
    .map(optionalRecord)
    .filter((entity): entity is Record<string, unknown> => Boolean(entity))
    .map((entity) => optionalArray(entity.indices))
    .filter((indices): indices is unknown[] => Boolean(indices))
    .map((indices) => ({ start: numberValue(indices[0]), end: numberValue(indices[1]) }))
    .filter((range) => range.end > range.start);
  const text = stripRanges(rawText, mediaRanges);

  const tweet: Tweet = {
    id,
    conversationId: stringValue(legacy?.conversation_id_str) || id,
    text,
    createdAt,
    author,
    replies: numberValue(counts?.reply_count, legacy?.reply_count),
    retweets: numberValue(counts?.retweet_count, legacy?.retweet_count),
    likes: numberValue(counts?.favorite_count, legacy?.favorite_count),
    views: Number(stringValue(recordAt(value, ["views", "count"]))) || 0,
    replyTo: collectReplyUsers(value, legacy),
    media: parseMedia(value, legacy),
    links: parseLinks(value, legacy),
    pinned: false,
  };


  const retweetResult = firstRecord(value, [
    ["legacy", "retweeted_status_result", "result"],
    ["legacy", "repostedStatusResults", "result"],
    ["repostedStatusResults", "result"],
  ]);
  if (retweetResult) tweet.retweet = parseTweet(retweetResult, depth + 1);

  const quoteResult = firstRecord(value, [
    ["quoted_status_result", "result"],
    ["quotedPostResults", "result"],
  ]);
  if (quoteResult) tweet.quote = parseTweet(quoteResult, depth + 1);

  return tweet;
}

function parseAuthor(value: Record<string, unknown> | undefined): TweetAuthor {
  const legacy = optionalRecord(value?.legacy);
  const core = optionalRecord(value?.core);
  const avatar = optionalRecord(value?.avatar);
  const privacy = optionalRecord(value?.privacy);
  const verifiedType = parseVerifiedType(
    stringValue(optionalRecord(value?.verification)?.verified_type),
    value?.is_blue_verified === true || optionalRecord(value?.verification)?.is_blue_verified === true,
  );
  return {
    id: stringValue(value?.rest_id) || stringValue(legacy?.id_str),
    username: stringValue(core?.screen_name) || stringValue(legacy?.screen_name),
    name: stringValue(core?.name) || stringValue(legacy?.name),
    avatar: (stringValue(avatar?.image_url) || stringValue(legacy?.profile_image_url_https)).replace(
      "_normal",
      "",
    ),
    blueVerified: verifiedType !== "none",
    verifiedType,
    protected: value?.protected === true || privacy?.protected === true || legacy?.protected === true,
  };
}

function parseVerifiedType(value: string, blue: boolean): VerifiedType {
  if (value === "Business") return "business";
  if (value === "Government") return "government";
  return blue ? "blue" : "none";
}

function collectReplyUsers(
  value: Record<string, unknown>,
  legacy: Record<string, unknown> | undefined,
): string[] {
  const modern = stringValue(
    recordAt(value, ["reply_to_user_results", "result", "core", "screen_name"]),
  );
  const legacyName = stringValue(legacy?.in_reply_to_screen_name);
  return [modern || legacyName].filter(Boolean);
}

function parseMedia(
  value: Record<string, unknown>,
  legacy: Record<string, unknown> | undefined,
): TweetMedia[] {
  const modern = optionalArray(value.media_entities);
  if (modern?.length) {
    return modern.flatMap((item) => parseModernMedia(optionalRecord(item)));
  }

  const legacyMedia = optionalArray(recordAt(legacy, ["extended_entities", "media"]));
  return legacyMedia?.flatMap((item) => parseLegacyMedia(optionalRecord(item))) ?? [];
}

function parseModernMedia(entity: Record<string, unknown> | undefined): TweetMedia[] {
  const result = optionalRecord(recordAt(entity, ["media_results", "result"]));
  const info = optionalRecord(result?.media_info);
  if (!info) return [];
  const kind = typeName(info);
  if (kind === "ApiImage") {
    return [{ kind: "photo", url: stringValue(info.original_img_url), preview: "", alt: stringValue(info.alt_text) }];
  }
  const variants = optionalArray(info.variants);
  const url = bestVideoUrl(variants);
  if (kind === "ApiVideo" || kind === "ApiGif") {
    return [{
      kind: kind === "ApiGif" ? "gif" : "video",
      url,
      preview: stringValue(recordAt(info, ["preview_image", "original_img_url"])),
      alt: stringValue(info.alt_text),
    }];
  }
  return [];
}

function parseLegacyMedia(entity: Record<string, unknown> | undefined): TweetMedia[] {
  if (!entity) return [];
  const kind = typeName(entity);
  const preview = stringValue(entity.media_url_https);
  if (kind === "photo") {
    return [{ kind: "photo", url: preview, preview: "", alt: stringValue(entity.ext_alt_text) }];
  }
  if (kind === "video" || kind === "animated_gif") {
    return [{
      kind: kind === "animated_gif" ? "gif" : "video",
      url: bestVideoUrl(optionalArray(recordAt(entity, ["video_info", "variants"]))),
      preview,
      alt: stringValue(entity.ext_alt_text),
    }];
  }
  return [];
}

function bestVideoUrl(variants: unknown[] | undefined): string {
  return (variants ?? [])
    .map(optionalRecord)
    .filter((variant): variant is Record<string, unknown> => Boolean(variant))
    .filter((variant) => stringValue(variant.content_type || variant.type).includes("mp4"))
    .sort((a, b) => numberValue(b.bit_rate, b.bitrate) - numberValue(a.bit_rate, a.bitrate))
    .map((variant) => stringValue(variant.url))
    .find(Boolean) ?? "";
}

function parseLinks(
  value: Record<string, unknown>,
  legacy: Record<string, unknown> | undefined,
): TweetLink[] {
  const links: TweetLink[] = [];
  const push = (kind: TweetLink["kind"], entity: Record<string, unknown> | undefined, url: string, display?: string) => {
    if (!entity) return;
    const range = optionalArray(entity.indices) ?? [];
    const start = numberValue(range[0]);
    const end = numberValue(range[1]);
    if (end <= start || !url) return;
    links.push({ kind, start, end, url, display: display || "" });
  };

  for (const entity of optionalArray(value.url_entities) ?? []) {
    const record = optionalRecord(entity);
    if (!record) continue;
    push("url", record, stringValue(record.expanded_url) || stringValue(record.url), stringValue(record.display_url));
  }
  for (const entity of optionalArray(value.hashtag_entities) ?? []) {
    const record = optionalRecord(entity);
    if (!record) continue;
    const text = stringValue(record.text);
    push("hashtag", record, `/search?f=tweets&q=%23${encodeURIComponent(text)}`, `#${text}`);
  }
  for (const entity of optionalArray(value.cashtag_entities) ?? []) {
    const record = optionalRecord(entity);
    if (!record) continue;
    const text = stringValue(record.text);
    push("cashtag", record, `/search?f=tweets&q=%24${encodeURIComponent(text)}`, `$${text}`);
  }
  for (const entity of optionalArray(value.mention_entities) ?? []) {
    const record = optionalRecord(entity);
    if (!record) continue;
    const screenName = stringValue(record.screen_name);
    push("mention", record, `/${screenName}`, `@${screenName}`);
  }

  const legacyEntities = optionalRecord(legacy?.entities)
    ?? optionalRecord(recordAt(value, ["note_tweet", "note_tweet_results", "result", "entity_set"]));
  if (legacyEntities) {
    for (const entity of optionalArray(legacyEntities.urls) ?? []) {
      const record = optionalRecord(entity);
      if (!record) continue;
      push("url", record, stringValue(record.expanded_url) || stringValue(record.url), stringValue(record.display_url));
    }
    for (const entity of optionalArray(legacyEntities.hashtags) ?? []) {
      const record = optionalRecord(entity);
      if (!record) continue;
      const text = stringValue(record.text);
      push("hashtag", record, `/search?f=tweets&q=%23${encodeURIComponent(text)}`, `#${text}`);
    }
    for (const entity of optionalArray(legacyEntities.symbols) ?? []) {
      const record = optionalRecord(entity);
      if (!record) continue;
      const text = stringValue(record.text);
      push("cashtag", record, `/search?f=tweets&q=%24${encodeURIComponent(text)}`, `$${text}`);
    }
    for (const entity of optionalArray(legacyEntities.user_mentions) ?? []) {
      const record = optionalRecord(entity);
      if (!record) continue;
      const screenName = stringValue(record.screen_name);
      push("mention", record, `/${screenName}`, `@${screenName}`);
    }
  }

  return links.sort((a, b) => a.start - b.start);
}

function stripRanges(text: string, ranges: { start: number; end: number }[]): string {
  if (!ranges.length || !text) return text;
  const units = [...text];
  const ordered = [...ranges]
    .filter((range) => range.end <= units.length && range.start >= 0)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let result = "";
  let cursor = 0;
  for (const range of ordered) {
    if (range.start < cursor) continue;
    result += units.slice(cursor, range.start).join("");
    cursor = range.end;
    const after = units[cursor];
    if (after === " " || after === "\n") cursor += 1;
  }
  return (result + units.slice(cursor).join("")).trimEnd();
}

function addTweet(tweets: Tweet[], seen: Set<string>, tweet: Tweet): void {
  if (seen.has(tweet.id)) return;
  seen.add(tweet.id);
  tweets.push(tweet);
}

function firstRecord(value: unknown, paths: string[][]): Record<string, unknown> | undefined {
  for (const path of paths) {
    const result = optionalRecord(recordAt(value, path));
    if (result) return result;
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

function numberValue(...values: unknown[]): number {
  return values.find((value) => typeof value === "number") as number | undefined ?? 0;
}
