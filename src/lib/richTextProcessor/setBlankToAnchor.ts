export default function setBlankToAnchor(anchor: HTMLAnchorElement) {
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}
