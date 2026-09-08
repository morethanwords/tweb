# Offline Bot Builder Shell

Owner-approved scope: standalone client-only fork of morethanwords/tweb at
4a82cc7667477751cfc1b0dcec75db539c797a03. The original Telegram bootstrap,
authentication, preview, deployment and manager instructions do not apply to
this extracted shell. Preserve LICENSE, copyright headers and retained notices.

- Solid TypeScript and extracted native SCSS. Use the vendored browser runtime.
- Pure core reducers and validators own document and simulator invariants.
- Shared types in src/shell/core/types.ts are the contract; coordinate changes.
- No Telegram managers, external network, storage, media or backend code.
- Owner-approved inline logic v6 permits only the local compiler/executor workers
  and fixed-memory QuickJS WASM under src/shell/code. User code gets read-only
  data and returns declared outcomes; no browser or host capabilities.
- Edit inspects buttons; Test dispatches local occurrence-based transitions.
- Keep immutable upstream visual references independent of candidate code.
- Build only with the isolated pinned Node environment and minimal manifest.
- Verify actual production output with shell:verify before completion claims.
- Do not commit, push, deploy, or modify other running projects without request.
- Parallel ownership is disjoint: core, native/reference, tooling, root UI/effects.
- Use two-space indentation, single quotes and explicit types at boundaries.
- Never duplicate logic; search and reuse pure local functions where applicable.

## Owner-approved Semantic MCP companion

The accepted implementation plan permits a single local Node companion at 127.0.0.1:3130, authenticated MCP and same-origin UI document requests in this worktree only. No external provider calls, production APIs, database or durable storage. The offline shell entry and its isolation gate remain separate. Shared core owns all execution; semantic services own confirmed documents. Parallel ownership: core/headless, semantic compiler/operations, transport/Node Code adapter, root services/UI/build.
