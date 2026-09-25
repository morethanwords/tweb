# Chat input editor

The complete field is the Solid component `src/components/richMessageInput`.
It owns the editable DOM, toolbars, expansion, dialogs, editor lifecycle and
media-upload controller. It can mount without a `ChatInput` instance.

This directory contains its Tiptap 3.28.0 / ProseMirror engine and node views.
`ChatInputEditor` in `types.ts` is the engine API; `index.ts` implements commands,
serialization and selection/history. The registry bridges the shared input
helpers without replacing the mounted input element.

## The only formatting path

Every field whose value is text plus entities runs this engine. Besides the chat
composer those are the media caption and the forward comment
(`inputFieldMessage.tsx`), the fact check (`chat/contextMenu.ts`), the poll
question, answers, description and answer explanation (`popups/createPoll`,
`pollMessageContent/AddOption.tsx`), the checklist title and tasks
(`popups/checklist.tsx`), the gift message (`popups/sendGift.tsx`) and everything
built on `InputFieldEmoji` — the folder name and the contact note. They mount it
with `attachPlainMessageEditor` (`plainField.ts`), which selects the plain
schema — so a block a caption cannot send has no way into the document, rather
than being detected after the fact.

A field built without linebreaks gets the one-line schema on top of that: no
block structure, no break, Enter does nothing and a multi-line clipboard lands on
the one line. `attachPlainMessageEditor` reads that from the field's own
`data-no-linebreaks`, so `withLinebreaks` stays the single statement of it.

There is no second implementation: formatting used to fall back to
`document.execCommand` with its own markup bookkeeping, and `helpers/dom/markdown.ts`
is now the dispatch into the editor plus the keyboard shortcuts. Consequences to
keep in mind when adding a field:

- `MarkupTooltip` requires an editor. Without one a selection is not
  formattable and the tooltip stays hidden, so making an input formattable and
  mounting the engine on it is one decision — `canHaveFormatting` alone only
  paints controls that would do nothing.
- Which controls exist follows the mounted schema through
  `editor.supportsMarkup`, not a hardcoded list; a plain field carries no
  highlight or script marks.
- `InputField.value` and its length counter read the editor when one is mounted.
  The DOM additionally holds the technical trailing paragraph, and counting that
  against a caption's limit is off by one.
- `PLAIN_MESSAGE_EXTENSIONS` is derived from the same node and mark sets
  `getMode` uses (`plainSchema.ts`), so a rich node added to the composer is
  excluded automatically. ProseMirror resolves `excludes` against the schema and
  throws on a dangling name, so the derivation rewrites those specs — do not
  maintain a second set of exclusions.
- Paste is the only way arbitrary rich HTML reaches a plain field, and the schema
  is what keeps the result sendable: marks survive, a block degrades to its text,
  an href outside the whitelist loses its link, and the mode never flips to rich.
  `popupSandboxEditor` pins those cases on the media caption.

Each of the shared input helpers answers from the editor when one is mounted and
falls back to the DOM only for a field whose value is a plain string — a contact
name, a group name, a payment or sign-up field. One entry point per concern:
`getRichValueWithCaret` (text, entities, caret), `isInputEmpty`,
`insertRichTextAsHTML`, `InputField.setValueSilently`. Do not add a second reader
beside them; that fallback exists for a different kind of field, not as an
alternative implementation for this one.

Those string fields have no rich paste either, and do not need one: the global
`paste` listener in `inputField.ts` keeps what the source calls plain text and
lets the emoji be wrapped, because the clipboard's HTML has nothing to land in.
A field that should keep formatting or custom emoji from the clipboard is a
field that carries entities, and that is the same statement as mounting the
engine on it — `inputFieldPaste` pins the string side, `popupSandboxEditor` the
other.

Fill a field with text and entities — `InputField.setValueSilently` takes them
directly, and `draftTextWithEntities` turns a draft into that pair. Rendering
them with `wrapDraftText` first and handing over the DOM makes the editor parse
that DOM straight back with `getRichElementValue`, which is how a draft used to
be loaded; the walker belongs to the fields that have no editor, not to this
round trip.

## Component boundary

`RichMessageInput` receives submit/input/height callbacks, capability queries,
an optional AI context and a media transport. `ChatInput` owns chat policy,
reply/edit state, server drafts and sending. Its adapter captures peer/topic/edit
identity for asynchronous operations; none of those objects is passed into the
field or its toolbar.

- `richMessageInput/index.tsx` owns mounting, sizing, expansion, picker events,
  HMR and cleanup. Existing chat controls occupy accessory slots.
- `toolbar.ts` owns formatting controls and their dialogs.
- `media.ts` owns upload tasks, progress, retry/cancel, preview leases and their
  reconciliation with document history. Transport sessions authorize and upload
  through app managers; they reject stale chat contexts.
- `editMedia.ts` and `mediaSource.ts` provide media editing without a chat host.
  The existing message-media editor reuses the same source helpers.
- `ai.tsx` consumes `AiEditorContext`; `chat/inputState/createAiEditorContext.ts`
  adapts chat sending policy to that small interface. AI applies content through
  editor transactions, including whole-document rewrites; it must not use the
  draft-loading setters, which intentionally reset history.
