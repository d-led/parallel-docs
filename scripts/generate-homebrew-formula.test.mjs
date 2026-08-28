import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOMEBREW_SIDETRACK_ASSETS,
  renderHomebrewSideTrackFormula,
  sha256ReleaseAssets,
} from "./generate-homebrew-formula.mjs";

describe("renderHomebrewSideTrackFormula", () => {
  const sha = (n) => n.repeat(64).slice(0, 64);

  it("renders four platform URLs and install branches for darwin/linux", () => {
    const body = renderHomebrewSideTrackFormula({
      version: "0.2.0",
      sha256ByFilename: {
        "sidetrack-darwin-arm64": sha("a"),
        "sidetrack-darwin-x64": sha("b"),
        "sidetrack-linux-arm64": sha("c"),
        "sidetrack-linux-x64": sha("d"),
      },
    });

    expect(body).toContain('version "0.2.0"');
    expect(body).toContain("sidetrack-darwin-arm64");
    expect(body).toContain("sidetrack-darwin-x64");
    expect(body).toContain("sidetrack-linux-arm64");
    expect(body).toContain("sidetrack-linux-x64");
    expect(body).toContain("on_macos");
    expect(body).toContain("on_linux");
    expect(body).toContain('shell_output("#{bin}/sidetrack --version")');
    expect(body).not.toContain("windows");
    expect(HOMEBREW_SIDETRACK_ASSETS).toHaveLength(4);
  });

  it("passes ruby -c syntax check", () => {
    const body = renderHomebrewSideTrackFormula({
      version: "1.0.0",
      sha256ByFilename: {
        "sidetrack-darwin-arm64": sha("1"),
        "sidetrack-darwin-x64": sha("2"),
        "sidetrack-linux-arm64": sha("3"),
        "sidetrack-linux-x64": sha("4"),
      },
    });
    const dir = mkdtempSync(join(tmpdir(), "brew-formula-"));
    const rb = join(dir, "sidetrack.rb");
    writeFileSync(rb, body, "utf8");
    const r = spawnSync("ruby", ["-c", rb], { encoding: "utf8" });
    rmSync(dir, { recursive: true, force: true });
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it("rejects missing shas", () => {
    expect(() =>
      renderHomebrewSideTrackFormula({
        version: "1.0.0",
        sha256ByFilename: {
          "sidetrack-darwin-arm64": sha("1"),
        },
      }),
    ).toThrow(/Missing or invalid sha256/);
  });
});

describe("sha256ReleaseAssets", () => {
  it("hashes each asset URL with the given fetcher", async () => {
    const fetchFn = async (url) => {
      if (url.endsWith("sidetrack-darwin-arm64")) return new TextEncoder().encode("A").buffer;
      if (url.endsWith("sidetrack-darwin-x64")) return new TextEncoder().encode("B").buffer;
      if (url.endsWith("sidetrack-linux-arm64")) return new TextEncoder().encode("C").buffer;
      if (url.endsWith("sidetrack-linux-x64")) return new TextEncoder().encode("D").buffer;
      throw new Error(`unexpected ${url}`);
    };
    const sums = await sha256ReleaseAssets("v9.9.9", fetchFn);
    expect(Object.keys(sums)).toHaveLength(4);
    expect(sums["sidetrack-darwin-arm64"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
