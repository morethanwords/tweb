# Chat input editor browser fixture

Run the focused Chromium suite with:

```bash
pnpm test:editor:e2e
```

The fixture mounts the production `createChatInputEditor` in a standalone page.
It intentionally avoids the Telegram account/bootstrap layer, workers and
storage so editor regressions can be reproduced deterministically with a real
`contenteditable`, native DOM selection and browser keyboard events.

`vite.editor-e2e.config.ts` replaces only UI infrastructure that is irrelevant
to the editor engine (menus, translations and custom-emoji rendering). Do not
stub Tiptap extensions, schema, commands or selection behavior here: those are
the production code this suite is meant to test.

Add browser-only regressions to `e2e/chatInputEditor*.spec.ts`. Prefer driving
the page with Playwright keyboard/pointer APIs after using the fixture harness
only to create a deterministic document and initial selection.
