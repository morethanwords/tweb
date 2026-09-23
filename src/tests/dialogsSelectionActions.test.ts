import {describe, expect, it} from 'vitest';
import getDialogsSelectionActions, {DialogSelectionState} from '@appManagers/utils/dialogs/dialogsSelectionActions';

const dialog = (state: Partial<DialogSelectionState> = {}): DialogSelectionState => ({
  pinned: false,
  unread: false,
  forum: false,
  muted: false,
  archived: false,
  self: false,
  ...state
});

describe('getDialogsSelectionActions', () => {
  it('offers nothing for an empty selection', () => {
    expect(getDialogsSelectionActions([])).toEqual({});
  });

  it('offers pinning while anything is unpinned', () => {
    expect(getDialogsSelectionActions([dialog({pinned: true}), dialog()])).toMatchObject({pin: true});
    expect(getDialogsSelectionActions([dialog({pinned: true}), dialog({pinned: true})])).toMatchObject({pin: false});
  });

  it('undoes muting and archiving off a single chat', () => {
    // Android's own asymmetry: one muted or one archived chat is enough for the whole selection
    // to be unmuted or unarchived, while pinning above is offered the other way round
    expect(getDialogsSelectionActions([dialog({muted: true, archived: true}), dialog()]))
    .toMatchObject({mute: false, archive: false});
    expect(getDialogsSelectionActions([dialog(), dialog()])).toMatchObject({mute: true, archive: true});
  });

  it('does not offer what our own chat cannot take', () => {
    const actions = getDialogsSelectionActions([dialog({self: true}), dialog()]);
    expect(actions.mute).toBeUndefined();
    expect(actions.archive).toBeUndefined();
    // it can still be pinned and deleted with the rest
    expect(actions).toMatchObject({pin: true, delete: true});
  });

  it('reads a selection with anything unread in it', () => {
    expect(getDialogsSelectionActions([dialog({unread: true}), dialog()])).toMatchObject({read: true});
  });

  it('marks unread only what can be marked', () => {
    // a forum has no unread mark to put back, so a read selection with one in it offers nothing
    expect(getDialogsSelectionActions([dialog(), dialog()])).toMatchObject({read: false});
    expect(getDialogsSelectionActions([dialog(), dialog({forum: true})]).read).toBeUndefined();
    // ... but it can still be read while it has something unread
    expect(getDialogsSelectionActions([dialog({unread: true}), dialog({forum: true})])).toMatchObject({read: true});
  });
});
