# Telegram Web K native reference

Upstream: https://github.com/morethanwords/tweb

Pinned commit: `4a82cc7667477751cfc1b0dcec75db539c797a03`.

`upstream/` contains byte-for-byte original files, including their existing
copyright headers. `upstream-manifest.json` records each original path and
SHA-256. These files are comparison inputs, never shipping runtime imports.
Do not regenerate them from candidate code or from a moving upstream branch.

`index.html` renders the independent native comparator. Its `entry.ts` creates
the original bubble/content/message/time hierarchy and keyboard rows using the
original class names. The SVG path is the `message-tail-filled` symbol in the
original `index.html`; its use is established by `components/chat/utils.ts`.
`style.scss` compiles the unmodified original base, bubble, avatar, typing and
ripple SCSS. No original JavaScript bootstrap or manager is executed.

`candidate.html` uses the same fixed `fixtures.json` inputs but renders the new
shell components and extracted stylesheet. Candidate and comparator never
import each other's implementation. `layout.scss` supplies only a fixed test
stage; it does not define bubble or keyboard geometry. Compare `.visual-fixture`
at 375 and 1280 CSS pixels, both default and `?theme=night`, including a hover on
`[data-button-id="material"]`. Freeze animation at the initial frame and await
`document.fonts.ready` before screenshots. The fixture includes Latin, Cyrillic,
emoji, a long unbroken line, both directions, 1×2 and 2×2 keyboards, avatar and
typing dots.

The reference Vite configuration must use `reference/static` as `publicDir`:
three unused selectors in original SCSS reference absolute `/assets/img` SVGs.
They remain available to compile the unmodified comparator; those assets are
not shell runtime dependencies. The reference artifact is served separately
and does not belong in the shipped shell directory.

## Retained presentation and deliberate shell adaptations

Native geometry comes from `_chatBubble.scss`: message margins 4/8/5 px,
15 px main corners, 5 px keyboard-adjacent corner, SVG tail 11×20 px,
timestamp 12 px, keyboard row gap 2 px, row minimum 40 px, 24 px final-row
outside corners. `_avatar.scss` supplies avatar geometry/gradient and
`_peerTyping.scss` supplies the three-dot animation.

The timestamp is followed by `<span class="clearfix">`, as appended by frozen
`components/chat/bubbles.ts` lines 7979–7982. The original helper
`helpers/dom/clearfix.ts` at the pinned commit creates that span. The initial
comparator and candidate both omitted it; their DOM has been corrected against
the upstream renderer, with the frozen source/SCSS files unchanged. Native
`base.scss` sets `clear: both`, and `_chatBubble.scss` enables the table display
only immediately after `.time`. This reserves the timestamp row when a full
last text line makes its floated placeholder wrap, preserving the bottom inset.

Day/night base colors are frozen from `helpers/themeController.ts` colorMap.
Day outgoing fill `#e3fee0` is computed from DEFAULT_THEME's `0x5CA853`,
`mixColors(accent, white, .12)` and the controller's +63 HSL saturation step.
Night outgoing fill is `0x8774E1` at opacity 1. Dynamic wallpaper highlighting
is represented by explicit fixed fixture colors. The shell wallpaper uses the
original `pattern.svg` over frozen local gradients; it does not claim to
reproduce the original animated canvas compositor.

The shell retains a local six-file Roboto set (regular/medium Latin, extended
Latin, Cyrillic). Candidate `local()` font sources are removed to avoid relying
on a workstation-installed Roboto version. Candidate font declarations also
correct the original `U + 0400` syntax to `U+0400`: Sass otherwise evaluates
the spaced form as arithmetic and emits an invalid CSS unicode range. All
nine declarations preserve their exact intended character sets. The frozen
original reference styles are unchanged. Text and labels are plain text.
Native interaction code adds keyboard focus outlines, disabled styling,
editable text hooks, an Add Button control and reduced-motion support.
Ripple styling is native-inspired, with local pointer handling and complete
timer cleanup; it does not import Telegram's settings-dependent ripple helper.

GPL-3.0-only and the original project copyright notices remain applicable to
the copied tweb source. Root `LICENSE` and `upstream/LICENSE` are retained.
The bundled Solid runtime has its separate MIT notice. Roboto font binaries
come unchanged from upstream's `public/assets/fonts`; the shell does not claim
authorship of those files.

All six retained WOFF2 binaries were inspected through FreeType's OpenType
name-table API: they identify version `2.137; 2017`, copyright Google 2011,
and Apache License 2.0 in name ID 14. See
[the font notice](../notices/Roboto-NOTICE.md),
[exact binary metadata](../notices/Roboto-metadata.json), and
[the complete canonical license](../notices/LICENSE-Roboto-Apache-2.0.txt).
This result concerns these six binary files; it is not inferred from newer
Roboto versions or from the tweb project's GPL license.
