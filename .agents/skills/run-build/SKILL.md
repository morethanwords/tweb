---
name: run-build
description: "List local tweb build snapshots by date and serve a chosen one on demand. Builds are the git \"Build\" commits that update public/ (the compiled app that server.js serves). Use when the user wants to browse, page through, pick, run, launch, or serve a build — e.g. \"запусти сборку\", \"покажи сборки\", \"list builds\", \"run the June build\", \"serve an old build\", \"launch build #3\"."
user-invocable: true
argument-hint: "[--page N] [<index>|<sha>] [--port P] [--all]"
allowed-tools: ["Bash", "Read"]
---

# /run-build — browse tweb builds by date, then serve one

Every `pnpm build` commits the compiled app into `public/` as a **`Build`** commit
(see `git log -- public`). Those commits are the "builds". `server.js` serves
`public/` in production; this skill lists past builds by date and serves any chosen
snapshot locally by extracting that commit's `public/` tree — the working tree and
current checkout are never touched.

Two scripts under `.Codex/skills/run-build/scripts/` do the work:

| Script | Purpose |
|---|---|
| `list-builds.cjs` | Paginated, date-sorted table of builds (index, date, sha, version) |
| `serve-build.cjs` | Extracts a build's `public/` to a temp dir and serves it locally |

## Flow

**Always show the list first, then serve only what the user picks.** Do not launch a
build until the user has chosen one (unless they named a build/sha/date up front).

### 1. Show the list (default when invoked with no explicit pick)

```bash
node .Codex/skills/run-build/scripts/list-builds.cjs            # page 1, 15 per page
node .Codex/skills/run-build/scripts/list-builds.cjs --page 2   # next page
node .Codex/skills/run-build/scripts/list-builds.cjs --all      # include non-"Build" commits too
```

Relay the table to the user verbatim (it already shows a stable **index**, date, short
sha and app version), then ask which build to launch — or offer the next page. The index
is absolute and stable across pages (1 = newest), so `--page 2` continues at 16, 17, ….

### 2. Paginate on request

If the user asks for "more" / "next" / "older", re-run with the next `--page`. Keep the
same `--size`/`--all` flags you used before so indices stay consistent.

### 3. Serve the chosen build

Once the user picks, launch it **in the background** so you can report the URL while it
keeps serving:

```bash
# by list index (preferred — matches what the user saw)
node .Codex/skills/run-build/scripts/serve-build.cjs --index 3

# by commit sha or any git ref
node .Codex/skills/run-build/scripts/serve-build.cjs 385391233

# choose a port (default 8099; next free port is used if taken)
node .Codex/skills/run-build/scripts/serve-build.cjs --index 3 --port 8100
```

Run it with a **background Bash** (`run_in_background: true`), then read its output and
give the user the printed `http://localhost:<port>/` URL. If the user picked by date or
version rather than index, map that back to the index/sha from the last list output and
pass that.

- If you listed with `--all`, serve with `--all` too so `--index` refers to the same set.
- The URL is `http://localhost:<port>/` — served at **root**, never `/k`.

### 4. Stop a build

Stop the background process (its `SIGTERM` handler removes the temp dir). To serve a
different build, just launch another one — each picks its own free port, so several can
run at once.

## Notes

- **Read-only w.r.t. your checkout.** Serving extracts the commit's `public/` into a
  fresh OS temp dir via `git archive`; it never checks out, stashes, or modifies the
  working tree. No `pnpm install` or worktree needed — the scripts reuse the repo's
  `express`/`compression`.
- Serving mirrors `server.js` exactly: `etag` off, `Cache-Control: no-store`, gzip,
  `express.static`, and `/` → `index.html`.
- This serves an **existing** compiled snapshot; it does not run `pnpm build`. To create
  a new build, that's a separate `pnpm build` (which writes/commits `public/`).
- Old builds are served as-is; whether an ancient snapshot still boots against the live
  server is on that build, not the tooling.
