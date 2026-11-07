import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

// A widget's state, changed by the bot (updateMessageWidgetData) or a poll of a shared widget: kept in the loaded
// message, which then goes through the edit path its bubble hands to the running widget.
describe('AppMessagesManager.setMessagesWidgetData', () => {
  function setup(media: any) {
    const manager = new AppMessagesManager() as any;
    const message = {_: 'message', id: 7, media};
    const edits: any[] = [];
    Object.assign(manager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => peerId === 100 && mid === 7 ? message : undefined,
      onUpdateEditMessage: (update: any) => edits.push(update)
    });
    return {manager: manager as AppMessagesManager, message, edits};
  }

  it('a field not given stays, an empty string clears it, and the edit path runs', () => {
    const {manager, message, edits} = setup({_: 'messageMediaWidget', pFlags: {}, chat_data: 'c1', public_data: 'p1', public_data_hash: '1'});
    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}], {chat_data: 'c2'});
    expect(message.media).toMatchObject({chat_data: 'c2', public_data: 'p1', public_data_hash: '1'});

    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}], {public_data: 'p2', public_data_hash: '2', chat_data: ''});
    expect(message.media).toEqual({_: 'messageMediaWidget', pFlags: {}, public_data: 'p2', public_data_hash: '2'});

    // an emptied shared state keeps its hash: it is what the next poll asks with
    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}], {public_data: '', public_data_hash: '3'});
    expect(message.media).toEqual({_: 'messageMediaWidget', pFlags: {}, public_data_hash: '3'});
    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}], {public_data: ''});
    expect(message.media).toEqual({_: 'messageMediaWidget', pFlags: {}});
    expect(edits.map((update) => update.message)).toEqual([message, message, message, message]);
  });

  it('a message that is not loaded, or not a widget, is left alone', () => {
    const {manager, edits} = setup({_: 'messageMediaPhoto', pFlags: {}});
    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}, {peerId: 100 as PeerId, mid: 8}], {chat_data: 'c'});
    expect(edits).toEqual([]);
  });

  it('under an anchored ephemeral message standing in for it, it goes into the message Revert puts back', () => {
    // * the stand-in shows a photo; the widget is in what was kept of the message
    const {manager, message, edits} = setup({_: 'messageMediaPhoto', pFlags: {}});
    Object.assign(message, {pFlags: {ephemeral_anchored: true}});
    const widget = {_: 'messageMediaWidget', pFlags: {}, chat_data: 'c1'};
    const anchored = {ephemeralId: 3, mid: 7, receiverId: 1, backup: {message: '', media: widget}, content: {message: 'instead'}};
    (manager as any).anchoredEphemerals = new Map([[100, new Map([[3, anchored]])]]);

    manager.setMessagesWidgetData([{peerId: 100 as PeerId, mid: 7}], {chat_data: 'c2'});
    expect(message.media).toEqual({_: 'messageMediaPhoto', pFlags: {}});
    // * nothing to redraw: the stand-in is what shows
    expect(edits).toEqual([]);

    let restored: any;
    vi.spyOn(manager as any, 'replaceMessageContentInPlace').mockImplementation((target: any, content: any) => restored = content);
    (manager as any).revertAnchoredEphemeral(100, 3);
    expect(restored.media).toEqual({_: 'messageMediaWidget', pFlags: {}, chat_data: 'c2'});
  });
});

// Messages deleted together: their widgets' storage goes once for the whole batch, never once per message (each pass
// reads the account's remembered heights and stored keys).
describe('AppMessagesManager.onUpdateDeleteMessages and widget storage', () => {
  function setup() {
    const manager = new AppMessagesManager() as any;
    const appWidgetsManager = {deleteWidgetStorage: vi.fn(), deleteWidgetStorageByLegacyMids: vi.fn()};
    const handleDeletedMessages = vi.fn(() => ({count: 0, unread: 0, unreadMentions: 0, unreadReactions: 0, msgs: new Set(), byThreadKey: new Map()}));
    Object.assign(manager, {
      appWidgetsManager,
      handleDeletedMessages,
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      rootScope: {dispatchEvent: () => {}},
      getMessageByPeer: (): undefined => undefined,
      getHistoryMessagesStorage: () => new Map(),
      getHistoryStorage: () => ({history: new Set(), count: 0}),
      getDialogOnly: (): undefined => undefined,
      clearSearchCountersCache: () => {}
    });
    return {manager, appWidgetsManager, handleDeletedMessages};
  }

  it('a channel\'s batch: once, with every message of it', () => {
    const {manager, appWidgetsManager, handleDeletedMessages} = setup();
    manager.onUpdateDeleteMessages({_: 'updateDeleteChannelMessages', channel_id: 5, messages: [1, 2, 3], pts: 1, pts_count: 3});
    expect(handleDeletedMessages).toHaveBeenCalledOnce();
    expect(appWidgetsManager.deleteWidgetStorage).toHaveBeenCalledOnce();
    expect(appWidgetsManager.deleteWidgetStorage).toHaveBeenCalledWith((5 as ChatId).toPeerId(true), [1, 2, 3]);
    expect(appWidgetsManager.deleteWidgetStorageByLegacyMids).not.toHaveBeenCalled();
  });

  it('private chats\' and basic groups\' batch: once, by the account-wide ids, whichever chats they are of', () => {
    const {manager, appWidgetsManager} = setup();
    manager.onUpdateDeleteMessages({_: 'updateDeleteMessages', messages: [4, 5, 6], pts: 1, pts_count: 3, peerId: 100 as PeerId});
    expect(appWidgetsManager.deleteWidgetStorageByLegacyMids).toHaveBeenCalledOnce();
    expect(appWidgetsManager.deleteWidgetStorageByLegacyMids).toHaveBeenCalledWith([4, 5, 6], 100);
    expect(appWidgetsManager.deleteWidgetStorage).not.toHaveBeenCalled();
  });
});
