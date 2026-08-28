# `SECURITY.md` — sidetrack

<!-- sidetrack:block id=security-trust-model -->

## Why the trust model is split this way

The in-scope/out-of-scope split is intentional: SideTrack is a **local tool**, not a service. Every boundary we defend is about **not making things worse** than plain files on disk — not about preventing a malicious repo owner from harming themselves.

**Path validation** (`normalizeRepoRelativePath` rejecting `..` and absolute paths) is the single most important guard. If a `.sidetrack.toml` could redirect writes outside the repo, an attacker who compromises a repo could overwrite `~/.ssh/authorized_keys` or similar. That's the kind of escalation we prevent.

**`storage.dir` under `.git/`** is rejected because Git treats `.git/` as opaque metadata — `git gc`, `git clean -fdx`, and re-clone can wipe it. If someone put sidetrack there, it would disappear without warning. This is a usability guard, not a security boundary.

**`rehype-sanitize` with allowlist** is the XSS defense. We don't trust user Markdown — even from teammates. The allowlist is intentionally restrictive: no inline `<script>`, no event handlers, no `javascript:` URLs. Mermaid runs with `securityLevel: "strict"` for the same reason.

**`spawn("git", argv)` with array form** avoids shell injection. String interpolation into a shell command would let a crafted branch name or file path execute arbitrary commands. The array form passes each argument as a distinct `argv` element.

**Prompt injection into AI assistants** is explicitly out-of-scope because SideTrack's purpose is to provide context to AI assistants — that's the MCP server's whole job. "Prompt injection via sidetrack" is not a bug; it's the feature working as designed. The same risk exists for any `README.md` or source comment. The real defense is code review: treat `.sidetrack/` changes like code changes.

<!-- sidetrack:page-break -->

<!-- sidetrack:block id=security-not-hardened -->

## What we deliberately don't harden

This section exists to be **honest about the boundaries** — not to excuse sloppiness, but to prevent false expectations.

**No sandboxing.** The CLI runs as the invoking user. If you run `sidetrack` as root, it has root. Sandboxing a developer CLI is a different product category (and would break legitimate workflows like writing to `.git/hooks/`).

**CLI args are trusted.** `sidetrack render --markdown PATH --out PATH` accepts absolute paths because it's a convenience command. The user typed it — they're not attacking themselves. This is the same trust model as `cp`, `mv`, or any other local tool.

The alternative — rejecting absolute paths or requiring `--allow-absolute-paths` flags — would annoy users without adding meaningful security. The attack vector here is "user runs a command they don't understand," which is out of scope for a local CLI.
