import {
  ANCHOR_CALLBACKS,
  isAnchorCallback,
  makeAnchorMessage,
  processAnchorCallback
} from './anchor.mjs';

const CHAT_ID = -1001234567890;
const USER_ID = 1000000001;

function makeQuery(data, message = {chat: {id: CHAT_ID}}) {
  return {id: 'query-1', data, from: {id: USER_ID}, message};
}

function makeApi() {
  return {
    anchors: new Map(),
    sendMessage: vi.fn(async() => ({ephemeral_message_id: 7})),
    editEphemeralMessageText: vi.fn(async() => true),
    deleteEphemeralMessage: vi.fn(async() => true)
  };
}

describe('anchored ephemeral fixture', () => {
  test('posts an ordinary message whose button asks for the private version', () => {
    const message = makeAnchorMessage(CHAT_ID);
    expect(message.chat_id).toBe(CHAT_ID);
    expect(message.reply_markup.inline_keyboard[0][0].callback_data).toBe(ANCHOR_CALLBACKS.replace);
    expect(isAnchorCallback(ANCHOR_CALLBACKS.replace)).toBe(true);
    expect(isAnchorCallback('ephemeral-test')).toBe(false);
  });

  test('replaces the message the button is on, for the pressing user only', async() => {
    const api = makeApi();
    const result = await processAnchorCallback({...api, query: makeQuery(ANCHOR_CALLBACKS.replace)});

    expect(result).toEqual({type: 'replaced', ephemeralMessageId: 7});
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: CHAT_ID,
      ephemeral_message_parameters: {
        receiver_user_id: USER_ID,
        callback_query_id: 'query-1',
        replace_callback_query_message: true
      }
    }));
    expect(api.anchors.get(`${CHAT_ID}:${USER_ID}`)).toBe(7);
  });

  test('edits and then reverts the private version it sent', async() => {
    const api = makeApi();
    await processAnchorCallback({...api, query: makeQuery(ANCHOR_CALLBACKS.replace)});

    expect(await processAnchorCallback({...api, query: makeQuery(ANCHOR_CALLBACKS.edit)}))
    .toEqual({type: 'edited', ephemeralMessageId: 7});
    expect(api.editEphemeralMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: CHAT_ID,
      receiver_user_id: USER_ID,
      ephemeral_message_id: 7
    }));

    expect(await processAnchorCallback({...api, query: makeQuery(ANCHOR_CALLBACKS.revert)}))
    .toEqual({type: 'reverted', ephemeralMessageId: 7});
    expect(api.deleteEphemeralMessage).toHaveBeenCalledWith({
      chat_id: CHAT_ID,
      receiver_user_id: USER_ID,
      ephemeral_message_id: 7
    });
    expect(api.anchors.size).toBe(0);
  });

  test('falls back to the id the callback carries, and ignores a version it never sent', async() => {
    const api = makeApi();
    await processAnchorCallback({
      ...api,
      query: makeQuery(ANCHOR_CALLBACKS.revert, {chat: {id: CHAT_ID}, ephemeral_message_id: 9})
    });
    expect(api.deleteEphemeralMessage).toHaveBeenCalledWith(expect.objectContaining({ephemeral_message_id: 9}));

    expect(await processAnchorCallback({...api, query: makeQuery(ANCHOR_CALLBACKS.edit)}))
    .toEqual({type: 'ignored', reason: 'no-private-version'});
    expect(api.editEphemeralMessageText).not.toHaveBeenCalled();
  });
});
