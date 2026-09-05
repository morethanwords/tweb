# Solid message text

This directory is the reactive text boundary used while the outer chat bubble
is still imperative.

- `createSolidMessageText` mounts one Solid owner into an existing message
  element. `update`, `setPolicy`, `setDisplay` and `finalize` never replace that
  owner or the outer bubble.
- `SolidInlineText` is the shared leaf for ordinary messages and Instant View
  rich-text leaves. Rich layouts can pass a local `visibleGraphemes` budget
  from their own page-level reveal plan.
- `TextRevealModel` is DOM- and scroll-independent. Layout changes are reported
  through callbacks so the bubble viewport remains the sole scroll owner.
- Translation is selected outside this layer and is accepted only after final
  for the matching source revision.

## Transitional limitation

Entity rendering is still delegated to `wrapRichText`. The Solid owner and
leaf element stay mounted, but a formatted rewrite replaces that leaf's
children. Plain append-only streaming uses an incremental text-node fast path,
and remaining formatted replacements are capped to 20 frames per second.
Moving entity nodes to native keyed Solid tokens can remove that last leaf
replacement later without changing this public controller/reveal contract.
