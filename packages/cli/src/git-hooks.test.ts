import { describe, expect, it } from "vitest";

import {
  SIDETRACK_HOOK_BEGIN,
  mergeSideTrackPreCommitHook,
  normalizeHookNewlines,
} from "./git-hooks.js";

describe("Merging the SideTrack pre-commit hook script", () => {
  it("creates a shell hook when the file is empty", () => {
    const out = mergeSideTrackPreCommitHook("");
    expect(out).toContain("#!/bin/sh");
    expect(out).toContain(SIDETRACK_HOOK_BEGIN);
    expect(out).toContain("packages/cli/dist/cli.js");
    expect(out).toContain('node "$dev_cli" validate --staged');
    expect(out).toMatch(/sidetrack" validate --staged/);
  });

  it("appends a block to an existing hook without markers", () => {
    const prior = "#!/bin/sh\necho hi\n";
    const out = mergeSideTrackPreCommitHook(prior);
    expect(out.startsWith("#!/bin/sh")).toBe(true);
    expect(out).toContain("echo hi");
    expect(out.indexOf(SIDETRACK_HOOK_BEGIN)).toBeGreaterThan(out.indexOf("echo hi"));
  });

  it("replaces an existing managed block on re-run", () => {
    const first = mergeSideTrackPreCommitHook("");
    const second = mergeSideTrackPreCommitHook(
      first.replace("packages/cli/dist/cli.js", "packages/cli/dist/SHOULD_BE_GONE"),
    );
    expect(second).toContain("packages/cli/dist/cli.js");
    expect(second).not.toContain("SHOULD_BE_GONE");
  });

  it("preserves user content after the managed block", () => {
    const base = mergeSideTrackPreCommitHook("#!/bin/sh\necho before\n");
    const withTail = `${base}echo after\n`;
    const replaced = mergeSideTrackPreCommitHook(withTail);
    expect(replaced).toContain("echo after");
  });

  it("removes legacy commentary-cli-hook block when inserting the new one", () => {
    const legacy =
      "#!/bin/sh\n# <<<< commentary-cli-hook v1 BEGIN >>>>\nold\n# <<<< commentary-cli-hook v1 END >>>>\n";
    const out = mergeSideTrackPreCommitHook(legacy);
    expect(out).not.toContain("commentary-cli-hook");
    expect(out).toContain(SIDETRACK_HOOK_BEGIN);
    expect(out).toMatch(/sidetrack" validate --staged/);
  });
});

describe("Normalising hook script line endings", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeHookNewlines("a\r\nb")).toBe("a\nb");
  });
});
