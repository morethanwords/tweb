import '@helpers/peerIdPolyfill';
import AppGiftsManager from '@appManagers/appGiftsManager';
import {Message, MessageAction, StarGift, TextWithEntities} from '@layer';

const MY_ID = 1 as PeerId;
const OWNER_ID = 2 as PeerId;

function makeManager() {
  const manager = new AppGiftsManager() as any;
  Object.assign(manager, {
    rootScope: {myId: MY_ID},
    appDocsManager: {saveDoc: (doc: any) => doc},
    wearingGiftSlug: undefined
  });
  return manager;
}

function makeUnique(originalMessage?: TextWithEntities): StarGift.starGiftUnique {
  return {
    _: 'starGiftUnique',
    pFlags: {},
    id: '1',
    title: 'Gift',
    slug: 'gift-1',
    num: 1,
    attributes: [
      // wrapGift reads the model attribute for the sticker
      {_: 'starGiftAttributeModel', name: 'model', document: {_: 'document', id: '1'}, rarity_permille: 1},
      ...(originalMessage ? [{
        _: 'starGiftAttributeOriginalDetails',
        pFlags: {},
        date: 1,
        message: originalMessage
      }] : [])
    ] as any,
    availability_issued: 1,
    availability_total: 1
  } as StarGift.starGiftUnique;
}

function makeMessage(action: MessageAction.messageActionStarGiftUnique): Message.messageService {
  return {
    _: 'messageService',
    pFlags: {},
    id: 10,
    peerId: OWNER_ID,
    peer_id: {_: 'peerUser', user_id: OWNER_ID as UserId},
    date: 1,
    action
  } as Message.messageService;
}

const text = (value: string): TextWithEntities => ({_: 'textWithEntities', text: value, entities: []});

describe('layer 229 star gift resale details', () => {
  it('shows the message the buyer attached to the resale', async() => {
    const manager = makeManager();
    const wrapped = await manager.wrapGiftFromMessage(makeMessage({
      _: 'messageActionStarGiftUnique',
      pFlags: {},
      gift: makeUnique(text('original engraving')),
      message: text('bought this for you')
    }));

    expect(wrapped.saved.message).toEqual(text('bought this for you'));
  });

  it('keeps the gift original engraving when the resale carried no message', async() => {
    const manager = makeManager();
    const wrapped = await manager.wrapGiftFromMessage(makeMessage({
      _: 'messageActionStarGiftUnique',
      pFlags: {},
      gift: makeUnique(text('original engraving'))
    }));

    expect(wrapped.saved.message).toEqual(text('original engraving'));
  });

  it('carries the buyer choice to stay unnamed', async() => {
    const manager = makeManager();
    const hidden = await manager.wrapGiftFromMessage(makeMessage({
      _: 'messageActionStarGiftUnique',
      pFlags: {name_hidden: true},
      gift: makeUnique()
    }));
    const named = await manager.wrapGiftFromMessage(makeMessage({
      _: 'messageActionStarGiftUnique',
      pFlags: {},
      gift: makeUnique()
    }));

    expect(hidden.saved.pFlags.name_hidden).toBe(true);
    expect(named.saved.pFlags.name_hidden).toBeUndefined();
  });
});
