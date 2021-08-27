export default function simulateEvent(elem: HTMLElement, name: string) {
  const event = new Event(name, {bubbles: true, cancelable: true});
  elem.dispatchEvent(event);
}
