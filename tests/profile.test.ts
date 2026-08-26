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
            core: { screen_name: "alice", name: "Alice" },
            avatar: { image_url: "https://example.com/alice_normal.jpg" },
            profile_bio: { description: "hello" },
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
