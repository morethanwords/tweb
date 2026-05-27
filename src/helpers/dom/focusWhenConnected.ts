/**
 * Calls `el.focus()` once the element is actually in the DOM.
 *
 * Solid's `onMount` (and `fastRaf` / `setTimeout(..., 0)` from inside it) can
 * fire BEFORE the element is attached when the component lives inside a
 * transition with `mode="outin"` — the new component instance is created as
 * soon as the source signal updates, but its node is only inserted after the
 * outgoing element finishes its exit. `HTMLElement.focus()` on a detached node
 * is silently ignored, so naive `input.focus()` from `onMount` doesn't work
 * for any auth card reached via a card-to-card transition.
 *
 * This helper polls per animation frame until `isConnected` flips true, then
 * focuses. If the element is already attached on first call (e.g. initial
 * render with `appear={false}`), focus runs synchronously on the next frame.
 *
 * Pass `signal: () => boolean` to cancel — useful when the host card may be
 * unmounted before it ever attaches (e.g. user clicks back during enter).
 *
 * Returns a cancel function.
 */
export default function focusWhenConnected(
  el: HTMLElement,
  signal?: () => boolean
): () => void {
  let cancelled = false;
  let rafId = 0;

  const tick = () => {
    if(cancelled || (signal && !signal())) return;
    if(el.isConnected) {
      el.focus();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
