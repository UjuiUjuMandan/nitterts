export type Profile = {
  id: string;
  username: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  following: number;
  tweets: number;
  protected: boolean;
  blueVerified: boolean;
  suspended: boolean;
};

export function parseProfile(value: unknown): Profile {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const container = asOptionalRecord(data.userResult) ?? asOptionalRecord(data.user);
  const result = asRecord(container?.result);

  if (result.unavailable_reason === "Suspended" || result.reason === "Suspended") {
    return emptyProfile(true);
  }
  if (result.unavailable_reason === "DoesNotExist" || result.reason === "DoesNotExist") {
    throw new ProfileNotFoundError();
  }

  const legacy = asOptionalRecord(result.legacy);
  if (legacy && typeof legacy.screen_name === "string") {
    return {
      id: stringValue(legacy.id_str),
      username: stringValue(legacy.screen_name),
      name: stringValue(legacy.name),
      bio: stringValue(legacy.description),
      avatar: stringValue(legacy.profile_image_url_https).replace("_normal", ""),
      followers: numberValue(legacy.followers_count),
      following: numberValue(legacy.friends_count),
      tweets: numberValue(legacy.statuses_count),
      protected: booleanValue(legacy.protected),
      blueVerified: booleanValue(result.is_blue_verified),
      suspended: false,
    };
  }

  const core = asRecord(result.core);
  const avatar = asRecord(result.avatar);
  const bio = asOptionalRecord(result.profile_bio);
  const counts = asOptionalRecord(result.relationship_counts);
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
    avatar: stringValue(avatar.image_url).replace("_normal", ""),
    followers: numberValue(counts?.followers),
    following: numberValue(counts?.following),
    tweets: numberValue(tweetCounts?.tweets),
    protected: booleanValue(privacy?.protected),
    blueVerified: booleanValue(result.is_blue_verified),
    suspended: false,
  };
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
    avatar: "",
    followers: 0,
    following: 0,
    tweets: 0,
    protected: false,
    blueVerified: false,
    suspended,
  };
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}
