export default function simulateEvent(elem: EventTarget, name: string) {
  const event = new Event(name, {bubbles: true, cancelable: true});
  elem.dispatchEvent(event);
}
