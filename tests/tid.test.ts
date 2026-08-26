import { describe, expect, it } from "vitest";
import { generateTransactionId } from "../src/x/tid";

describe("generateTransactionId", () => {
  it("encodes the verification key, timestamp, hash, and version", async () => {
    const tid = await generateTransactionId(
      "/i/api/graphql/test/Operation",
      { animationKey: "animation", verification: "AQIDBA==" },
      1_700_000_000_000,
      42,
    );
    const bytes = Uint8Array.from(atob(tid), (character) => character.charCodeAt(0));
    const payload = bytes.slice(1).map((byte) => byte ^ 42);
    const expectedTime = Math.floor(1_700_000_000_000 / 1000) - 1_682_924_400;
    const expectedHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `GET!/i/api/graphql/test/Operation!${expectedTime}obfiowerehiringanimation`,
        ),
      ),
    );

    expect(bytes).toHaveLength(1 + 4 + 4 + 16 + 1);
    expect(bytes[0]).toBe(42);
    expect(payload.slice(0, 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(new DataView(payload.buffer, payload.byteOffset + 4, 4).getUint32(0, true)).toBe(
      expectedTime,
    );
    expect(payload.slice(8, 24)).toEqual(expectedHash.slice(0, 16));
    expect(payload.at(-1)).toBe(3);
  });
});
