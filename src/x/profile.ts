import type { TweetLink, VerifiedType } from "./timeline";

export type Profile = {
  id: string;
  username: string;
  name: string;
  bio: string;
  bioLinks: TweetLink[];
  avatar: string;
  banner: string;
  location: string;
  basedIn?: string;
  website: string;
  joinedAt: string;
  followers: number;
  following: number;
  tweets: number;
  media: number;
  likes: number;
  protected: boolean;
  blueVerified: boolean;
  verifiedType: VerifiedType;
  suspended: boolean;
};

export function parseProfile(value: unknown): Profile {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const container = asOptionalRecord(data.userResult) ?? asOptionalRecord(data.user);
  return parseProfileResult(container?.result);
}

export function parseProfileResult(value: unknown): Profile {
  const result = asRecord(value);
  const verified = verifiedTypeOf(result);

  if (result.unavailable_reason === "Suspended" || result.reason === "Suspended") {
    return emptyProfile(true);
  }
  if (result.unavailable_reason === "DoesNotExist" || result.reason === "DoesNotExist") {
    throw new ProfileNotFoundError();
  }

  const legacy = asOptionalRecord(result.legacy);
  if (legacy && typeof legacy.screen_name === "string") {
    return {
      id: stringValue(legacy.id_str) || stringValue(result.rest_id),
      username: stringValue(legacy.screen_name),
      name: stringValue(legacy.name),
      bio: stringValue(legacy.description),
      bioLinks: bioLinksFromUrls(asOptionalArray(recordAtLegacy(legacy, ["entities", "description", "urls"]))),
      avatar: stringValue(legacy.profile_image_url_https).replace("_normal", ""),
      banner: stringValue(legacy.profile_banner_url),
      location: stringValue(legacy.location),
      website: expandedWebsite(recordAtLegacy(legacy, ["entities", "url"]), stringValue(legacy.url)),
      joinedAt: stringValue(legacy.created_at),
      followers: numberValue(legacy.followers_count),
      following: numberValue(legacy.friends_count),
      tweets: numberValue(legacy.statuses_count),
      media: numberValue(legacy.media_count),
      likes: numberValue(legacy.favourites_count),
      protected: booleanValue(legacy.protected),
      blueVerified: verified !== "none",
      verifiedType: verified,
      suspended: false,
    };
  }

  const core = asRecord(result.core);
  const avatar = asRecord(result.avatar);
  const banner = asRecord(result.banner);
  const location = asRecord(result.location);
  const website = asRecord(result.website);
  const bio = asOptionalRecord(result.profile_bio);
  const counts = asOptionalRecord(result.relationship_counts);
  const actionCounts = asOptionalRecord(result.action_counts);
  const tweetCounts = asOptionalRecord(result.tweet_counts);
  const privacy = asOptionalRecord(result.privacy);
  const username = stringValue(core.screen_name);

  if (!username) {
    throw new Error("X profile response has no user result");
  }

  return {
    id: stringValue(result.rest_id),
    username,
    name: stringValue(core.name),
    bio: stringValue(bio?.description),
    bioLinks: bioLinksFromUrls(
      asOptionalArray(recordAtLegacy(bio ?? {}, ["entities", "description", "urls"])),
    ),
    avatar: stringValue(avatar.image_url).replace("_normal", ""),
    banner: stringValue(banner.image_url),
    location: stringValue(location.location),
    website: expandedWebsite(
      recordAtLegacy(bio ?? {}, ["entities", "url"]),
      stringValue(website.url),
    ),
    joinedAt: stringValue(core.created_at)
      || (numberValue((core as Record<string, unknown>).created_at_ms)
        ? new Date(numberValue((core as Record<string, unknown>).created_at_ms)).toString()
        : ""),
    followers: numberValue(counts?.followers),
    following: numberValue(counts?.following),
    tweets: numberValue(tweetCounts?.tweets),
    media: numberValue(tweetCounts?.media_tweets),
    likes: numberValue(actionCounts?.favorites_count),
    protected: booleanValue(privacy?.protected),
    blueVerified: verified !== "none",
    verifiedType: verified,
    suspended: false,
  };
}

function verifiedTypeOf(result: Record<string, unknown>): VerifiedType {
  const verification = asOptionalRecord(result.verification);
  const type = stringValue(verification?.verified_type);
  if (type === "Business") return "business";
  if (type === "Government") return "government";
  return result.is_blue_verified === true || verification?.is_blue_verified === true ? "blue" : "none";
}

export type AccountInfo = {
  username: string;
  name: string;
  avatar: string;
  joinedAt: string;
  verifiedType: VerifiedType;
  suspended: boolean;
  basedIn: string;
  source: string;
  usernameChanges: number;
  lastUsernameChangeAt: number;
  affiliateUsername: string;
  affiliateLabel: string;
  isIdentityVerified: boolean;
  verifiedSinceAt: number;
  overrideVerifiedYear: number;
};

