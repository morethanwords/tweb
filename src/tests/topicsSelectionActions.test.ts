import {describe, expect, it} from 'vitest';
import getTopicsSelectionActions, {TopicSelectionState} from '@appManagers/utils/dialogs/topicsSelectionActions';

const topic = (state: Partial<TopicSelectionState> = {}): TopicSelectionState => ({
  unread: false,
  muted: false,
  pinned: false,
  closed: false,
  hidden: false,
  general: false,
  canManage: true,
  canDelete: true,
  ...state
});

describe('getTopicsSelectionActions', () => {
  it('offers nothing for an empty selection', () => {
    expect(getTopicsSelectionActions([])).toEqual({});
  });

  it('only ever reads, since a topic has no unread mark to put back', () => {
    expect(getTopicsSelectionActions([topic({unread: true}), topic()])).toMatchObject({read: true});
    expect(getTopicsSelectionActions([topic(), topic()]).read).toBeUndefined();
  });

  it('undoes muting off a single topic', () => {
    expect(getTopicsSelectionActions([topic({muted: true}), topic()])).toMatchObject({mute: false});
    expect(getTopicsSelectionActions([topic(), topic()])).toMatchObject({mute: true});
  });

  it('offers pinning for one topic at a time', () => {
    expect(getTopicsSelectionActions([topic()])).toMatchObject({pin: true});
    expect(getTopicsSelectionActions([topic({pinned: true})])).toMatchObject({pin: false});
    // two of a kind have nowhere to go: a pin is a move to the top of the list
    expect(getTopicsSelectionActions([topic(), topic()]).pin).toBeUndefined();
    expect(getTopicsSelectionActions([topic({pinned: true}), topic()]).pin).toBeUndefined();
  });

  it('does not offer what we may not manage', () => {
    const actions = getTopicsSelectionActions([topic({canManage: false})]);
    expect(actions.pin).toBeUndefined();
    expect(actions.close).toBeUndefined();
    expect(actions.hide).toBeUndefined();
  });

  it('closes and reopens only when it is about all of them', () => {
    expect(getTopicsSelectionActions([topic(), topic()])).toMatchObject({close: true});
    expect(getTopicsSelectionActions([topic({closed: true}), topic({closed: true})])).toMatchObject({close: false});
    expect(getTopicsSelectionActions([topic({closed: true}), topic()]).close).toBeUndefined();
  });

  it('hides the General topic, and only it, and only on its own', () => {
    expect(getTopicsSelectionActions([topic({general: true})])).toMatchObject({hide: true});
    expect(getTopicsSelectionActions([topic({general: true, hidden: true})])).toMatchObject({hide: false});
    expect(getTopicsSelectionActions([topic({general: true}), topic()]).hide).toBeUndefined();
    expect(getTopicsSelectionActions([topic()]).hide).toBeUndefined();
  });

  it('leaves a hidden topic out of the order it is not in', () => {
    // hidden means out of the list: it is neither pinned nor closed until it is shown again
    const actions = getTopicsSelectionActions([topic({general: true, hidden: true})]);
    expect(actions.pin).toBeUndefined();
    expect(actions.close).toBeUndefined();
  });

  it('deletes only when every one of them can be', () => {
    expect(getTopicsSelectionActions([topic(), topic()])).toMatchObject({delete: true});
    // the General topic is a part of the forum itself
    expect(getTopicsSelectionActions([topic({general: true, canDelete: false}), topic()]).delete).toBeUndefined();
  });
});
