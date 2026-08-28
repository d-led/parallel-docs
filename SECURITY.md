# Security

SideTrack is a local developer tool: the CLI, the git hook, and the rendered
HTML all run on the machine of whoever invokes them, against content already
checked into the repository. This file documents the trust boundary we actually
defend, the boundary we cannot defend, and how to report an issue.

## Trust model

<!-- #region sidetrack:security-trust-model -->

**In-scope — SideTrack must not make these worse than plain files on disk:**

- Parsing `.sidetrack.toml`. Must never execute code, and must not let a
  hostile config redirect filesystem writes outside the repo
  (`storage.dir`, `static_site.source_file`, `static_site.sidetrack_markdown`
  are path-validated by `normalizeRepoRelativePath`; absolute paths and `..`
  segments are rejected). `storage.dir` is additionally forbidden from
  resolving inside `.git/`, since Git treats that directory as opaque
  metadata and routine operations (`git gc`, `git clean -fdx`, re-clone)
  can wipe it.
- Parsing `.sidetrack/metadata/index.json`. JSON only; migrations never
  `eval`/`require` content.
- Rendering SideTrack Markdown to HTML. User Markdown passes through
  `remark` → `rehype-sanitize` (allowlist schema) → `rehype-highlight`.
  No inline `<script>`, no `on*` handlers, no `javascript:` URLs survive.
  Mermaid runs with `securityLevel: "strict"`.
- Installing the git hook. `sidetrack init scm` writes a fixed shell block
  into `.git/hooks/pre-commit`; it never interpolates user input.
- Invoking `git`. `spawn("git", argv)` with the array form; no shell, no
  string interpolation.

**Out of scope — same trust level as source code:**

- **Prompt injection into AI coding assistants** (Cursor, Copilot, other IDE
  AIs) via the contents of `.sidetrack/source/**/*.md`. SideTrack Markdown
  lives in the repo and will be read by AI tooling exactly like any
  `README.md` or source comment. Review `.sidetrack/**` changes with the
  same rigor as code; a malicious PR that rewrites sidetrack is a social /
  supply-chain problem, not a SideTrack bug.
- Code executed by the developer's own editor, test runner, or build tools
  in response to any repository content.

<!-- #endregion sidetrack:security-trust-model -->

## What is deliberately _not_ a hardening layer

<!-- #region sidetrack:security-not-hardened -->

- The CLI runs with the invoking user's full filesystem rights. It resolves
  the project root from `.sidetrack.toml` → `.git` → the current directory
  (see `packages/cli/src/project-root.ts`); it does not attempt to sandbox
  itself.
- `sidetrack render --markdown PATH --out PATH` accepts absolute paths
  because it is a local convenience command driven by the user on the
  command line. Command-line arguments are trusted input.

<!-- #endregion sidetrack:security-not-hardened -->

## Reporting a vulnerability

If you think you've found a flaw that breaches the in-scope guarantees above
(for example: a `.sidetrack.toml` value that causes writes outside the repo,
XSS in rendered Markdown that bypasses `rehype-sanitize`, or shell injection
through any SideTrack-controlled string), please open a private report via
[GitHub Security Advisories](https://github.com/d-led/sidetrack/security/advisories/new)
rather than a public issue.

Include:

- The SideTrack version (`sidetrack --version`) and platform.
- A minimal repo or config that reproduces the behavior.
- What you expected vs. observed.