export function parseAccountInfo(value: unknown): AccountInfo {
  const info: AccountInfo = {
    username: "",
    name: "",
    avatar: "",
    joinedAt: "",
    verifiedType: "none",
    suspended: false,
    basedIn: "",
    source: "",
    usernameChanges: 0,
    lastUsernameChangeAt: 0,
    affiliateUsername: "",
    affiliateLabel: "",
    isIdentityVerified: false,
    verifiedSinceAt: 0,
    overrideVerifiedYear: 0,
  };
  const data = asOptionalRecord(asOptionalRecord(value)?.data);
  const container = asOptionalRecord(data?.user_result_by_screen_name)
    ?? asOptionalRecord(data?.userResultByScreenName);
  const user = asOptionalRecord(container?.result);
  if (!user) return info;
  if (stringValue(user.unavailable_reason) === "Suspended" || stringValue(user.reason) === "Suspended") {
    info.suspended = true;
    return info;
  }

  const core = asOptionalRecord(user.core);
  info.username = stringValue(core?.screen_name);
  info.name = stringValue(core?.name);
  info.joinedAt = stringValue(core?.created_at);
  info.avatar = stringValue(asOptionalRecord(user.avatar)?.image_url).replace("_normal", "");
  info.verifiedType = verifiedTypeOf(user);

  const about = asOptionalRecord(user.about_profile) ?? asOptionalRecord(user.aboutProfile);
  if (about) {
    info.basedIn = stringValue(about.account_based_in) || stringValue(about.accountBasedIn);
    info.source = stringValue(about.source);
    info.affiliateUsername = stringValue(about.affiliate_username) || stringValue(about.affiliateUsername);
    info.affiliateLabel = stringValue(
      asOptionalRecord(asOptionalRecord(user.identity_profile_labels_highlighted_label)?.label)?.description,
    );
    const changes = asOptionalRecord(about.username_changes) ?? asOptionalRecord(about.usernameChanges);
    info.usernameChanges = Number(stringValue(changes?.count)) || numberValue(changes?.count) || 0;
    info.lastUsernameChangeAt = msValue(changes?.last_changed_at_msec) || msValue(changes?.lastChangedAtMsec);
  }

  const verification = asOptionalRecord(user.verification_info) ?? asOptionalRecord(user.verificationInfo);
  if (verification) {
    info.isIdentityVerified = verification.is_identity_verified === true || verification.isIdentityVerified === true;
    const reason = asOptionalRecord(verification.reason);
    info.overrideVerifiedYear = numberValue(reason?.override_verified_year) || numberValue(reason?.overrideVerifiedYear);
    info.verifiedSinceAt = msValue(reason?.verified_since_msec) || msValue(reason?.verifiedSinceMsec);
  }
  return info;
}

function msValue(value: unknown): number {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : typeof value === "number" ? value : 0;
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super("X profile does not exist");
    this.name = "ProfileNotFoundError";
  }
}

function emptyProfile(suspended: boolean): Profile {
  return {
    id: "",
    username: "",
    name: "",
    bio: "",
    bioLinks: [],
    avatar: "",
    banner: "",
    location: "",
    website: "",
    joinedAt: "",
    followers: 0,
    following: 0,
    tweets: 0,
    media: 0,
    likes: 0,
    protected: false,
    blueVerified: false,
    verifiedType: "none",
    suspended,
  };
}

function bioLinksFromUrls(urls: unknown[] | undefined): TweetLink[] {
  const links: TweetLink[] = [];
  for (const item of urls ?? []) {
    const record = asOptionalRecord(item);
    if (!record) continue;
    const range = asOptionalArray(record.indices);
    const start = typeof range?.[0] === "number" ? range[0] : -1;
    const end = typeof range?.[1] === "number" ? range[1] : -1;
    const url = stringValue(record.expanded_url) || stringValue(record.url);
    if (end <= start || !url) continue;
    links.push({ kind: "url", start, end, url, display: stringValue(record.display_url) });
  }
  return links.sort((a, b) => a.start - b.start);
}

function expandedWebsite(entitiesUrl: unknown, fallback: string): string {
  const urls = Array.isArray(entitiesUrl)
    ? entitiesUrl
    : asOptionalArray(asOptionalRecord(entitiesUrl)?.urls) ?? [];
  const expanded = urls.length
    ? stringValue(asOptionalRecord(urls[0])?.expanded_url)
    : "";
  return expanded || fallback;
}

function recordAtLegacy(value: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asOptionalRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("X profile response has an invalid shape");
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}
