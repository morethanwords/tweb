/** Fades an element out from however visible it is now - midway through its own fade in, say - and keeps it unseen */
export default function fadeOutFromCurrent(element: Element, duration: number) {
  return element.animate(
    [{opacity: getComputedStyle(element).opacity}, {opacity: 0}],
    {duration, easing: 'ease-out', fill: 'forwards'}
  );
}
