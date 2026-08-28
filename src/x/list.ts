import type { CookieSession } from "../session";
import { fetchGraphql } from "./client";
import { parseProfileResult, type Profile } from "./profile";
import { filterSearchTimeline, parseTimeline, type Timeline } from "./timeline";

const GRAPH_LIST_BY_ID = "niz0TtOxL2zIcbq6_NQiNw/ListByRestId";
const GRAPH_LIST_BY_SLUG = "RqkWNDQpOntlxNtJa4RIoQ/ListBySlug";
const GRAPH_LIST_MEMBERS = "8rYmkvWQe9jRRZdy_-vkGA/ListMembers";
const GRAPH_LIST_TIMELINE = "0QJtcuMzVywHGAWD6Dtjlw/ListTimeline";

export type ListDetail = {
  id: string;
  name: string;
  description: string;
  members: number;
  banner: string;
  owner: Profile;
};

export type ListMembers = {
  users: Profile[];
  cursor?: string;
};

export async function fetchListById(id: string, session: CookieSession): Promise<ListDetail> {
  return parseList(await fetchGraphql(GRAPH_LIST_BY_ID, { listId: id }, {}, session));
}

export async function fetchListBySlug(username: string, slug: string, session: CookieSession): Promise<ListDetail> {
  return parseList(await fetchGraphql(
    GRAPH_LIST_BY_SLUG,
    { screenName: username, listSlug: slug },
    {},
    session,
  ));
}

export async function fetchListTimeline(id: string, session: CookieSession, cursor?: string): Promise<Timeline> {
  const timeline = filterSearchTimeline(parseTimeline(await fetchGraphql(
    GRAPH_LIST_TIMELINE,
    { rest_id: id, count: 20, ...(cursor ? { cursor } : {}) },
    {},
    session,
  )));
  return cursor && timeline.cursor?.slice(0, 64) === cursor.slice(0, 64) ? { tweets: [] } : timeline;
}

export async function fetchListMembers(id: string, session: CookieSession, cursor?: string): Promise<ListMembers> {
  const members = parseListMembers(await fetchGraphql(
    GRAPH_LIST_MEMBERS,
    {
      listId: id,
      withBirdwatchPivots: false,
      withDownvotePerspective: false,
      withReactionsMetadata: false,
      withReactionsPerspective: false,
      ...(cursor ? { cursor } : {}),
    },
    {},
    session,
  ));
  return cursor && members.cursor?.slice(0, 64) === cursor.slice(0, 64) ? { users: [] } : members;
}

export function parseList(value: unknown): ListDetail {
  const list = firstRecord(value, [
    ["data", "list"],
    ["data", "user_by_screen_name", "list"],
    ["data", "userByScreenName", "list"],
  ]);
  if (!list) throw new ListNotFoundError();
  const id = stringValue(list.id_str) || stringValue(list.rest_id);
  const ownerResult = firstRecord(list, [
    ["user_results", "result"],
    ["user_result", "result"],
    ["userResults", "result"],
  ]);
  if (!id || !ownerResult) throw new ListNotFoundError();
  let owner: Profile;
  try {
    owner = parseProfileResult(ownerResult);
  } catch {
    throw new ListNotFoundError();
  }
  return {
    id,
    name: stringValue(list.name),
    description: stringValue(list.description),
    members: numberValue(list.member_count, list.memberCount),
    banner: stringValue(recordAt(list, ["custom_banner_media", "media_info", "original_img_url"]))
      || stringValue(recordAt(list, ["customBannerMedia", "mediaInfo", "originalImgUrl"]))
      || stringValue(recordAt(list, ["default_banner_media", "media_info", "original_img_url"]))
      || stringValue(recordAt(list, ["defaultBannerMedia", "mediaInfo", "originalImgUrl"])),
    owner,
  };
}

export function parseListMembers(value: unknown): ListMembers {
  const instructions = firstArray(value, [
    ["data", "list", "members_timeline", "timeline", "instructions"],
    ["data", "list", "membersTimeline", "timeline", "instructions"],
  ]);
  const users: Profile[] = [];
  const seen = new Set<string>();
  let cursor = "";
  for (const instructionValue of instructions) {
    const instruction = optionalRecord(instructionValue);
    if (!instruction) continue;
    for (const entryValue of optionalArray(instruction.entries) ?? []) {
      const entry = optionalRecord(entryValue);
      if (!entry) continue;
      const content = optionalRecord(entry.content);
      const entryId = stringValue(entry.entryId) || stringValue(entry.entry_id);
      const cursorType = stringValue(content?.cursorType) || stringValue(content?.cursor_type);
      if (entryId.startsWith("cursor-bottom") || cursorType === "Bottom") {
        cursor = stringValue(content?.value);
        continue;
      }
      addUser(users, seen, firstRecord(entry, [
        ["content", "itemContent", "user_results", "result"],
        ["content", "itemContent", "userResults", "result"],
        ["content", "item_content", "user_results", "result"],
      ]));
    }
    if (typeName(instruction) === "TimelineReplaceEntry") {
      const replaced = stringValue(instruction.entry_id_to_replace) || stringValue(instruction.entryIdToReplace);
      const entry = optionalRecord(instruction.entry);
      if (replaced.startsWith("cursor-bottom") && entry) {
        cursor = stringValue(recordAt(entry, ["content", "value"]));
      }
    }
  }
  return { users, ...(cursor ? { cursor } : {}) };
}

export class ListNotFoundError extends Error {
  constructor() {
    super("X list does not exist");
    this.name = "ListNotFoundError";
  }
}

function addUser(users: Profile[], seen: Set<string>, result?: Record<string, unknown>): void {
  if (!result) return;
  try {
    const user = parseProfileResult(result);
    if (!user.id || seen.has(user.id)) return;
    const avatar = stringValue(recordAt(result, ["avatar", "image_url"]))
      || stringValue(recordAt(result, ["legacy", "profile_image_url_https"]));
    user.avatar = avatar.replace("_normal", "_bigger") || user.avatar;
    seen.add(user.id);
    users.push(user);
  } catch {
    // Members timelines can contain unavailable user tombstones.
  }
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
    ? value as Record<string, unknown>
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