- `richMessageInput/style.scss` owns the field's expansion and controls;
  `inputEditor/style.scss` owns editable node presentation. Chat supplies only
  its outer layout and available expansion height.

Document state stays inside ProseMirror. Use the controller ref for explicit
replacement/snapshot operations; do not round-trip the document through Solid
props on every keystroke. The optional `layoutElement` only provides an outer
expansion frame; without it the component creates its own layout.

## Structure

| Area | Implementation |
| --- | --- |
| Extension composition and order | `extensions.ts` |
| Paragraphs, quotes, Details, code, marks, math | Corresponding modules in `extensions/` |
| Table schema, node view, keyboard navigation | `extensions/tableNodes.ts`, `tableView.ts`, `tableNavigation.ts` |
| Table commands and clipboard | `tableCommands.ts`, `tableClipboard.ts` |
| Buttons (inline and a row) and their box | `extensions/richButtons.ts`, `richButtonModel.ts`, `popups/richButton.tsx` |
| Block selection, movement and pointer targets | `extensions/blockStructure.ts`, `blockReorder.ts`, `blockTargets.ts` |
| Media and map node views | `extensions/media.ts`, `map.ts` |
| Upload preparation and history | `prepareRichMediaUpload.ts`, `mediaUploadHistory.ts`, `reconcileUploads.ts` |
| Shared preview URL ownership | `mediaPreviewUrl.ts` |
| Document and Telegram conversion | `model.ts`, `richMessage.ts` |
| Remote draft application | `ChatInput` in `../input.ts` |

`extensions.ts` lists the upstream extensions and composes them with this
composer's own; model tests use the same configuration. Import commands from
their owning module rather than through that composition module. Keep shared
node-view helpers below the extensions to avoid circular initialization
dependencies.

`TIPTAP_BASE_EXTENSIONS` deliberately does not use StarterKit: that barrel
statically imports every extension it can compose, so the eleven this composer
replaces with its own nodes shipped in the bundle even when configured off, and
its `link` pulled `linkifyjs` in for autolinking that is switched off here. The
list keeps StarterKit's order — schema node order decides the default block
type — and the `link` mark lives in `extensions/marks.ts`, gating hrefs through
`isAllowedLinkHref`, which shares its protocol whitelist with the link dialog's
`normalizeLinkUrl`. That gate is what keeps a pasted `<a href="javascript:…">`
from becoming a link while still admitting the relative hrefs upstream allowed;
`chatInputEditorUpstreamContracts` owns those cases and
`chatInputEditorLinkMark` pins the rest of the hand-written mark.

## Contracts that must survive changes

- The final empty paragraph is a technical placeholder. It is excluded from
  serialization. Enter inserts one newline; the configured send shortcut
  determines whether plain Enter or Shift+Enter edits the document.
- Backspace after media enters its caption. An authored empty paragraph is
  removed; the technical final placeholder remains. Keyboard, `beforeinput`
  and the virtual keyboard must agree, including caret and Undo/Redo.
- Plain-compatible text uses Telegram text/entities. Rich-only blocks and
  marks use the native rich-message representation. Mode changes preserve
  authored quotes, offsets and history.
- Tables have an explicit title/wrapper and preserve rectangular selections.
  Block movement respects container schemas and list numbering. A compact
  table is the table's `compact` attribute, sent as `pageBlockTable.compact`.
- A quote folds in either mode, but only where the message can carry the fold:
  a plain quote, or a rich quote of paragraphs, which is sent as one
  `pageBlockBlockquote` with `collapsed`. A rich quote holding other blocks
  unfolds on the way to rich mode (`isCollapsibleQuote`). The field's height
  observer offers the fold on a long quote (`can-send-collapsed`); the quote's
  node view ignores those class changes, or ProseMirror would redraw the quote
  and drop the offer on every keystroke. The switch itself is a widget inside
  the quote (`chat-input-quote-toggle`), a real button over the corner icon.
- A control inside the document — details toggle, checklist box, button chip,
  fold switch — is a native `<button>` with `contentEditable=false` whose events
  ProseMirror does not handle (`stopEvent`). The caret stays in the text while
  such a button holds the focus, and an editable caret takes Enter for editing,
  so the editor presses a focused button on Enter itself
  (`onDocumentButtonKeyDown`); Space reaches it natively.
- Buttons are leaves: `richButton` (sent as `textButton`) keeps its label as
  inline JSON in `label`, `buttonRow` (sent as `pageBlockButtonRow`) keeps its
  buttons' attributes in `buttons`. A label is edited in the button's box,
  never in place, so the caret, the arrows and block commands never see its
  text. Only what desktop and WebA author — link, copy, profile, disabled — is
  editable; a bot's button loaded into the composer keeps the message
  read-only (`richMessageEditability.ts`).
- Media upload completion updates the existing node and maps selection;
  it must not add an unrelated history step or orphan an undoable upload.
  Local preview URLs remain owned while history/HMR can restore them.
