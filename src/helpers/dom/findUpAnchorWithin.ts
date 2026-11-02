/** The link a press inside `container` landed on: the link handles that press itself, not the container */
export default function findUpAnchorWithin(target: EventTarget, container: Element) {
  const anchor = (target as Element)?.closest?.('a');
  return anchor && container.contains(anchor) ? anchor : undefined;
}
