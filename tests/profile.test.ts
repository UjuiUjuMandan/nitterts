import { describe, expect, it } from "vitest";
import { parseProfile, ProfileNotFoundError } from "../src/x/profile";

describe("parseProfile", () => {
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
              description: "hello",
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
