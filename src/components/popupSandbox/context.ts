/*
 * What a story is handed when it opens.
 *
 * A story asks for a peer by KIND ("a channel", "a bot") rather than by id, so the same story can be
 * built from the fixtures or from the signed-in session's own dialogs. Everything the two modes
 * disagree about lives behind this interface; a story never learns which one it got.
 */

import type {Message} from '@layer';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {
  BOT_PEER_ID,
  CHANNEL_MID,
  CHANNEL_PEER_ID,
  CONTACT_PEER_ID,
  GROUP_PEER_ID,
  MEGAGROUP_PEER_ID,
  PRIVATE_MID,
  SELF_PEER_ID,
  channelMessage,
  chatStub,
  myStarGift,
  myUniqueStarGift,
  textMessage
} from './fixtures';

export type StoryPeerKind = 'private' | 'group' | 'supergroup' | 'channel' | 'bot' | 'self';

export type PopupStoryContext = {
  /** False for the fixtures, true when the story is built from the signed-in session. */
  isLive: boolean,
  peer(kind: StoryPeerKind): PeerId,
  mid(kind?: StoryPeerKind): number,
  message(kind?: StoryPeerKind): Message.message,
  /** The chat controller a composer popup needs. Live: the one actually open. */
  chat(): any,
  gift(): MyStarGift,
  uniqueGift(): MyStarGift
};

const MOCK_PEERS: {[kind in StoryPeerKind]: PeerId} = {
  private: CONTACT_PEER_ID,
  group: GROUP_PEER_ID,
  supergroup: MEGAGROUP_PEER_ID,
  channel: CHANNEL_PEER_ID,
  bot: BOT_PEER_ID,
  self: SELF_PEER_ID
};

export const mockContext: PopupStoryContext = {
  isLive: false,
  peer: (kind) => MOCK_PEERS[kind],
  mid: (kind) => (kind === 'channel' ? CHANNEL_MID : PRIVATE_MID),
  message: (kind) => (kind === 'channel' ? channelMessage : textMessage),
  chat: () => chatStub,
  gift: () => myStarGift,
  uniqueGift: () => myUniqueStarGift
};

/** What a live context could not find in the session; the panel shows it so the gap is not silent. */
export type LiveContextGaps = StoryPeerKind[];

function pickPeers(dialogs: {peerId: PeerId, top_message?: number}[]) {
  const found: Partial<Record<StoryPeerKind, {peerId: PeerId, mid: number}>> = {};

  for(const dialog of dialogs) {
    const {peerId} = dialog;
    const entry = {peerId, mid: dialog.top_message};
    const peer = apiManagerProxy.getPeer(peerId);
    if(!peer) continue;

    let kind: StoryPeerKind;
    if(peerId === rootScope.myId) kind = 'self';
    else if(peer._ === 'user') kind = peer.pFlags?.bot ? 'bot' : 'private';
    else if(peer._ === 'chat') kind = 'group';
    else if(peer._ === 'channel') kind = peer.pFlags?.megagroup ? 'supergroup' : 'channel';
    else continue;

    found[kind] ??= entry;
  }

  return found;
}

/**
 * Builds a context out of the running session: the currently open chat wins for its own kind, the
 * rest come from the dialog list. Kinds the account simply has none of (no channels, no bots) fall
 * back to the fixtures and are reported in `gaps`.
 */
export async function createLiveContext(): Promise<{context: PopupStoryContext, gaps: LiveContextGaps}> {
  const {default: appImManager} = await import('@lib/appImManager');
  const managers = rootScope.managers;

  const {dialogs} = await managers.dialogsStorage.getDialogs({limit: 200}) as any;
  const found = pickPeers(dialogs || []);

  // The chat on screen is the one the user is looking at — prefer it for whatever kind it is.
  const openChat = appImManager.chat;
  const openPeerId = openChat?.peerId;
  if(openPeerId) {
    const openDialog = (dialogs || []).find((dialog: any) => dialog.peerId === openPeerId);
    const openKind = Object.keys(pickPeers([{peerId: openPeerId, top_message: openDialog?.top_message}]))[0] as StoryPeerKind;
    if(openKind) found[openKind] = {peerId: openPeerId, mid: openDialog?.top_message};
  }

  found.self ??= {peerId: rootScope.myId, mid: undefined};

  const gaps = (Object.keys(MOCK_PEERS) as StoryPeerKind[]).filter((kind) => !found[kind]);

  const gifts = await managers.appGiftsManager
  .getProfileGifts({peerId: rootScope.myId, limit: 20})
  .catch((): undefined => undefined);
  const ownGifts: MyStarGift[] = gifts?.gifts || [];
  const ownUnique = ownGifts.find((gift) => gift.raw._ === 'starGiftUnique');

  const resolve = (kind: StoryPeerKind = 'private') => found[kind];

  return {
    gaps,
    context: {
      isLive: true,
      peer: (kind) => resolve(kind)?.peerId ?? mockContext.peer(kind),
      mid: (kind) => resolve(kind)?.mid ?? mockContext.mid(kind),
      message: (kind) => {
        const entry = resolve(kind);
        const message = entry && apiManagerProxy.getMessageByPeer(entry.peerId, entry.mid);
        return (message as Message.message) ?? mockContext.message(kind);
      },
      // The real chat controller, so a composer popup sends into the chat the user has open.
      chat: () => openChat ?? mockContext.chat(),
      gift: () => ownGifts[0] ?? mockContext.gift(),
      uniqueGift: () => ownUnique ?? mockContext.uniqueGift()
    }
  };
}
