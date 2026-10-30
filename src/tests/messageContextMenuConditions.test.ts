import '@helpers/peerIdPolyfill';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {Chat, Message, MessageAction, MessageMedia, Poll, PollAnswer, User} from '@layer';
import canDeletePollAnswer from '@appManagers/utils/polls/canDeletePollAnswer';
import getGiftMessageSendAction, {canSendGiftToPeer} from '@appManagers/utils/messages/getGiftMessageSendAction';
import canLookupMessageAuthor from '@appManagers/utils/messages/canLookupMessageAuthor';
import getDocumentNameToCopy from '@appManagers/utils/docs/getDocumentNameToCopy';
import getStickeredMedia from '@appManagers/utils/stickers/getStickeredMedia';
import getNoForwardsInfo from '@components/chat/noForwardsInfo';
import {REPLIES_PEER_ID, SERVICE_PEER_ID} from '@appManagers/constants';

const MY_ID = (1).toPeerId(false);

describe('the message menu: deleting a poll option', () => {
  const makePoll = (creator?: boolean) => ({_: 'poll', id: 1, pFlags: {creator: creator || undefined}} as any as Poll.poll);
  const makeAnswer = (answer: Partial<PollAnswer.pollAnswer>) => ({
    _: 'pollAnswer',
    text: {_: 'textWithEntities', text: 'Option', entities: []},
    option: new Uint8Array([1]),
    ...answer
  } as PollAnswer.pollAnswer);

  it('never offers an option the poll was made with', () => {
    expect(canDeletePollAnswer({poll: makePoll(true), answer: makeAnswer({}), myId: MY_ID, now: 1000})).toBe(false);
  });

  it('lets the creator delete an added option at any time', () => {
    const answer = makeAnswer({date: 100, added_by: {_: 'peerUser', user_id: 2}});
    expect(canDeletePollAnswer({poll: makePoll(true), answer, myId: MY_ID, now: 1e6})).toBe(true);
  });

  it('lets the one who added it delete it within the period only', () => {
    const answer = makeAnswer({date: 1000, added_by: {_: 'peerUser', user_id: 1}});
    expect(canDeletePollAnswer({poll: makePoll(), answer, myId: MY_ID, now: 1299, deletePeriod: 300})).toBe(true);
    expect(canDeletePollAnswer({poll: makePoll(), answer, myId: MY_ID, now: 1300, deletePeriod: 300})).toBe(false);
    // * desktop's default period, when the app config does not name one
    expect(canDeletePollAnswer({poll: makePoll(), answer, myId: MY_ID, now: 1299})).toBe(true);
  });

  it('does not let anyone else delete it', () => {
    const answer = makeAnswer({date: 1000, added_by: {_: 'peerUser', user_id: 2}});
    expect(canDeletePollAnswer({poll: makePoll(), answer, myId: MY_ID, now: 1001})).toBe(false);
  });
});