- Shared `inputRichMessageBlocks` normalizes server blocks for both editor
  loading and manager operations. `concatRichText` never mutates its inputs.
- Ordered-list rules and RichText content detection live in
  `lib/richTextProcessor`; worker validation must not depend on UI or Tiptap.
- Shared Instant View formatting and styles govern both composer and output.
  Plain quote width remains content-sized; rich block presentation is shared.
- Applying an unchanged server draft must not echo it back. Later remote
  revisions can replace that received state, but must preserve local edits.
  Deferred hydration and asynchronous actions validate their saved context.
  A draft update dropped because our own write was in flight leaves the server
  state unknown, so the drafts are read again once the window closes.
- A received rich draft the composer cannot represent is protected from being
  overwritten only while nothing has been typed over it. The first real user
  edit wins; a guard that outlives it discards what the user writes.

## Tests

Unit tests live in `src/tests/chatInputEditor*.test.ts`. Integration suites are
grouped by behavior: clipboard, keyboard, quotes, math, tables, uploads, media,
tooltips and block movement. Their shared setup is
`src/tests/helpers/chatInputEditorHarness.ts`; the small common mount helper is
`src/tests/helpers/chatInputEditor.ts`. Table-specific stubs live in
`src/tests/mocks/chatInputEditorTableUi.ts`, reusing the common node-view stubs
in `chatInputEditorNodes.ts`. Browser setup and selection settling are shared
in `e2e/fixtures/chatInputEditorTest.ts`.

`src/tests/richMessageInput.test.ts` covers standalone mounting, independent
instances, submission, engine reload and pending-upload lifetime. The
`richMessageInputAi` tests exercise AI application and Undo/Redo in the actual
field; `richMessageModelBoundary` checks the validator's transitive runtime
dependencies. The
`e2e/fixtures/richMediaComposer.ts` fixture mounts the real component without
`ChatInput`; popup browser tests exercise its toolbar, dialogs and media controls.

From the repository root:

```sh
pnpm test --run src/tests/chatInputEditor
pnpm test --run
pnpm test:editor:e2e
pnpm test:popups
pnpm run typecheck
pnpm lint
pnpm build
```

Playwright covers native selection, clipboard, input rules, media captions,
history, table navigation and uploads in Chromium, Firefox and WebKit.
Popup suites exercise real application components and shared styles.
Run an authenticated preview with `bash scripts/start-preview.sh`.

The opt-in `src/tests/api/richMessageLifecycle.test.ts` uses real MTProto.
It requires `TG_RICH_MESSAGE_LIVE=1`, `TG_API_SEED` and `TG_API_SEED_B`
(independent authorizations of the same account); production also requires
`TG_API_PROD_DC=1`. Normal unit runs skip these server tests.

## Upstream audit

The pinned Tiptap revision is
`c5f4b576eb2d521364bba524616e0702027987d3` (3.28.0). Its audit covers 206 test
files, 1,586 declarations and 20 support files. Declarations inside parameter
loops are counted once; this is not a claim that upstream tests were executed.

`pnpm-workspace.yaml` pins all Tiptap packages, including ones that arrive only
as transitive dependencies, to that release. `tiptapDependencies.test.ts` checks the versions
actually resolved from each installed package and its peers. When upgrading,
update the direct dependencies, the shared override version and the upstream
audit together; a new Tiptap dependency must also be covered by the overrides.

`scripts/tiptap-audit/tiptap-3.28.0.json` stores a hash and default review per
file, with declaration-line exceptions where decisions differ. A whole-file
hash pins test bodies, titles and parameter data, so they need not be copied
into this repository. Reviews retain local evidence and distinguish:

- `local`: an application-level behavioral adaptation (278 declarations);
- `different-contract`: an explicit schema/API/behavior difference (561);
- `dependency`: unchanged library internals, not a local test run (308);
- `not-used`: absent packages, adapters or demo features (439).

Check a clean checkout of the pinned revision and regenerate the detailed
inventory when investigating a particular upstream case:

```sh
node scripts/audit-tiptap-tests.mjs /path/to/tiptap --check scripts/tiptap-audit/tiptap-3.28.0.json
node scripts/audit-tiptap-tests.mjs /path/to/tiptap > /tmp/tiptap-inventory.json
pnpm test --run scripts/tiptap-audit/manifest.test.mjs
```

The check rejects source/fixture drift, unaccounted declarations, invalid
overrides and missing local evidence. Update decisions explicitly on a Tiptap
upgrade; do not treat a zero-gap audit as proof that all editor behavior is
covered.

## Verification boundary

On 2026-09-18, two independent authenticated sessions verified rich-text
send/receive/edit, checklists, photo/audio/video uploads, caption editing,
successive remote draft revisions, reload and remote clearing. This found the
remote-draft echo/overwrite regression now covered by `chatInputDraftSync` and
`chatInputEditingLifecycle`. Full playback/seek and editing rich drafts from
older released clients were not covered by that check.

Keep reproducible commands and behavioral contracts here. Per-run logs,
temporary peer identifiers and chronological implementation/review journals
do not belong in the feature diff.
