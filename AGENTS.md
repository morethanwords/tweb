# Offline Bot Builder Shell

Owner-approved scope: standalone client-only fork of morethanwords/tweb at
4a82cc7667477751cfc1b0dcec75db539c797a03. The original Telegram bootstrap,
authentication, preview, deployment and manager instructions do not apply to
this extracted shell. Preserve LICENSE, copyright headers and retained notices.

- Solid TypeScript and extracted native SCSS. Use the vendored browser runtime.
- Pure core reducers and validators own document and simulator invariants.
- Shared types in src/shell/core/types.ts are the contract; coordinate changes.
- No Telegram managers, network, storage, media, workers or backend code.
- Edit inspects buttons; Test dispatches local occurrence-based transitions.
- Keep immutable upstream visual references independent of candidate code.
- Build only with the isolated pinned Node environment and minimal manifest.
- Verify actual production output with shell:verify before completion claims.
- Do not commit, push, deploy, or modify other running projects without request.
- Parallel ownership is disjoint: core, native/reference, tooling, root UI/effects.
- Use two-space indentation, single quotes and explicit types at boundaries.
- Never duplicate logic; search and reuse pure local functions where applicable.
