import '@helpers/peerIdPolyfill';
import {AppMessagesManager, RichMessagePayload} from '@appManagers/appMessagesManager';
import {Message, PageBlock, RichMessage} from '@layer';

const peerId = (42 as UserId).toPeerId(false);
const mid = 7;

function makeRichMessage(): RichMessage.richMessage {
  const blocks: PageBlock[] = [{
    _: 'pageBlockList',
    items: [
      {
        _: 'pageListItemText',
        pFlags: {checkbox: true},
        text: {_: 'textPlain', text: 'First'}
      },
      {
        _: 'pageListItemText',
        pFlags: {checkbox: true},
        text: {_: 'textPlain', text: 'Second'}
      }
    ]
  }];
  return {
    _: 'richMessage',
    pFlags: {},
    blocks,
    photos: [],
    documents: []
  };
}

function setup() {
  const manager = new AppMessagesManager();
  const richMessage = makeRichMessage();
  const message = {
    _: 'message',
    id: mid,
    mid,
    peerId,
    peer_id: {_: 'peerUser', user_id: 42},
    pFlags: {out: true},
    date: 0,
    message: '',
    rich_message: richMessage
  } as Message.message;
  const storage = new Map<number, Message.message>([[mid, message]]) as any;
  storage.key = `history_${peerId}`;
  const dispatchEvent = vi.fn();

  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    richMessages: new Map(),
    log: {error: vi.fn()}
  });
  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue(storage);
  vi.spyOn(manager, 'getMessageFromStorage').mockImplementation(
    (target: any, id: number) => target.get(id)
  );
  vi.spyOn(manager, 'modifyMessage').mockImplementation((target: any, callback: any) => {
    return callback(target) || target;
  });
  vi.spyOn(manager, 'canEditMessage').mockResolvedValue(true);
  const editMessage = vi.spyOn(manager, 'editMessage').mockResolvedValue();

  return {dispatchEvent, editMessage, manager, message};
}

describe('sent rich-message checklist manager', () => {
  test('optimistically accumulates rapid toggles into one debounced rich edit', async() => {
    vi.useFakeTimers();
    try {
      const {dispatchEvent, editMessage, manager, message} = setup();

      await manager.toggleRichMessageChecklist({
        peerId,
        mid,
        path: [0, 0],
        checked: true
      });
      await manager.toggleRichMessageChecklist({
        peerId,
        mid,
        path: [0, 1],
        checked: true
      });

      const list = message.rich_message.blocks[0] as PageBlock.pageBlockList;
      expect(list.items.map((item) => !!item.pFlags.checked)).toEqual([true, true]);
      expect(dispatchEvent).toHaveBeenCalledTimes(2);
      expect(editMessage).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(349);
      expect(editMessage).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(editMessage).toHaveBeenCalledOnce();

      const payload = editMessage.mock.calls[0][2].richMessage as RichMessagePayload;
      const sentList = payload.input.blocks[0] as PageBlock.pageBlockList;
      expect(sentList.items.map((item) => !!item.pFlags.checked)).toEqual([true, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('rolls the optimistic page back when the debounced edit fails', async() => {
    vi.useFakeTimers();
    try {
      const {editMessage, manager, message} = setup();
      editMessage.mockRejectedValueOnce({type: 'MESSAGE_EDIT_FORBIDDEN'});

      await manager.toggleRichMessageChecklist({
        peerId,
        mid,
        path: [0, 0],
        checked: true
      });
      await vi.advanceTimersByTimeAsync(350);

      const list = message.rich_message.blocks[0] as PageBlock.pageBlockList;
      expect(list.items.map((item) => !!item.pFlags.checked)).toEqual([false, false]);
    } finally {
      vi.useRealTimers();
    }
  });
});

const empty = {_: 'textEmpty'} as const;
const serverBlocks: PageBlock[] = [
  {_: 'pageBlockParagraph', text: {_: 'textAutoUrl', text: {_: 'textPlain', text: 'https://example.com'}}},
  {_: 'pageBlockMap', geo: {_: 'geoPoint', access_hash: '0', lat: 20, long: 0}, zoom: 2, w: 400, h: 200,
    caption: {_: 'pageCaption', text: empty, credit: empty}},
  {_: 'pageBlockOrderedList', pFlags: {}, items: [{_: 'pageListOrderedItemText', pFlags: {}, num: '1',
    text: {_: 'textPlain', text: 'Numbered'}}]}
];

for(const block of serverBlocks) test(`persists checkbox edits through real conversion and validation beside ${block._}`, async() => {
  vi.useFakeTimers();
  try {
    const {manager, message, editMessage} = setup();
    editMessage.mockRestore();
    message.rich_message.blocks.push(block);
    const invokeApi = vi.fn().mockResolvedValue({_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0});
    Object.assign(manager, {
      apiManager: {getAppConfig: async() => ({}), invokeApi},
      appPeersManager: {getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'})},
      apiUpdatesManager: {processUpdateMessage: vi.fn()}
    });
    await manager.toggleRichMessageChecklist({peerId, mid, path: [0, 0], checked: true});
    await vi.advanceTimersByTimeAsync(350);
    expect(invokeApi).toHaveBeenCalledTimes(1);
    expect(invokeApi.mock.calls[0][0]).toBe('messages.editMessage');
    const input = invokeApi.mock.calls[0][1].rich_message;
    expect(input.blocks[0].items[0].pFlags.checked).toBe(true);
    expect(JSON.stringify(input)).not.toMatch(/textAutoUrl|"_":"pageBlockMap"|"num"/);
    expect((message.rich_message.blocks[0] as PageBlock.pageBlockList).items[0].pFlags.checked).toBe(true);
    // The received server object is not rewritten into the outgoing representation.
    expect(message.rich_message.blocks[1]).toBe(block);
  } finally {vi.useRealTimers();}
});
