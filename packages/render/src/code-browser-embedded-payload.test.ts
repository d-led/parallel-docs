import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { decodeBase64Utf8 } from "./code-browser-encoding.js";
import { readEmbeddedRawB64Strings } from "./code-browser-embedded-payload.js";
import { findOrderedTokenSpans } from "./code-browser-search.js";

describe("Reading embedded base64 payloads from static HTML", () => {
  it("prefers attributes on #shell when present", () => {
    const codeB64 = Buffer.from("alpha", "utf8").toString("base64");
    const mdB64 = Buffer.from("beta", "utf8").toString("base64");
    const shell = {
      getAttribute(name: string): string | null {
        if (name === "data-raw-code-b64") return codeB64;
        if (name === "data-raw-md-b64") return mdB64;
        return null;
      },
    };
    const pane = {
      getAttribute(): string | null {
        return "WRONG";
      },
    };
    expect(readEmbeddedRawB64Strings(shell, pane)).toEqual({
      rawCodeB64: codeB64,
      rawMdB64: mdB64,
    });
  });

  it("falls back to #code-pane when #shell has no payload (legacy static HTML)", () => {
    const codeB64 = Buffer.from("# ParallelDocs\n", "utf8").toString("base64");
    const mdB64 = Buffer.from("## Notes\n", "utf8").toString("base64");
    const shell = { getAttribute: () => null };
    const pane = {
      getAttribute(name: string): string | null {
        if (name === "data-raw-code-b64") return codeB64;
        if (name === "data-raw-md-b64") return mdB64;
        return null;
      },
    };
    const picked = readEmbeddedRawB64Strings(shell, pane);
    const rawCode = decodeBase64Utf8(picked.rawCodeB64);
    const rawMd = decodeBase64Utf8(picked.rawMdB64);
    expect(findOrderedTokenSpans(rawCode, ["paralleldocs"]).length).toBeGreaterThan(0);
    expect(rawMd).toContain("Notes");
  });
});
