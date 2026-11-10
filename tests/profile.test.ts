import { describe, expect, it } from "vitest";
import { parseAccountInfo, parseProfile, ProfileNotFoundError } from "../src/x/profile";
import { renderProfileCard } from "../src/render/profile";

describe("parseProfile", () => {
  it.each([
    "落書きやイラスト@eluthel",
    "絵@eluthel",
    "サブ@eluthel",
    "😀落書きやイラスト@eluthel",
  ])("links CJK-adjacent bio mentions with code-point offsets: %s", (description) => {
    const profile = parseProfile({ data: { user: { result: {
      rest_id: "1",
      legacy: { screen_name: "eluthel1", description },
    } } } });
    const start = [...description.slice(0, description.indexOf("@"))].length;
    expect(profile.bioLinks).toEqual([{ kind: "mention", start, end: start + 8, url: "/eluthel", display: "@eluthel" }]);
    expect(renderProfileCard(profile)).toContain('<a href="/eluthel"');
  });

  it("does not link emails, overlong handles, or mentions inside URL entities", () => {
    const description = "名@example.com ascii@example.com e\u0301@example.com @abcdefghijklmnop https://example.com/@eluthel";
    const start = description.indexOf("https://");
    const profile = parseProfile({ data: { user: { result: {
      rest_id: "1",
      legacy: { screen_name: "alice", description, entities: { description: { urls: [
        { indices: [start, description.length], expanded_url: "https://example.com/@eluthel", display_url: "example.com/@eluthel" },
      ] } } },
    } } } });
    expect(profile.bioLinks).toHaveLength(1);
    expect(profile.bioLinks[0]?.kind).toBe("url");
  });

  it("parses the modern user shape", () => {
    const profile = parseProfile({
      data: {
        user_result: undefined,
        userResult: {
          result: {
            rest_id: "1",
            is_blue_verified: true,
            core: { screen_name: "alice", name: "Alice", created_at: "Mon Dec 30 23:54:40 +0000 2013" },
            avatar: { image_url: "https://example.com/alice_normal.jpg" },
            banner: { image_url: "https://example.com/banner.jpg" },
            location: { location: "The Internet" },
            website: { url: "https://t.co/abc" },
            profile_bio: {
              description: "hello\nサブ垢：@alice_alt 名@example.com e\u0301@example.com @abcdefghijklmnop",
              entities: { url: { urls: [{ expanded_url: "https://alice.example" }] } },
            },
            action_counts: { favorites_count: 7 },
            relationship_counts: { followers: 10, following: 5 },
            tweet_counts: { tweets: 20 },
            privacy: { protected: false },
          },
        },
      },
    });

    expect(profile).toMatchObject({
      id: "1",
      username: "alice",
      avatar: "https://example.com/alice.jpg",
      banner: "https://example.com/banner.jpg",
      location: "The Internet",
      website: "https://alice.example",
      joinedAt: "Mon Dec 30 23:54:40 +0000 2013",
      likes: 7,
      followers: 10,
      blueVerified: true,
      bioLinks: [{ kind: "mention", start: 10, end: 20, url: "/alice_alt", display: "@alice_alt" }],
    });
  });

  it("recognizes suspended users", () => {
    expect(
      parseProfile({ data: { userResult: { result: { unavailable_reason: "Suspended" } } } }),
    ).toMatchObject({ suspended: true });
  });

  it("recognizes missing users", () => {
    expect(() =>
      parseProfile({ data: { userResult: { result: { reason: "DoesNotExist" } } } }),
    ).toThrow(ProfileNotFoundError);
  });
});

describe("parseAccountInfo", () => {
  it("parses about account fields from the snake_case shape", () => {
    const info = parseAccountInfo({
      data: {
        user_result_by_screen_name: {
          result: {
            core: { screen_name: "alice", name: "Alice", created_at: "Sun Nov 19 13:47:00 +0000 2023" },
            avatar: { image_url: "https://pbs.twimg.com/alice_normal.jpg" },
            is_blue_verified: true,
            about_profile: {
              account_based_in: "Japan",
              source: "Japan App Store",
              affiliate_username: "koko",
              username_changes: { count: "3", last_changed_at_msec: "1700400000000" },
            },
            identity_profile_labels_highlighted_label: { label: { description: "Idol" } },
            verification_info: {
              is_identity_verified: true,
              reason: { override_verified_year: -500 },
            },
          },
        },
      },
    });

    expect(info).toMatchObject({
      username: "alice",
      avatar: "https://pbs.twimg.com/alice.jpg",
      verifiedType: "blue",
      basedIn: "Japan",
      source: "Japan App Store",
      affiliateUsername: "koko",
      affiliateLabel: "Idol",
      usernameChanges: 3,
      lastUsernameChangeAt: 1_700_400_000_000,
      isIdentityVerified: true,
      overrideVerifiedYear: -500,
    });
  });

  it("parses the camelCase shape and numeric counts", () => {
    const info = parseAccountInfo({
      data: {
        userResultByScreenName: {
          result: {
            core: { screen_name: "bob", name: "Bob" },
            verification: { verified_type: "Business", is_blue_verified: true },
            aboutProfile: {
              accountBasedIn: "Chile",
              usernameChanges: { count: 2, lastChangedAtMsec: 1_600_000_000_000 },
            },
            verificationInfo: { reason: { verifiedSinceMsec: 1_500_000_000_000 } },
          },
        },
      },
    });

    expect(info).toMatchObject({
      username: "bob",
      verifiedType: "business",
      basedIn: "Chile",
      usernameChanges: 2,
      lastUsernameChangeAt: 1_600_000_000_000,
      verifiedSinceAt: 1_500_000_000_000,
    });
  });

  it("marks suspended accounts and returns defaults for empty responses", () => {
    expect(parseAccountInfo({ data: { user_result_by_screen_name: { result: { unavailable_reason: "Suspended" } } } }))
      .toMatchObject({ suspended: true });
    expect(parseAccountInfo({})).toMatchObject({ username: "", usernameChanges: 0 });
    expect(parseAccountInfo(undefined)).toMatchObject({ suspended: false });
  });
});