describe('the message menu: sending a gift from a gift message', () => {
  const user = (pFlags: User.user['pFlags'] = {}, id: UserId = 2) => ({_: 'user', id, pFlags} as any as User.user);
  const channel = (pFlags: Chat.channel['pFlags'] = {}) => ({_: 'channel', id: 3, pFlags} as any as Chat.channel);
  const service = (action: Partial<MessageAction>, out?: boolean) => ({
    _: 'messageService',
    pFlags: {out: out || undefined},
    action: {pFlags: {}, ...action}
  } as any as Message.messageService);

  it('offers another gift under one I sent and a gift under one I got', () => {
    const peer = user();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionStarGift'}, true), peer, myId: MY_ID})).toBe('another');
    expect(getGiftMessageSendAction({message: service({_: 'messageActionGiftPremium'}), peer, myId: MY_ID})).toBe('send');
    expect(getGiftMessageSendAction({message: service({_: 'messageActionGiftTon'}), peer, myId: MY_ID})).toBe('send');
  });

  it('turns an upgrade around: the one who upgraded my gift is its receiver', () => {
    const upgrade = {_: 'messageActionStarGiftUnique', pFlags: {upgrade: true}} as Partial<MessageAction>;
    expect(getGiftMessageSendAction({message: service(upgrade, false), peer: user(), myId: MY_ID})).toBe('another');
    expect(getGiftMessageSendAction({message: service(upgrade, true), peer: user(), myId: MY_ID})).toBe('send');
  });

  it('offers nothing for a giveaway, a prize, a birthday or a plain theme', () => {
    const peer = user();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionGiftCode', boost_peer: {_: 'peerChannel', channel_id: 3}}), peer, myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionGiftCode'}), peer, myId: MY_ID})).toBe('send');
    expect(getGiftMessageSendAction({message: service({_: 'messageActionPrizeStars'}), peer, myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionSuggestBirthday'}), peer, myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionSetChatTheme', theme: {_: 'chatTheme', emoticon: '🎄'}}), peer, myId: MY_ID})).toBeUndefined();
  });

  it('offers only another gift of mine under a gift theme or an offer', () => {
    const theme = {_: 'messageActionSetChatTheme', theme: {_: 'chatThemeUniqueGift'}} as Partial<MessageAction>;
    expect(getGiftMessageSendAction({message: service(theme, true), peer: user(), myId: MY_ID})).toBe('another');
    expect(getGiftMessageSendAction({message: service(theme, false), peer: user(), myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: service({_: 'messageActionStarGiftPurchaseOffer'}, false), peer: user(), myId: MY_ID})).toBeUndefined();
  });

  it('offers nothing to a deleted account or the notifications, and no new gift to whom none goes', () => {
    const gift = service({_: 'messageActionStarGift'}, true);
    expect(getGiftMessageSendAction({message: gift, peer: user({deleted: true}), myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: gift, peer: user({}, SERVICE_PEER_ID.toUserId() as UserId), myId: MY_ID})).toBeUndefined();
    const got = service({_: 'messageActionStarGift'});
    expect(getGiftMessageSendAction({message: got, peer: user({bot: true}), myId: MY_ID})).toBeUndefined();
    expect(getGiftMessageSendAction({message: got, peer: user(), myId: MY_ID, premiumPurchaseBlocked: true})).toBeUndefined();
  });

  it('sends gifts to people and to channels I do not own', () => {
    expect(canSendGiftToPeer(user(), MY_ID)).toBe(true);
    expect(canSendGiftToPeer(user({self: true}, 1), MY_ID)).toBe(false);
    expect(canSendGiftToPeer(user({support: true}), MY_ID)).toBe(false);
    expect(canSendGiftToPeer(user({}, REPLIES_PEER_ID.toUserId() as UserId), MY_ID)).toBe(false);
    expect(canSendGiftToPeer(channel({broadcast: true}), MY_ID)).toBe(true);
    expect(canSendGiftToPeer(channel({broadcast: true, creator: true}), MY_ID)).toBe(false);
    expect(canSendGiftToPeer(channel({megagroup: true}), MY_ID)).toBe(false);
  });
});

describe('the message menu: why a message cannot be forwarded', () => {
  it('names the chat by its kind', () => {
    expect(getNoForwardsInfo({peer: {_: 'channel', pFlags: {broadcast: true}} as any as Chat}).langPackKey).toBe('ForwardsRestrictedInfoChannel');
    expect(getNoForwardsInfo({peer: {_: 'channel', pFlags: {megagroup: true}} as any as Chat}).langPackKey).toBe('ForwardsRestrictedInfoGroup');
    expect(getNoForwardsInfo({peer: {_: 'chat', pFlags: {}} as any as Chat}).langPackKey).toBe('ForwardsRestrictedInfoGroup');
    expect(getNoForwardsInfo({peer: {_: 'user', pFlags: {bot: true}} as any as User}).langPackKey).toBe('ForwardsRestrictedInfoBot');
  });

  it('says who protected a private chat', () => {
    const peer = {_: 'user', pFlags: {}} as any as User;
    expect(getNoForwardsInfo({peer, userFullFlags: {noforwards_my_enabled: true, noforwards_peer_enabled: true}})).toEqual({langPackKey: 'ForwardsRestrictedInfoUserBecauseYou'});
    expect(getNoForwardsInfo({peer, userFullFlags: {noforwards_peer_enabled: true}})).toEqual({langPackKey: 'ForwardsRestrictedInfoUserBecauseUser', withName: true});
    expect(getNoForwardsInfo({peer})).toEqual({langPackKey: 'ForwardsRestrictedInfoUser'});
  });
});

