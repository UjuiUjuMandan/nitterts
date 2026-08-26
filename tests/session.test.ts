import { describe, expect, it } from "vitest";
import { parseSessions } from "../src/session";

describe("parseSessions", () => {
  it("parses cookie JSONL", () => {
    const sessions = parseSessions(
      '{"kind":"cookie","username":"alice","id":"1","auth_token":"token","ct0":"csrf"}\n',
    );

    expect(sessions).toEqual([
      {
        kind: "cookie",
        username: "alice",
        id: "1",
        authToken: "token",
        ct0: "csrf",
      },
    ]);
  });

  it("rejects missing credentials without including values", () => {
    expect(() =>
      parseSessions('{"kind":"cookie","username":"alice","id":"1","auth_token":"token"}'),
    ).toThrow("line 1 has invalid ct0");
  });
});
