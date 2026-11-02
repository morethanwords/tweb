import type {DraftMessage} from '@layer';

/** a plain draft, with what a test needs of it */
export function draftMessage(overrides: Partial<DraftMessage.draftMessage> = {}): DraftMessage.draftMessage {
  return {
    _: 'draftMessage',
    pFlags: {},
    date: 1,
    message: '',
    ...overrides
  };
}