describe('the message menu: the author of a channel\'s direct message', () => {
  const message = (fromId: PeerId, pFlags: Message.message['pFlags'] = {}) => ({_: 'message', fromId, pFlags} as any as MyMessage);
  const channelPeerId = (3).toPeerId(true);

  it('is asked for by an admin, of a message posted as the channel', () => {
    expect(canLookupMessageAuthor(message(channelPeerId), true)).toBe(true);
    expect(canLookupMessageAuthor(message(channelPeerId), false)).toBe(false);
    expect(canLookupMessageAuthor(message((2).toPeerId(false)), true)).toBe(false);
  });

  it('is not asked for a message being sent or a service one', () => {
    expect(canLookupMessageAuthor(message(channelPeerId, {is_outgoing: true}), true)).toBe(false);
    expect(canLookupMessageAuthor({...message(channelPeerId), _: 'messageService'} as any as MyMessage, true)).toBe(false);
  });
});

describe('the message menu: copying a file name', () => {
  const doc = (type: MyDocument['type'], attributes: MyDocument['attributes'] = []) => ({_: 'document', type, attributes} as any as MyDocument);
  const fileName = {_: 'documentAttributeFilename', file_name: 'report.pdf'} as const;

  it('copies a file\'s own name', () => {
    expect(getDocumentNameToCopy(doc(undefined, [fileName]))).toBe('report.pdf');
    expect(getDocumentNameToCopy(doc('pdf', [fileName]))).toBe('report.pdf');
    expect(getDocumentNameToCopy(doc(undefined))).toBeUndefined();
  });

  it('copies a song\'s performer and title', () => {
    const audio = (title?: string, performer?: string) => ({_: 'documentAttributeAudio', pFlags: {}, duration: 1, title, performer} as const);
    expect(getDocumentNameToCopy(doc('audio', [fileName, audio('Song', 'Band')]))).toBe('Band – Song');
    expect(getDocumentNameToCopy(doc('audio', [fileName, audio('Song')]))).toBe('Song');
    expect(getDocumentNameToCopy(doc('audio', [fileName, audio()]))).toBe('report.pdf');
  });

  it('copies nothing of what is shown rather than named', () => {
    for(const type of ['sticker', 'gif', 'video', 'round', 'voice'] as const) {
      expect(getDocumentNameToCopy(doc(type, [fileName]))).toBeUndefined();
    }
  });
});

describe('the message menu: attached stickers', () => {
  it('finds the photo or document with stickers put on it', () => {
    expect(getStickeredMedia({_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photo', id: 5, pFlags: {has_stickers: true}}} as any as MessageMedia)).toEqual({type: 'photo', id: 5});
    expect(getStickeredMedia({_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photo', id: 5, pFlags: {}}} as any as MessageMedia)).toBeUndefined();
    expect(getStickeredMedia({
      _: 'messageMediaDocument',
      pFlags: {},
      document: {_: 'document', id: 6, attributes: [{_: 'documentAttributeHasStickers'}]}
    } as any as MessageMedia)).toEqual({type: 'document', id: 6});
    expect(getStickeredMedia(undefined)).toBeUndefined();
  });
});
