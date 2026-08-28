import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { decodeBase64Utf8 } from "./code-browser-encoding.js";

describe("UTF-8 base64 decoding for embedded payloads", () => {
  it("round-trips UTF-8 including punctuation typical of README titles", () => {
    const s = "# SideTrack — a side-by-side ecosystem\n";
    const b64 = Buffer.from(s, "utf8").toString("base64");
    expect(decodeBase64Utf8(b64)).toBe(s);
  });

  it("returns empty for blank input", () => {
    expect(decodeBase64Utf8("")).toBe("");
    expect(decodeBase64Utf8("   ")).toBe("");
  });

  it("returns empty for invalid base64", () => {
    expect(decodeBase64Utf8("not!!!valid")).toBe("");
  });
});
