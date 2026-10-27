/**
 * Lays a control out left to right in any language — media playback follows the tape, not the line.
 * `dir` turns its own layout, and with it (base.scss) the vars that move things along the line
 * (`--reflect`, the `--transform-origin-*` ones) and the `.icon-mirror` glyphs inside.
 */
export default function keepLeftToRight(element: HTMLElement) {
  element.dir = 'ltr';
}
