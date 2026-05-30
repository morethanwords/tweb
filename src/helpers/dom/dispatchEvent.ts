export const getSimulatedEvent = (name: string) => new Event(name, {bubbles: true, cancelable: true});

export default function simulateEvent(elem: EventTarget, name: string) {
  const event = getSimulatedEvent(name);
  elem.dispatchEvent(event);
}
