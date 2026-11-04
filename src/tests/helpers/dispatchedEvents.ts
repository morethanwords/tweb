import type {Mock} from 'vitest';

/** What a mocked `dispatchEvent` was given for the event, in order */
export default function dispatchedEvents(dispatchEvent: Mock, name: string) {
  return dispatchEvent.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);
}
